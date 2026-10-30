import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { contentFilesTable, contentFoldersTable } from "@workspace/db";
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

function contentTypeFor(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
  };
  return types[extension] ?? "application/octet-stream";
}

function dateFor(filename: string, modifiedAt: Date): string {
  const match = /^(\d{4})(\d{2})(\d{2})_/.exec(filename);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return modifiedAt.toISOString().slice(0, 10);
}

async function ensureFolder(pathValue: string) {
  const parts = pathValue.split("/").filter(Boolean);
  let parentPath = "";
  for (const name of parts) {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    await db
      .insert(contentFoldersTable)
      .values({ name, parentPath, path: folderPath })
      .onConflictDoNothing();
    parentPath = folderPath;
  }
}

async function importDirectory(root: string, folderPath: string) {
  if (!existsSync(root)) return;
  await ensureFolder(folderPath);

  async function visit(directory: string, currentFolderPath: string) {
    const items = await readdir(directory, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directory, item.name);
      if (item.isDirectory()) {
        const childFolderPath = `${currentFolderPath}/${item.name}`;
        await ensureFolder(childFolderPath);
        await visit(fullPath, childFolderPath);
        continue;
      }
      if (!item.isFile() || item.name === "manifest.json" || item.name.startsWith(".")) {
        continue;
      }

      const existing = await db
        .select({ id: contentFilesTable.id })
        .from(contentFilesTable)
        .where(
          and(
            eq(contentFilesTable.folderPath, currentFolderPath),
            eq(contentFilesTable.name, item.name),
          ),
        )
        .limit(1);
      if (existing.length) continue;

      const fileInfo = await stat(fullPath);
      const objectPath = createStorageObjectPath();
      try {
        await saveStoredObject(objectPath, fullPath, contentTypeFor(item.name));
        await db.insert(contentFilesTable).values({
          name: item.name,
          folderPath: currentFolderPath,
          contentDate: dateFor(item.name, fileInfo.mtime),
          contentType: contentTypeFor(item.name),
          sizeBytes: fileInfo.size,
          objectPath,
          isPublished: true,
        });
      } catch (error) {
        await deleteStoredObject(objectPath).catch(() => undefined);
        throw error;
      }
    }
  }

  await visit(root, folderPath);
}

let migration: Promise<void> | undefined;

export function ensureLegacyContentImported(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      const publicRoot = resolveLegacyPublicRoot();
      for (const folder of ["posts", "documents", "pictures", "videos", "welcome"]) {
        await importDirectory(path.join(publicRoot, folder), folder);
      }
    })().catch((error) => {
      migration = undefined;
      throw error;
    });
  }
  return migration;
}
