import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  CreateContentFileBody,
  CreateContentFolderBody,
  CreateContentUploadBody,
  UpdateContentFileBody,
  UpdateContentFolderBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  contentFilesTable,
  contentFileVersionsTable,
  contentFoldersTable,
  type ContentFile as DbContentFile,
  type ContentFileVersion as DbContentFileVersion,
  type ContentFolder as DbContentFolder,
} from "@workspace/db";
import { requireClerkUser } from "../lib/clerkAuth";
import {
  ContentHistoryError,
  getFileHistory,
  recordFileHistory,
  withContentHistoryLock,
} from "../lib/contentHistory";
import { restoreContentFileRevisionMetadata } from "../lib/contentRevisionMetadata";
import {
  assertGeneratedFileNameAvailable,
  ContentNameConflictError,
  fileExtension,
  standardFileName,
} from "../lib/contentFileNames";
import { ensureLegacyContentImported } from "../lib/legacyContentMigration";
import {
  createObjectUploadTarget,
  getStoredObject,
  getStoredObjectMetadata,
} from "../lib/objectStorage";

const MAX_FILE_BYTES = 2_000_000_000;
const DEFAULT_FOLDERS = [
  { name: "Posts", path: "posts", parentPath: "" },
  { name: "Documents", path: "documents", parentPath: "" },
  { name: "Pictures", path: "pictures", parentPath: "" },
  { name: "Videos", path: "videos", parentPath: "" },
];

class ContentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ContentError";
  }
}

let rootFolderSeed: Promise<void> | undefined;

async function ensureRootFolders() {
  if (!rootFolderSeed) {
    rootFolderSeed = db
      .insert(contentFoldersTable)
      .values(DEFAULT_FOLDERS)
      .onConflictDoNothing()
      .then(() => undefined)
      .catch((error) => {
        rootFolderSeed = undefined;
        throw error;
      });
  }
  await rootFolderSeed;
  await ensureLegacyContentImported();
}

function normalizeFolderPath(input: unknown): string {
  if (typeof input !== "string") {
    throw new ContentError(400, "Choose a valid folder.");
  }
  const path = input.trim().replace(/^\/+|\/+$/g, "");
  if (!path) return "";
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\\u0000-\u001f]/.test(segment) ||
        segment.length > 120,
    )
  ) {
    throw new ContentError(400, "The folder path is not valid.");
  }
  return segments.join("/");
}

function normalizeFileName(input: unknown): string {
  if (typeof input !== "string") {
    throw new ContentError(400, "Enter a file name.");
  }
  const name = input.normalize("NFC").trim();
  if (
    !name ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    name.toLowerCase() === "manifest.json" ||
    /[\/\\\u0000-\u001f]/.test(name)
  ) {
    throw new ContentError(400, "The file name is not valid.");
  }
  return name;
}

function normalizeFolderName(input: unknown): string {
  if (typeof input !== "string") {
    throw new ContentError(400, "Enter a folder name.");
  }
  const name = input.normalize("NFC").trim();
  if (
    !name ||
    name.length > 120 ||
    name === "." ||
    name === ".." ||
    /[\/\\\u0000-\u001f]/.test(name)
  ) {
    throw new ContentError(400, "The folder name is not valid.");
  }
  return name;
}

function normalizeContentDate(input: unknown): string {
  if (
    typeof input !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    Number.isNaN(Date.parse(`${input}T00:00:00Z`)) ||
    new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) !== input
  ) {
    throw new ContentError(400, "Choose a valid date.");
  }
  return input;
}

function normalizeOriginalFileName(input: unknown): string {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value || value.length > 255 || /[\\/\u0000-\u001f]/.test(value)) {
    throw new ContentError(400, "Enter a valid original file name.");
  }
  return value;
}

function normalizeContentDescription(input: unknown): string {
  if (typeof input !== "string" || input.length > 2000) {
    throw new ContentError(400, "Enter a description under 2000 characters.");
  }
  return input.trim();
}

function normalizeContentTitle(input: unknown): string {
  if (typeof input !== "string") {
    throw new ContentError(400, "Enter a title.");
  }
  const title = input.normalize("NFC").trim();
  if (!title || title.length > 220 || /[\u0000-\u001f]/.test(title)) {
    throw new ContentError(400, "The title is not valid.");
  }
  return title;
}

