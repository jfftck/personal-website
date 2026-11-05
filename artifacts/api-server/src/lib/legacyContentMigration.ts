import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  contentFileVersionsTable,
  contentFilesTable,
  contentFoldersTable,
  legacyImportObjectCleanupTable,
} from "@workspace/db";
import { invalidatePublicManifestCache } from "./contentManifestInvalidation";
import {
  importLegacyContentDirectory,
  retryFailedLegacyObjectCleanup,
} from "./legacyContentImportCore";
import {
  createStorageObjectPath,
  deleteStoredObject,
  saveStoredObject,
} from "./objectStorage";
import { withContentHistoryLock } from "./contentHistory";

const CLEANUP_RETRY_DELAY_MS = 60_000;
const CLEANUP_SWEEP_INTERVAL_MS = 60_000;
const CLEANUP_SWEEP_BATCH_SIZE = 25;

function resolveLegacyPublicRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "../personal-website/public"),
    path.resolve(process.cwd(), "artifacts/personal-website/public"),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../personal-website/public",
    ),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function titleFor(filename: string): string {
  const withoutDate = filename.replace(/^\d{8}_/, "");
  if (/\.(md|markdown)$/i.test(withoutDate)) {
    return withoutDate.replace(/\.(md|markdown)$/i, "").replace(/_/g, " ").trim();
  }
  return withoutDate;
}

let pendingManifestCacheInvalidation = false;

function cleanupErrorText(error: unknown): string {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
  return detail
    .replace(/[\r\n]+/g, " ")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(authorization|token|secret|password)\s*[:=]\s*["']?\S+["']?/gi,
      "$1=[redacted]",
    )
    .slice(0, 1000);
}

async function isImportedObjectReferenced(objectPath: string): Promise<boolean> {
  const [file] = await db
    .select({ id: contentFilesTable.id })
    .from(contentFilesTable)
    .where(eq(contentFilesTable.objectPath, objectPath))
    .limit(1);
  if (file) return true;

  const [version] = await db
    .select({ id: contentFileVersionsTable.id })
    .from(contentFileVersionsTable)
    .where(
      sql`(${contentFileVersionsTable.snapshot} ->> 'objectPath') = ${objectPath}`,
    )
    .limit(1);
  return Boolean(version);
}

async function ensureFolder(pathValue: string) {
  const parts = pathValue.split("/").filter(Boolean);
  let parentPath = "";
  for (const name of parts) {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    const inserted = await db
      .insert(contentFoldersTable)
      .values({ name, parentPath, path: folderPath })
      .onConflictDoNothing()
      .returning({ id: contentFoldersTable.id });
    if (inserted.length) pendingManifestCacheInvalidation = true;
    parentPath = folderPath;
  }
}

const importAdapter = {
  ensureFolder,
  async findExistingFile(folderPath: string, name: string) {
    const existing = await db
      .select({ id: contentFilesTable.id })
      .from(contentFilesTable)
      .where(
        and(
          eq(contentFilesTable.folderPath, folderPath),
          eq(contentFilesTable.name, name),
        ),
      )
      .limit(1);
    return existing.length > 0;
  },
  createObjectPath: createStorageObjectPath,
  saveObject: saveStoredObject,
  runExclusive: withContentHistoryLock,
  isObjectReferenced: isImportedObjectReferenced,
  async insertFile(file: {
    name: string;
    title: string;
    folderPath: string;
    contentDate: string;
    contentType: string;
    sizeBytes: number;
    objectPath: string;
    isPublished: true;
  }) {
    const inserted = await db
      .insert(contentFilesTable)
      .values(file)
      .onConflictDoNothing()
      .returning({ id: contentFilesTable.id });
    if (inserted.length) pendingManifestCacheInvalidation = true;
    return inserted.length > 0;
  },
  deleteObject: deleteStoredObject,
  async recordFailedCleanup(objectPath: string, error: unknown) {
    const now = new Date();
    const nextAttemptAt = new Date(now.getTime() + CLEANUP_RETRY_DELAY_MS);
    const lastError = cleanupErrorText(error);
    await db
      .insert(legacyImportObjectCleanupTable)
      .values({
        objectPath,
        attempts: 1,
        lastError,
        nextAttemptAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: legacyImportObjectCleanupTable.objectPath,
        set: {
          attempts: sql`${legacyImportObjectCleanupTable.attempts} + 1`,
          lastError,
          nextAttemptAt,
          updatedAt: now,
        },
      });
  },
  async clearFailedCleanup(objectPath: string) {
    await db
      .delete(legacyImportObjectCleanupTable)
      .where(eq(legacyImportObjectCleanupTable.objectPath, objectPath));
  },
  reportCleanupFailure(error: unknown, objectPath: string) {
    console.error(
      "Failed to clean up an unreferenced legacy import object; recovery is queued.",
      { objectPath, error: cleanupErrorText(error) },
    );
  },
};

let migration: Promise<void> | undefined;
let cleanupSweep: Promise<void> | undefined;
let lastCleanupSweepAt = 0;

function retryPendingLegacyObjectCleanup(): void {
  const now = Date.now();
  if (
    cleanupSweep ||
    now - lastCleanupSweepAt < CLEANUP_SWEEP_INTERVAL_MS
  ) {
    return;
  }
  lastCleanupSweepAt = now;
  cleanupSweep = (async () => {
    const pending = await db
      .select({ objectPath: legacyImportObjectCleanupTable.objectPath })
      .from(legacyImportObjectCleanupTable)
      .where(lte(legacyImportObjectCleanupTable.nextAttemptAt, new Date()))
      .orderBy(asc(legacyImportObjectCleanupTable.nextAttemptAt))
      .limit(CLEANUP_SWEEP_BATCH_SIZE);
    await retryFailedLegacyObjectCleanup(pending, importAdapter);
  })()
    .catch((error) => {
      console.error("Could not scan queued legacy import cleanup records.", error);
    })
    .finally(() => {
      cleanupSweep = undefined;
    });
}

export function ensureLegacyContentImported(): Promise<void> {
  retryPendingLegacyObjectCleanup();
  if (!migration) {
    migration = (async () => {
      const publicRoot = resolveLegacyPublicRoot();
      try {
        for (const folder of ["posts", "documents", "pictures", "videos", "welcome"]) {
          await importLegacyContentDirectory(
            path.join(publicRoot, folder),
            folder,
            importAdapter,
          );
        }
      } finally {
        if (pendingManifestCacheInvalidation) {
          await db.transaction((tx) => invalidatePublicManifestCache(tx));
          pendingManifestCacheInvalidation = false;
        }
      }
    })().catch((error) => {
      migration = undefined;
      throw error;
    });
  }
  return migration;
}
