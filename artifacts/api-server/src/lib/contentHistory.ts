import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  db,
  contentFileVersionsTable,
  type ContentFile,
  type ContentFileVersionSnapshot,
} from "@workspace/db";

type HistoryExecutor = Pick<typeof db, "select" | "insert">;

const REPOSITORY_API = "https://api.github.com/repos/jfftck/personal-files";
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

class GitHubRequestError extends Error {
  constructor(readonly status: number) {
    super("GitHub request failed.");
    this.name = "GitHubRequestError";
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
    isWallpaper: file.isWallpaper,
    isPublished: file.isPublished,
    deletedAt: file.deletedAt?.toISOString() ?? null,
  };
}

async function githubRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = process.env.PERSONAL_FILES_GITHUB_TOKEN;
  if (!token) throw new ContentHistoryError();

  const response = await fetch(`${REPOSITORY_API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new GitHubRequestError(response.status);
  return (await response.json()) as T;
}

async function pushEntriesToGit(
  entries: FileHistoryEntry[],
): Promise<string> {
  try {
    const treeEntries = await Promise.all(
      entries.map(async (entry) => {
        const record = `${JSON.stringify(
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
        )}\n`;
        const blob = await githubRequest<{ sha: string }>("/git/blobs", {
          method: "POST",
          body: { content: record, encoding: "utf-8" },
        });
        return {
          path: entry.gitPath,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        };
      }),
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = await githubRequest<{ object: { sha: string } }>(
        `/git/ref/heads/${MAIN_BRANCH}`,
      );
      const currentCommit = await githubRequest<{ tree: { sha: string } }>(
        `/git/commits/${reference.object.sha}`,
      );
      const tree = await githubRequest<{ sha: string }>("/git/trees", {
        method: "POST",
        body: { base_tree: currentCommit.tree.sha, tree: treeEntries },
      });
      const commit = await githubRequest<{ sha: string }>("/git/commits", {
        method: "POST",
        body: {
          message:
            entries.length === 1
              ? `Record ${entries[0].action} revision`
              : `Record ${entries.length} content revisions`,
          tree: tree.sha,
          parents: [reference.object.sha],
        },
      });

      try {
        await githubRequest(`/git/refs/heads/${MAIN_BRANCH}`, {
          method: "PATCH",
          body: { sha: commit.sha, force: false },
        });
        return commit.sha;
      } catch (error) {
        const canRetry =
          error instanceof GitHubRequestError &&
          (error.status === 409 || error.status === 422) &&
          attempt < 2;
        if (!canRetry) throw error;
      }
    }

    throw new Error("Could not update the repository branch.");
  } catch {
    throw new ContentHistoryError();
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