function titleFromLegacyName(name: string): string {
  const withoutDate = name.replace(/^\d{8}_/, "");
  if (/\.(md|markdown)$/i.test(withoutDate)) {
    return withoutDate.replace(/\.(md|markdown)$/i, "").replace(/_/g, " ").trim() || withoutDate;
  }
  return withoutDate || name;
}

function normalizeContentType(input: unknown): string {
  if (typeof input !== "string" || input.length > 255) {
    throw new ContentError(400, "The file type is not valid.");
  }
  return input.trim() || "application/octet-stream";
}

function isImageAsset(contentType: string, name: string): boolean {
  return (
    contentType.toLowerCase().startsWith("image/") ||
    /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(name)
  );
}

function normalizeSize(input: unknown): number {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < 0 ||
    input > MAX_FILE_BYTES
  ) {
    throw new ContentError(400, "Files must be smaller than 2 GB.");
  }
  return input;
}

function normalizeId(input: string | string[] | undefined): string {
  const id = Array.isArray(input) ? input[0] : input;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ContentError(400, "The requested item id is not valid.");
  }
  return id;
}

function normalizePublicUrl(folderPath: string, name: string): string {
  const parts = [...folderPath.split("/").filter(Boolean), name];
  return `/files/${parts.map(encodeURIComponent).join("/")}`;
}

function toContentFolder(folder: DbContentFolder) {
  return {
    id: folder.id,
    name: folder.name,
    path: folder.path,
    parentPath: folder.parentPath,
    createdAt: folder.createdAt.toISOString(),
  };
}

function toContentFile(file: DbContentFile) {
  return {
    id: file.id,
    name: file.name,
    originalFileName: file.originalFileName,
    title: file.title?.trim() || titleFromLegacyName(file.name),
    description: file.description,
    folderPath: file.folderPath,
    date: file.contentDate,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    posterUrl: file.posterUrl,
    isWallpaper: file.isWallpaper,
    url: normalizePublicUrl(file.folderPath, file.name),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function toContentFileVersion(version: DbContentFileVersion) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    action: version.action,
    name: version.snapshot.name,
    originalFileName: version.snapshot.originalFileName ?? "",
    title: version.snapshot.title?.trim() || titleFromLegacyName(version.snapshot.name),
    description: version.snapshot.description ?? "",
    folderPath: version.snapshot.folderPath,
    date: version.snapshot.contentDate,
    contentType: version.snapshot.contentType,
    sizeBytes: version.snapshot.sizeBytes,
    isWallpaper: version.snapshot.isWallpaper ?? false,
    isDeleted: Boolean(version.snapshot.deletedAt),
    createdAt: version.createdAt.toISOString(),
    gitCommitSha: version.gitCommitSha,
    gitUrl: `https://github.com/jfftck/personal-files/commit/${version.gitCommitSha}`,
  };
}

async function assertFolderExists(path: string) {
  if (!path) return;
  const [folder] = await db
    .select({ path: contentFoldersTable.path })
    .from(contentFoldersTable)
    .where(eq(contentFoldersTable.path, path))
    .limit(1);
  if (!folder) throw new ContentError(404, "That folder no longer exists.");
}

async function validateUploadObject(objectPath: unknown, expectedSize: number) {
  if (typeof objectPath !== "string") {
    throw new ContentError(400, "The file upload is missing.");
  }
  try {
    const { file, metadata } = await getStoredObjectMetadata(objectPath);
    const actualSize = Number(metadata.size ?? 0);
    if (actualSize !== expectedSize) {
      throw new ContentError(400, "The uploaded file size did not match.");
    }
    return { file, metadata };
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError(400, "The uploaded file could not be found.");
  }
}

function apiError(error: unknown, res: Response, next: (error?: unknown) => void) {
  if (error instanceof ContentError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ContentNameConflictError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ContentHistoryError) {
    res.status(503).json({ error: error.message });
    return;
  }
  if (
    error &&
    typeof error === "object" &&
    Array.isArray((error as { issues?: unknown }).issues)
  ) {
    const issue = (error as { issues: Array<{ message?: unknown }> }).issues[0];
    res.status(400).json({
      error: typeof issue?.message === "string" ? issue.message : "The request was invalid.",
    });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    res.status(409).json({ error: "A file or folder with that name already exists." });
    return;
  }
  next(error);
}

function apiHandler(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: (error?: unknown) => void) => {
    void handler(req, res).catch((error) => apiError(error, res, next));
  };
}

