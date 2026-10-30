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

type LegacyManifestEntry = {
  filename: string;
  url: string;
  poster: string;
  size: string;
};

const LEGACY_EXTERNAL_MEDIA: LegacyManifestEntry[] = [
  {
    filename: "20260514_Seattle_Walk.mp4",
    size: "124 MB",
    url: "https://media.w3.org/2010/05/sintel/trailer_hd.mp4",
    poster: "https://picsum.photos/seed/seattle14/640/360",
  },
  {
    filename: "20260417_Family_Reunion.mp4",
    size: "890 MB",
    url: "https://media.w3.org/2010/05/bunny/trailer.mp4",
    poster: "https://picsum.photos/seed/reunion17/640/360",
  },
  {
    filename: "20260203_Winter_Walk.mp4",
    size: "58 MB",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    poster: "https://picsum.photos/seed/winter03/640/360",
  },
  {
    filename: "20251224_Christmas_Party.mp4",
    size: "210 MB",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    poster: "https://picsum.photos/seed/xmasparty/640/360",
  },
];

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

function sizeFromLabel(label: unknown): number {
  if (typeof label !== "string") return 0;
  const match = /^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i.exec(label.trim());
  if (!match) return 0;
  const factor: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.round(Number(match[1]) * (factor[match[2]?.toUpperCase() ?? "B"] ?? 1));
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

async function addExternalManifestEntries(
  folderPath: string,
  entries: LegacyManifestEntry[],
) {
  for (const entry of entries) {
    if (!entry.url.startsWith("https://")) {
      continue;
    }
    const exists = await db
      .select({ id: contentFilesTable.id })
      .from(contentFilesTable)
      .where(
        and(
          eq(contentFilesTable.folderPath, folderPath),
          eq(contentFilesTable.name, entry.filename),
        ),
      )
      .limit(1);
    if (exists.length) continue;

    const match = /^(\d{4})(\d{2})(\d{2})_/.exec(entry.filename);
    const contentDate = match
      ? `${match[1]}-${match[2]}-${match[3]}`
      : new Date().toISOString().slice(0, 10);
    await db.insert(contentFilesTable).values({
      name: entry.filename,
      folderPath,
      contentDate,
      contentType: contentTypeFor(entry.filename),
      sizeBytes: sizeFromLabel(entry.size),
      sourceUrl: entry.url,
      posterUrl: typeof entry.poster === "string" ? entry.poster : null,
      isPublished: true,
    });
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
        const legacyMetadata = LEGACY_EXTERNAL_MEDIA.find(
          (entry) => entry.filename === item.name,
        );
        await db.insert(contentFilesTable).values({
          name: item.name,
          folderPath: currentFolderPath,
          contentDate: dateFor(item.name, fileInfo.mtime),
          contentType: contentTypeFor(item.name),
          sizeBytes: fileInfo.size,
          objectPath,
          posterUrl:
            typeof legacyMetadata?.poster === "string"
              ? legacyMetadata.poster
              : null,
          isPublished: true,
        });
      } catch (error) {
        await deleteStoredObject(objectPath).catch(() => undefined);
        throw error;
      }
    }
  }

  await visit(root, folderPath);
  if (folderPath === "videos") {
    await addExternalManifestEntries(folderPath, LEGACY_EXTERNAL_MEDIA);
  }
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
