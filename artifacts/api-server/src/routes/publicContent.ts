import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  contentFilesTable,
  contentFoldersTable,
  contentManifestCacheTable,
  contentManifestStateTable,
  db,
} from "@workspace/db";
import {
  createManifestEtag,
  PUBLIC_MANIFEST_CACHE_KEY,
} from "../lib/contentManifestCache";
import { ensureRootFolders, normalizePublicUrl, titleFromLegacyName } from "../lib/contentShared";
import {
  createStoredObjectReadUrl,
  getStoredObject,
} from "../lib/objectStorage";
import { ContentError } from "../lib/contentErrors";
import {
  createPublicContentRouter,
  type PublicContentDependencies,
} from "./publicContentRouter";

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

async function getCachedPublicManifest(folderPath: string) {
  const cacheFolderPath = folderPath === "" ? "__root_manifest_wallpapers_v1__" : folderPath;
  const [state] = await db
    .select({ generation: contentManifestStateTable.generation })
    .from(contentManifestStateTable)
    .where(eq(contentManifestStateTable.key, PUBLIC_MANIFEST_CACHE_KEY))
    .limit(1);
  const generation = state?.generation ?? 0;
  const [cached] = await db
    .select()
    .from(contentManifestCacheTable)
    .where(
      and(
        eq(contentManifestCacheTable.folderPath, cacheFolderPath),
        eq(contentManifestCacheTable.generation, generation),
      ),
    )
    .limit(1);

  let manifest = cached?.manifest;
  let etag = cached?.etag;
  let folderCount = cached?.folderCount ?? 0;
  if (manifest === undefined || !etag) {
    const [folders, files, wallpaperFiles] = await Promise.all([
      db
        .select()
        .from(contentFoldersTable)
        .orderBy(asc(contentFoldersTable.path)),
      db
        .select()
        .from(contentFilesTable)
        .where(
          and(
            eq(contentFilesTable.folderPath, folderPath),
            isNull(contentFilesTable.deletedAt),
            eq(contentFilesTable.isPublished, true),
          ),
        )
        .orderBy(desc(contentFilesTable.contentDate), asc(contentFilesTable.name)),
      folderPath
        ? Promise.resolve([])
        : db
            .select()
            .from(contentFilesTable)
            .where(
              and(
                isNull(contentFilesTable.deletedAt),
                eq(contentFilesTable.isPublished, true),
                eq(contentFilesTable.isWallpaper, true),
              ),
            )
            .orderBy(desc(contentFilesTable.contentDate), asc(contentFilesTable.name)),
    ]);

    if (folderPath && !folders.some((folder) => folder.path === folderPath)) {
      throw new ContentError(404, "Folder not found.");
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
    const wallpaperEntries = wallpaperFiles.map((file) => ({
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
    manifest = folderPath
      ? entries
      : { path: "/", folders: directFolders, files: entries, wallpapers: wallpaperEntries };
    folderCount = directFolders.length;
    etag = createManifestEtag({ manifest, folderCount });

    await db
      .insert(contentManifestCacheTable)
      .values({
        folderPath: cacheFolderPath,
        generation,
        manifest,
        etag,
        folderCount,
      })
      .onConflictDoUpdate({
        target: contentManifestCacheTable.folderPath,
        set: {
          generation,
          manifest,
          etag,
          folderCount,
          cachedAt: new Date(),
        },
      });
  }

  return { manifest, etag, folderCount };
}

async function getPublishedFile(folderPath: string, name: string) {
  const [file] = await db
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
  return file;
}

const dependencies: PublicContentDependencies = {
  ensureRootFolders,
  getManifest: getCachedPublicManifest,
  getPublishedFile,
  getStoredObject,
  createStoredObjectReadUrl,
};

export const publicContentRouter = createPublicContentRouter(dependencies);