export const contentApiRouter = Router();
contentApiRouter.use(requireClerkUser);

contentApiRouter.get(
  "/content/tree",
  apiHandler(async (_req, res) => {
    await ensureRootFolders();
    const [folders, files] = await Promise.all([
      db.select().from(contentFoldersTable).orderBy(asc(contentFoldersTable.path)),
      db
        .select()
        .from(contentFilesTable)
        .where(isNull(contentFilesTable.deletedAt))
        .orderBy(desc(contentFilesTable.contentDate), asc(contentFilesTable.name)),
    ]);
    res.json({ folders: folders.map(toContentFolder), files: files.map(toContentFile) });
  }),
);

contentApiRouter.get(
  "/content/trash",
  apiHandler(async (_req, res) => {
    const files = await db
      .select()
      .from(contentFilesTable)
      .where(sql`${contentFilesTable.deletedAt} IS NOT NULL`)
      .orderBy(desc(contentFilesTable.updatedAt));
    res.json(files.map(toContentFile));
  }),
);

contentApiRouter.post(
  "/content/folders",
  apiHandler(async (req, res) => {
    await ensureRootFolders();
    const input = CreateContentFolderBody.parse(req.body);
    const name = normalizeFolderName(input.name);
    const parentPath = normalizeFolderPath(input.parentPath);
    await assertFolderExists(parentPath);
    const path = parentPath ? `${parentPath}/${name}` : name;
    const [folder] = await db
      .insert(contentFoldersTable)
      .values({ name, parentPath, path })
      .returning();
    res.status(201).json(toContentFolder(folder));
  }),
);

contentApiRouter.patch(
  "/content/folders/:folderId",
  apiHandler(async (req, res) => {
    const folderId = normalizeId(req.params.folderId);
    const input = UpdateContentFolderBody.parse(req.body);
    const name = normalizeFolderName(input.name);
    const [folder] = await db
      .select()
      .from(contentFoldersTable)
      .where(eq(contentFoldersTable.id, folderId))
      .limit(1);
    if (!folder) throw new ContentError(404, "That folder could not be found.");

    const newPath = folder.parentPath ? `${folder.parentPath}/${name}` : name;
    if (newPath === folder.path) {
      res.json(toContentFolder(folder));
      return;
    }
    if (newPath.startsWith(`${folder.path}/`)) {
      throw new ContentError(400, "A folder cannot be moved inside itself.");
    }

    const updatedFolder = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
      const [collision] = await tx
        .select({ id: contentFoldersTable.id })
        .from(contentFoldersTable)
        .where(eq(contentFoldersTable.path, newPath))
        .limit(1);
      if (collision) throw new ContentError(409, "A folder with that name already exists.");

      const folders = await tx.select().from(contentFoldersTable);
      const files = await tx.select().from(contentFilesTable);
      const changedAt = new Date();
      const changedFiles: Array<{
        file: DbContentFile;
        previous: DbContentFile;
        action: "moved";
      }> = [];
      for (const child of folders) {
        if (child.path === folder.path || child.path.startsWith(`${folder.path}/`)) {
          const suffix = child.path.slice(folder.path.length);
          const nextPath = `${newPath}${suffix}`;
          const nextParent = nextPath.includes("/")
            ? nextPath.slice(0, nextPath.lastIndexOf("/"))
            : "";
          await tx
            .update(contentFoldersTable)
            .set({ name: child.path === folder.path ? name : child.name, path: nextPath, parentPath: nextParent })
            .where(eq(contentFoldersTable.id, child.id));
        }
      }
      for (const file of files) {
        if (file.folderPath === folder.path || file.folderPath.startsWith(`${folder.path}/`)) {
          const suffix = file.folderPath.slice(folder.path.length);
          const updatedFile = {
            ...file,
            folderPath: `${newPath}${suffix}`,
            updatedAt: changedAt,
          };
          await tx
            .update(contentFilesTable)
            .set({ folderPath: updatedFile.folderPath, updatedAt: changedAt })
            .where(eq(contentFilesTable.id, file.id));
          changedFiles.push({ file: updatedFile, previous: file, action: "moved" });
        }
      }
      await recordFileHistory(tx, changedFiles);
      const [updated] = await tx
        .select()
        .from(contentFoldersTable)
        .where(eq(contentFoldersTable.id, folderId))
        .limit(1);
      return updated;
      }),
    );
    res.json(toContentFolder(updatedFolder));
  }),
);

