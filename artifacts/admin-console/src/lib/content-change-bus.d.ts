export type ContentManifestFolder = 'posts' | 'documents' | 'pictures' | 'videos' | 'wallpapers';

export const CONTENT_CHANGE_CHANNEL: string;
export const CONTENT_CHANGE_STORAGE_KEY: string;
export const CONTENT_CHANGE_MESSAGE_TYPE: string;
export const CONTENT_CHANGE_VERSION: number;

export function manifestFoldersForPaths(
  paths: readonly unknown[],
  options?: { includeRootManifest?: boolean },
): ContentManifestFolder[];

export function announceContentChanged(
  paths: readonly unknown[],
  options?: { includeRootManifest?: boolean },
): boolean;
