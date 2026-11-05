import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type LegacyContentFile = {
  name: string;
  title: string;
  folderPath: string;
  contentDate: string;
  contentType: string;
  sizeBytes: number;
  objectPath: string;
  isPublished: true;
};

export type LegacyObjectCleanupAdapter = {
  runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
  isObjectReferenced?: (objectPath: string) => Promise<boolean>;
  deleteObject: (objectPath: string) => Promise<void>;
  recordFailedCleanup?: (objectPath: string, error: unknown) => Promise<void>;
  clearFailedCleanup?: (objectPath: string) => Promise<void>;
  reportCleanupFailure?: (error: unknown, objectPath: string) => void;
};

export type LegacyContentImportAdapter = LegacyObjectCleanupAdapter & {
  ensureFolder: (folderPath: string) => Promise<void>;
  findExistingFile: (
    folderPath: string,
    name: string,
  ) => Promise<boolean>;
  createObjectPath: () => string;
  saveObject: (
    objectPath: string,
    filePath: string,
    contentType: string,
  ) => Promise<void>;
  insertFile: (file: LegacyContentFile) => Promise<boolean>;
};

function reportCleanupFailure(
  adapter: LegacyObjectCleanupAdapter,
  error: unknown,
  objectPath: string,
) {
  try {
    adapter.reportCleanupFailure?.(error, objectPath);
  } catch {
    // Reporting should not replace the import or cleanup result.
  }
}

export async function cleanupLegacyImportObject(
  objectPath: string,
  adapter: LegacyObjectCleanupAdapter,
): Promise<boolean> {
  const cleanup = async () => {
    if (await adapter.isObjectReferenced?.(objectPath)) {
      await adapter.clearFailedCleanup?.(objectPath);
      return false;
    }
    await adapter.deleteObject(objectPath);
    await adapter.clearFailedCleanup?.(objectPath);
    return true;
  };

  try {
    return adapter.runExclusive
      ? await adapter.runExclusive(cleanup)
      : await cleanup();
  } catch (error) {
    try {
      if (!adapter.recordFailedCleanup) throw error;
      await adapter.recordFailedCleanup(objectPath, error);
      reportCleanupFailure(adapter, error, objectPath);
      return false;
    } catch (recordError) {
      reportCleanupFailure(adapter, recordError, objectPath);
      const surfaced = new Error(
        `Could not clean up imported object ${objectPath}; its recovery record could not be saved.`,
      );
      Object.assign(surfaced, { cause: recordError });
      throw surfaced;
    }
  }
}

export async function retryFailedLegacyObjectCleanup(
  records: Array<{ objectPath: string }>,
  adapter: LegacyObjectCleanupAdapter,
): Promise<void> {
  for (const { objectPath } of records) {
    try {
      await cleanupLegacyImportObject(objectPath, adapter);
    } catch {
      // cleanupLegacyImportObject reports failures with the affected path.
    }
  }
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

function titleFor(filename: string): string {
  const withoutDate = filename.replace(/^\d{8}_/, "");
  if (/\.(md|markdown)$/i.test(withoutDate)) {
    return withoutDate.replace(/\.(md|markdown)$/i, "").replace(/_/g, " ").trim();
  }
  return withoutDate;
}

export async function importLegacyContentDirectory(
  root: string,
  folderPath: string,
  adapter: LegacyContentImportAdapter,
): Promise<void> {
  if (!existsSync(root)) return;
  await adapter.ensureFolder(folderPath);

  async function visit(directory: string, currentFolderPath: string) {
    const items = await readdir(directory, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directory, item.name);
      if (item.isDirectory()) {
        const childFolderPath = `${currentFolderPath}/${item.name}`;
        await adapter.ensureFolder(childFolderPath);
        await visit(fullPath, childFolderPath);
        continue;
      }
      if (
        !item.isFile() ||
        item.name === "manifest.json" ||
        item.name.startsWith(".")
      ) {
        continue;
      }

      if (await adapter.findExistingFile(currentFolderPath, item.name)) {
        continue;
      }

      const fileInfo = await stat(fullPath);
      const contentType = contentTypeFor(item.name);
      const objectPath = adapter.createObjectPath();
      try {
        await adapter.saveObject(objectPath, fullPath, contentType);
        const inserted = await adapter.insertFile({
          name: item.name,
          title: titleFor(item.name),
          folderPath: currentFolderPath,
          contentDate: dateFor(item.name, fileInfo.mtime),
          contentType,
          sizeBytes: fileInfo.size,
          objectPath,
          isPublished: true,
        });
        if (!inserted) {
          await cleanupLegacyImportObject(objectPath, adapter);
        }
      } catch (error) {
        await cleanupLegacyImportObject(objectPath, adapter);
        throw error;
      }
    }
  }

  await visit(root, folderPath);
}