contentApiRouter.delete(
  "/content/folders/:folderId",
  apiHandler(async (req, res) => {
    const [folder] = await db
      .select()
      .from(contentFoldersTable)
      .where(eq(contentFoldersTable.id, normalizeId(req.params.folderId)))
      .limit(1);
    if (!folder) throw new ContentError(404, "That folder could not be found.");

    const prefix = `${folder.path}/`;
    const [allFolders, activeFiles] = await Promise.all([
      db
        .select({ path: contentFoldersTable.path })
        .from(contentFoldersTable),
      db
        .select({ folderPath: contentFilesTable.folderPath })
        .from(contentFilesTable)
        .where(isNull(contentFilesTable.deletedAt)),
    ]);
    const hasChildFolder = allFolders.some((child) => child.path.startsWith(prefix));
    const hasChildFile = activeFiles.some((file) =>
      file.folderPath === folder.path || file.folderPath.startsWith(prefix),
    );
    if (hasChildFolder || hasChildFile) {
      throw new ContentError(409, "Move or remove this folder’s contents first.");
    }

    await db.delete(contentFoldersTable).where(eq(contentFoldersTable.id, folder.id));
    res.status(204).end();
  }),
);

contentApiRouter.post(
  "/content/uploads",
  apiHandler(async (req, res) => {
    const input = CreateContentUploadBody.parse(req.body);
    normalizeFileName(input.name);
    const sizeBytes = normalizeSize(input.sizeBytes);
    normalizeContentType(input.contentType);
    if (sizeBytes === 0) {
      throw new ContentError(400, "Choose a file that contains data.");
    }
    res.json(await createObjectUploadTarget());
  }),
);

contentApiRouter.post(
  "/content/files",
  apiHandler(async (req, res) => {
    await ensureRootFolders();
    const input = CreateContentFileBody.parse(req.body);
    const requestedName = normalizeFileName(input.name);
    const originalFileName = normalizeOriginalFileName(
      input.originalFileName,
    );
    const title = normalizeContentTitle(input.title);
    const description = normalizeContentDescription(input.description ?? "");
    const folderPath = normalizeFolderPath(input.folderPath);
    const date = normalizeContentDate(input.date);
    const contentType = normalizeContentType(input.contentType);
    const sizeBytes = normalizeSize(input.sizeBytes);
    const extension =
      fileExtension(requestedName) ??
      (contentType.toLowerCase().startsWith("text/markdown") ? ".md" : ".bin");
    const name = normalizeFileName(standardFileName(title, date, extension));
    if (input.isWallpaper && !isImageAsset(contentType, name)) {
      throw new ContentError(400, "Only image files can be used as desktop wallpaper.");
    }
    await assertFolderExists(folderPath);
    await validateUploadObject(input.objectPath, sizeBytes);

    const file = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
        const [collision] = await tx
          .select({ id: contentFilesTable.id })
          .from(contentFilesTable)
          .where(
            and(
              eq(contentFilesTable.folderPath, folderPath),
              eq(contentFilesTable.name, name),
              isNull(contentFilesTable.deletedAt),
            ),
          )
          .limit(1);
        assertGeneratedFileNameAvailable(Boolean(collision));
        const [created] = await tx
          .insert(contentFilesTable)
          .values({
            name,
            originalFileName,
            title,
            description,
            folderPath,
            contentDate: date,
            contentType,
            sizeBytes,
            objectPath: input.objectPath,
            isWallpaper: Boolean(input.isWallpaper && isImageAsset(contentType, name)),
            isPublished: true,
          })
          .returning();
        await recordFileHistory(tx, [{ file: created, action: "created" }]);
        return created;
      }),
    );
    res.status(201).json(toContentFile(file));
  }),
);

