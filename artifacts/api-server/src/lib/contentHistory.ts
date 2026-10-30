import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import {
  db,
  contentFileVersionsTable,
  type ContentFile,
  type ContentFileVersionSnapshot,
} from "@workspace/db";

type HistoryExecutor = Pick<typeof db, "select" | "insert">;

const execFileAsync = promisify(execFile);
const REPOSITORY_URL =
  "https://github.replit.internal/jfftck/personal-files";
const MAIN_BRANCH = "main";

export type FileHistoryAction =
  | "baseline"
  | "created"
  | "updated"
  | "renamed"
  | "moved"
  | "trashed"
  | "restored";

export type FileHistoryChange = {
  file: ContentFile;
  action: FileHistoryAction;
  previous?: ContentFile;
};

export type FileHistoryEntry = {
  id: string;
  fileId: string;
  versionNumber: number;
  action: FileHistoryAction;
  snapshot: ContentFileVersionSnapshot;
  gitPath: string;
  createdAt: Date;
};

export class ContentHistoryError extends Error {
  constructor() {
    super("Git history could not be saved, so the file change was not applied.");
    this.name = "ContentHistoryError";
  }
}

let historyQueue = Promise.resolve();

export function withContentHistoryLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = historyQueue.then(operation);
  historyQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function snapshotOf(file: ContentFile): ContentFileVersionSnapshot {
  return {
    name: file.name,
    folderPath: file.folderPath,
    contentDate: file.contentDate,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    objectPath: file.objectPath,
    sourceUrl: file.sourceUrl,
    posterUrl: file.posterUrl,
    isPublished: file.isPublished,
    deletedAt: file.deletedAt?.toISOString() ?? null,
  };
}

async function runGit(
  args: string[],
  cwd?: string,
): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return result.stdout.trim();
}

async function pushEntriesToGit(
  entries: FileHistoryEntry[],
): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "personal-files-history-"),
  );
  try {
    await runGit(["clone", REPOSITORY_URL, directory]);
    await runGit(["config", "user.name", "Personal Files History"], directory);
    await runGit(
      ["config", "user.email", "personal-files-history@users.noreply.github.com"],
      directory,
    );

    for (const entry of entries) {
      const relativePath = entry.gitPath;
      const destination = path.join(directory, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(
        destination,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            id: entry.id,
            fileId: entry.fileId,
            versionNumber: entry.versionNumber,
            action: entry.action,
            createdAt: entry.createdAt.toISOString(),
            file: entry.snapshot,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }

    await runGit(["add", "history"], directory);
    await runGit(
      [
        "commit",
        "-m",
        entries.length === 1
          ? `Record ${entries[0].action} revision`
          : `Record ${entries.length} content revisions`,
      ],
      directory,
    );
    const commitSha = await runGit(["rev-parse", "HEAD"], directory);

    try {
      await runGit(["push", "origin", `HEAD:${MAIN_BRANCH}`], directory);
    } catch {
      await runGit(["fetch", "origin", MAIN_BRANCH], directory);
      await runGit(
        ["rebase", `origin/${MAIN_BRANCH}`],
        directory,
      );
      await runGit(["push", "origin", `HEAD:${MAIN_BRANCH}`], directory);
    }

    return commitSha;
  } catch {
    throw new ContentHistoryError();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function recordFileHistory(
  tx: HistoryExecutor,
  changes: FileHistoryChange[],
): Promise<void> {
  if (!changes.length) return;

  const newEntries: FileHistoryEntry[] = [];
  for (const change of changes) {
    const [latest] = await tx
      .select({ versionNumber: contentFileVersionsTable.versionNumber })
      .from(contentFileVersionsTable)
      .where(eq(contentFileVersionsTable.fileId, change.file.id))
      .orderBy(desc(contentFileVersionsTable.versionNumber))
      .limit(1);

    let nextVersion = (latest?.versionNumber ?? 0) + 1;
    if (!latest && change.previous) {
      const baselineId = randomUUID();
      newEntries.push({
        id: baselineId,
        fileId: change.previous.id,
        versionNumber: nextVersion,
        action: "baseline",
        snapshot: snapshotOf(change.previous),
        gitPath: `history/${change.previous.id}/${baselineId}.json`,
        createdAt: new Date(),
      });
      nextVersion += 1;
    }

    const id = randomUUID();
    newEntries.push({
      id,
      fileId: change.file.id,
      versionNumber: nextVersion,
      action: change.action,
      snapshot: snapshotOf(change.file),
      gitPath: `history/${change.file.id}/${id}.json`,
      createdAt: new Date(),
    });
  }

  const commitSha = await pushEntriesToGit(newEntries);
  await tx.insert(contentFileVersionsTable).values(
    newEntries.map((entry) => ({
      id: entry.id,
      fileId: entry.fileId,
      versionNumber: entry.versionNumber,
      action: entry.action,
      snapshot: entry.snapshot,
      gitPath: entry.gitPath,
      gitCommitSha: commitSha,
      createdAt: entry.createdAt,
    })),
  );
}

export async function getFileHistory(
  fileId: string,
  file: ContentFile,
) {
  return withContentHistoryLock(async () => {
    const [latest] = await db
      .select({ id: contentFileVersionsTable.id })
      .from(contentFileVersionsTable)
      .where(eq(contentFileVersionsTable.fileId, fileId))
      .limit(1);
    if (!latest) {
      await db.transaction(async (tx) => {
        await recordFileHistory(tx, [{ file, action: "baseline" }]);
      });
    }

    return db
      .select()
      .from(contentFileVersionsTable)
      .where(eq(contentFileVersionsTable.fileId, fileId))
      .orderBy(desc(contentFileVersionsTable.versionNumber));
  });
}
