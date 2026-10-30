import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { contentFilesTable, contentFoldersTable } from "@workspace/db";
import { invalidatePublicManifestCache } from "./contentManifestInvalidation";
import { importLegacyContentDirectory } from "./legacyContentImportCore";
import {
  createStorageObjectPath,
  deleteStoredObject,
  saveStoredObject,
} from "./objectStorage";

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
};

let migration: Promise<void> | undefined;

export function ensureLegacyContentImported(): Promise<void> {
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