contentApiRouter.patch(
  "/content/files/:fileId",
  apiHandler(async (req, res) => {
    const input = UpdateContentFileBody.parse(req.body);
    const file = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(contentFilesTable)
          .where(and(eq(contentFilesTable.id, normalizeId(req.params.fileId)), isNull(contentFilesTable.deletedAt)))
          .limit(1);
        if (!existing) throw new ContentError(404, "That file could not be found.");

        const update: Partial<typeof contentFilesTable.$inferInsert> = {};
        if (input.description !== undefined) {
          update.description = normalizeContentDescription(input.description);
        }
        const title =
          input.title !== undefined
            ? normalizeContentTitle(input.title)
            : existing.title.trim() || titleFromLegacyName(existing.name);
        const date =
          input.date !== undefined
            ? normalizeContentDate(input.date)
            : existing.contentDate;
        if (input.title !== undefined || input.date !== undefined) {
          update.title = title;
          update.contentDate = date;
          update.name = normalizeFileName(
            standardFileName(title, date, fileExtension(existing.name) ?? ".md"),
          );
        } else if (input.name !== undefined) {
          update.name = normalizeFileName(input.name);
        }
        if (input.folderPath !== undefined) {
          update.folderPath = normalizeFolderPath(input.folderPath);
          await assertFolderExists(update.folderPath);
        }
        if (input.contentType !== undefined) update.contentType = normalizeContentType(input.contentType);
        if (input.sizeBytes !== undefined) update.sizeBytes = normalizeSize(input.sizeBytes);
        if (input.isWallpaper !== undefined) {
          if (
            input.isWallpaper &&
            !isImageAsset(update.contentType ?? existing.contentType, update.name ?? existing.name)
          ) {
            throw new ContentError(400, "Only image files can be used as desktop wallpaper.");
          }
          update.isWallpaper = input.isWallpaper;
        }

        if (input.objectPath !== undefined) {
          const size = input.sizeBytes ?? existing.sizeBytes;
          const { metadata } = await validateUploadObject(input.objectPath, size);
          update.objectPath = input.objectPath;
          update.sourceUrl = null;
          update.sizeBytes = size;
          if (metadata.contentType && input.contentType === undefined) {
            update.contentType = String(metadata.contentType);
          }
        }
        if (!isImageAsset(update.contentType ?? existing.contentType, update.name ?? existing.name)) {
          update.isWallpaper = false;
        }
        const nextFolderPath = update.folderPath ?? existing.folderPath;
        const nextName = update.name ?? existing.name;
        if (nextName !== existing.name || nextFolderPath !== existing.folderPath) {
          const [collision] = await tx
            .select({ id: contentFilesTable.id })
            .from(contentFilesTable)
            .where(
              and(
                eq(contentFilesTable.folderPath, nextFolderPath),
                eq(contentFilesTable.name, nextName),
                isNull(contentFilesTable.deletedAt),
                sql`${contentFilesTable.id} <> ${existing.id}`,
              ),
            )
            .limit(1);
          assertGeneratedFileNameAvailable(Boolean(collision));
        }
        if (Object.keys(update).length === 0) {
          throw new ContentError(400, "There are no changes to save.");
        }
        update.updatedAt = new Date();

        const [updated] = await tx
          .update(contentFilesTable)
          .set(update)
          .where(eq(contentFilesTable.id, existing.id))
          .returning();
        const action =
          input.folderPath !== undefined && input.folderPath !== existing.folderPath
            ? "moved"
            : update.name !== undefined && update.name !== existing.name
              ? "renamed"
              : "updated";
        await recordFileHistory(tx, [{ file: updated, previous: existing, action }]);
        return updated;
      }),
    );
    res.json(toContentFile(file));
  }),
);

contentApiRouter.delete(
  "/content/files/:fileId",
  apiHandler(async (req, res) => {
    const file = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(contentFilesTable)
          .where(and(eq(contentFilesTable.id, normalizeId(req.params.fileId)), isNull(contentFilesTable.deletedAt)))
          .limit(1);
        if (!existing) throw new ContentError(404, "That file could not be found.");
        const [deleted] = await tx
          .update(contentFilesTable)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(contentFilesTable.id, existing.id))
          .returning();
        await recordFileHistory(tx, [
          { file: deleted, previous: existing, action: "trashed" },
        ]);
        return deleted;
      }),
    );
    res.status(204).end();
  }),
);

contentApiRouter.post(
  "/content/files/:fileId/restore",
  apiHandler(async (req, res) => {
    const file = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(contentFilesTable)
          .where(and(eq(contentFilesTable.id, normalizeId(req.params.fileId)), sql`${contentFilesTable.deletedAt} IS NOT NULL`))
          .limit(1);
        if (!existing) throw new ContentError(404, "That removed file could not be found.");
        const [restored] = await tx
          .update(contentFilesTable)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(contentFilesTable.id, existing.id))
          .returning();
        await recordFileHistory(tx, [
          { file: restored, previous: existing, action: "restored" },
        ]);
        return restored;
      }),
    );
    res.json(toContentFile(file));
  }),
);

