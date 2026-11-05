import { contentFoldersTable, contentManifestStateTable, db } from "@workspace/db";
import { PUBLIC_MANIFEST_CACHE_KEY } from "./contentManifestCache";
import { ensureLegacyContentImported } from "./legacyContentMigration";

const DEFAULT_FOLDERS = [
  { name: "Posts", path: "posts", parentPath: "" },
  { name: "Documents", path: "documents", parentPath: "" },
  { name: "Pictures", path: "pictures", parentPath: "" },
  { name: "Videos", path: "videos", parentPath: "" },
  { name: "Stylesheets", path: "stylesheets", parentPath: "" },
];

let rootFolderSeed: Promise<void> | undefined;

export async function ensureRootFolders(): Promise<void> {
  if (!rootFolderSeed) {
    rootFolderSeed = db
      .insert(contentFoldersTable)
      .values(DEFAULT_FOLDERS)
      .onConflictDoNothing()
      .then(async () => {
        await db
          .insert(contentManifestStateTable)
          .values({ key: PUBLIC_MANIFEST_CACHE_KEY, generation: 1 })
          .onConflictDoNothing();
      })
      .catch((error) => {
        rootFolderSeed = undefined;
        throw error;
      });
  }
  await rootFolderSeed;
  await ensureLegacyContentImported();
}

export function titleFromLegacyName(name: string): string {
  const withoutDate = name.replace(/^\d{8}_/, "");
  if (/\.(md|markdown)$/i.test(withoutDate)) {
    return withoutDate.replace(/\.(md|markdown)$/i, "").replace(/_/g, " ").trim() || withoutDate;
  }
  return withoutDate || name;
}

export function normalizePublicUrl(folderPath: string, name: string): string {
  const parts = [...folderPath.split("/").filter(Boolean), name];
  return `/files/${parts.map(encodeURIComponent).join("/")}`;
}
