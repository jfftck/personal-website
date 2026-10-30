import type {
  ContentFile,
  ContentFileVersionSnapshot,
} from "@workspace/db";

export function createContentFileVersionSnapshot(
  file: ContentFile,
): ContentFileVersionSnapshot {
  return {
    name: file.name,
    title: file.title,
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

export function restoreContentFileRevisionMetadata(
  snapshot: ContentFileVersionSnapshot,
): Pick<ContentFileVersionSnapshot, "name" | "title" | "contentDate"> {
  return {
    name: snapshot.name,
    title: snapshot.title,
    contentDate: snapshot.contentDate,
  };
}