contentApiRouter.get(
  "/content/files/:fileId/versions",
  apiHandler(async (req, res) => {
    const fileId = normalizeId(req.params.fileId);
    const [file] = await db
      .select()
      .from(contentFilesTable)
      .where(eq(contentFilesTable.id, fileId))
      .limit(1);
    if (!file) throw new ContentError(404, "That file could not be found.");
    const versions = await getFileHistory(fileId, file);
    res.json(versions.map(toContentFileVersion));
  }),
);

contentApiRouter.post(
  "/content/files/:fileId/versions/:versionId/restore",
  apiHandler(async (req, res) => {
    const fileId = normalizeId(req.params.fileId);
    const versionId = normalizeId(req.params.versionId);
    const restored = await withContentHistoryLock(() =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(contentFilesTable)
          .where(eq(contentFilesTable.id, fileId))
          .limit(1);
        if (!current) throw new ContentError(404, "That file could not be found.");
        const [version] = await tx
          .select()
          .from(contentFileVersionsTable)
          .where(
            and(
              eq(contentFileVersionsTable.id, versionId),
              eq(contentFileVersionsTable.fileId, fileId),
            ),
          )
          .limit(1);
        if (!version) throw new ContentError(404, "That revision could not be found.");
        if (version.snapshot.objectPath) {
          try {
            await getStoredObject(version.snapshot.objectPath);
          } catch {
            throw new ContentError(410, "The stored file for this revision is no longer available.");
          }
        }
        await assertFolderExists(version.snapshot.folderPath);
        const revisionMetadata = restoreContentFileRevisionMetadata(
          version.snapshot,
        );
        const [updated] = await tx
          .update(contentFilesTable)
          .set({
            ...revisionMetadata,
            title: revisionMetadata.title?.trim() ||
              titleFromLegacyName(revisionMetadata.name),
            folderPath: version.snapshot.folderPath,
            contentType: version.snapshot.contentType,
            sizeBytes: version.snapshot.sizeBytes,
            objectPath: version.snapshot.objectPath,
            sourceUrl: version.snapshot.sourceUrl,
            posterUrl: version.snapshot.posterUrl,
            isWallpaper: version.snapshot.isWallpaper ?? false,
            isPublished: version.snapshot.isPublished,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(contentFilesTable.id, fileId))
          .returning();
        await recordFileHistory(tx, [
          { file: updated, previous: current, action: "restored" },
        ]);
        return updated;
      }),
    );
    res.json(toContentFile(restored));
  }),
);

contentApiRouter.get(
  "/content/files/:fileId/content",
  apiHandler(async (req, res) => {
    const [fileRow] = await db
      .select()
      .from(contentFilesTable)
      .where(and(eq(contentFilesTable.id, normalizeId(req.params.fileId)), isNull(contentFilesTable.deletedAt)))
      .limit(1);
    if (!fileRow) throw new ContentError(404, "That file could not be found.");
    if (!fileRow.objectPath) {
      throw new ContentError(415, "This external file cannot be edited here.");
    }
    if (!/\.(md|markdown|txt|csv)$/i.test(fileRow.name)) {
      throw new ContentError(415, "Only text files can be edited in the console.");
    }
    if (fileRow.sizeBytes > 5_000_000) {
      throw new ContentError(413, "This text file is too large to edit in the console.");
    }
    const storedFile = await getStoredObject(fileRow.objectPath);
    const [contents] = await storedFile.download();
    res.type("text/plain; charset=utf-8").send(contents);
  }),
);

export const publicContentRouter = Router();

function decodePathSegments(rawPath: string): string[] {
  try {
    const decoded = rawPath
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    if (
      decoded.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[\/\\\u0000-\u001f]/.test(part),
      )
    ) {
      throw new ContentError(400, "The requested file path is not valid.");
    }
    return decoded;
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError(400, "The requested file path is not valid.");
  }
}

async function serveManifest(res: Response, folderPath: string) {
  await ensureRootFolders();
  const [folders, files] = await Promise.all([
    db
      .select()
      .from(contentFoldersTable)
      .orderBy(asc(contentFoldersTable.path)),
    db
      .select()
      .from(contentFilesTable)
      .where(and(eq(contentFilesTable.folderPath, folderPath), isNull(contentFilesTable.deletedAt), eq(contentFilesTable.isPublished, true)))
      .orderBy(desc(contentFilesTable.contentDate), asc(contentFilesTable.name)),
  ]);

  if (folderPath) {
    const [folder] = await db
      .select({ path: contentFoldersTable.path })
      .from(contentFoldersTable)
      .where(eq(contentFoldersTable.path, folderPath))
      .limit(1);
    if (!folder) throw new ContentError(404, "Folder not found.");
  }

  const directFolders = folders
    .filter((folder) => folder.parentPath === folderPath)
    .map((folder) => ({
      name: folder.name,
      path: folder.path,
      url: `/files/${folder.path.split("/").map(encodeURIComponent).join("/")}/manifest.json`,
    }));
  const entries = files.map((file) => ({
    filename: file.name,
    title: file.title?.trim() || titleFromLegacyName(file.name),
    date: file.contentDate,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    isWallpaper: file.isWallpaper,
    size: formatSize(file.sizeBytes),
    url: normalizePublicUrl(file.folderPath, file.name),
    poster: file.posterUrl ?? undefined,
  }));

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=60");
  res.type("application/json");
  if (!folderPath) {
    res.json({ path: "/", folders: directFolders, files: entries });
    return;
  }
  if (directFolders.length) {
    res.setHeader("X-Content-Folders", String(directFolders.length));
  }
  res.json(entries);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function safeInlineContentType(name: string, contentType: string): string {
  if (/\.(html?|xhtml|js|mjs|svgz?)$/i.test(name)) {
    return "application/octet-stream";
  }
  return contentType || "application/octet-stream";
}

function parseByteRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function servePublicFile(req: Request, res: Response, parts: string[]) {
  const name = parts.at(-1);
  const folderPath = parts.slice(0, -1).join("/");
  if (!name || name.toLowerCase() === "manifest.json") {
    throw new ContentError(404, "File not found.");
  }
  const [fileRow] = await db
    .select()
    .from(contentFilesTable)
    .where(
      and(
        eq(contentFilesTable.folderPath, folderPath),
        eq(contentFilesTable.name, name),
        eq(contentFilesTable.isPublished, true),
        isNull(contentFilesTable.deletedAt),
      ),
    )
    .limit(1);
  if (!fileRow) throw new ContentError(404, "File not found.");
  if (fileRow.sourceUrl) {
    const source = new URL(fileRow.sourceUrl);
    if (source.protocol !== "https:") throw new ContentError(404, "File not found.");
    res.redirect(302, source.toString());
    return;
  }
  if (!fileRow.objectPath) throw new ContentError(404, "File not found.");

  const storedFile = await getStoredObject(fileRow.objectPath);
  const [metadata] = await storedFile.getMetadata();
  const size = Number(metadata.size ?? fileRow.sizeBytes);
  const contentType = safeInlineContentType(
    fileRow.name,
    fileRow.contentType || String(metadata.contentType ?? ""),
  );
  const etag = metadata.md5Hash ? `"${metadata.md5Hash}"` : undefined;
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.setHeader("Last-Modified", new Date(String(metadata.updated ?? fileRow.updatedAt)).toUTCString());
  res.setHeader(
    "Content-Disposition",
    /\.(html?|xhtml|js|mjs|svgz?)$/i.test(fileRow.name)
      ? `attachment; filename="${fileRow.name.replace(/["\\]/g, "_")}"`
      : "inline",
  );
  if (etag) {
    res.setHeader("ETag", etag);
    if (req.header("if-none-match") === etag) {
      res.status(304).end();
      return;
    }
  }

  const rangeHeader = req.header("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
  if (rangeHeader && !range) {
    res.setHeader("Content-Range", `bytes */${size}`);
    res.status(416).end();
    return;
  }
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else {
    res.setHeader("Content-Length", String(size));
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = range
    ? storedFile.createReadStream({ start: range.start, end: range.end })
    : storedFile.createReadStream();
  stream.on("error", (error) => {
    if (!res.headersSent) res.status(502).end();
    else res.destroy(error);
  });
  stream.pipe(res);
}

publicContentRouter.use((req, res, next) => {
  void (async () => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405).end();
      return;
    }
    const segments = decodePathSegments(req.path);
    if (segments.at(-1) === "manifest.json") {
      await serveManifest(res, segments.slice(0, -1).join("/"));
      return;
    }
    if (segments.length === 0) {
      await serveManifest(res, "");
      return;
    }
    await servePublicFile(req, res, segments);
  })().catch((error) => apiError(error, res, next));
});
