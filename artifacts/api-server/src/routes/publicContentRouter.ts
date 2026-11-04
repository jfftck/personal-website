import { Router, type Request, type Response } from "express";
import type { Readable } from "node:stream";
import type { ContentFile } from "@workspace/db";
import { ContentError } from "../lib/contentErrors.ts";
import { ifNoneMatchMatches } from "../lib/contentManifestCache.ts";

const PUBLIC_MANIFEST_CACHE_CONTROL = "public, max-age=0, must-revalidate";

type PublicManifestResult = {
  manifest: unknown;
  etag: string;
  folderCount: number;
};

type PublicStoredObject = {
  getMetadata(): Promise<[{
    size?: string | number;
    contentType?: string;
    md5Hash?: string;
    updated?: string;
  }, ...unknown[]]>;
  createReadStream(options?: { start?: number; end?: number }): Readable;
};

export type PublicContentDependencies = {
  ensureRootFolders: () => Promise<void>;
  getManifest: (folderPath: string) => Promise<PublicManifestResult>;
  getPublishedFile: (folderPath: string, name: string) => Promise<ContentFile | undefined>;
  getStoredObject: (objectPath: string) => Promise<PublicStoredObject>;
  createStoredObjectReadUrl: (objectPath: string) => Promise<string>;
};

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

async function serveManifest(
  req: Request,
  res: Response,
  folderPath: string,
  dependencies: PublicContentDependencies,
): Promise<void> {
  await dependencies.ensureRootFolders();
  const { manifest, etag, folderCount } = await dependencies.getManifest(folderPath);
  res.setHeader("Cache-Control", PUBLIC_MANIFEST_CACHE_CONTROL);
  res.setHeader("ETag", etag);
  res.type("application/json");
  if (folderPath && folderCount > 0) {
    res.setHeader("X-Content-Folders", String(folderCount));
  }
  if (ifNoneMatchMatches(req.get("If-None-Match"), etag)) {
    res.status(304).end();
    return;
  }
  res.json(manifest);
}

async function servePublicFile(
  req: Request,
  res: Response,
  parts: string[],
  dependencies: PublicContentDependencies,
): Promise<void> {
  const name = parts.at(-1);
  const folderPath = parts.slice(0, -1).join("/");
  if (!name || name.toLowerCase() === "manifest.json") {
    throw new ContentError(404, "File not found.");
  }
  const fileRow = await dependencies.getPublishedFile(folderPath, name);
  if (!fileRow) throw new ContentError(404, "File not found.");
  if (fileRow.sourceUrl) {
    const source = new URL(fileRow.sourceUrl);
    if (source.protocol !== "https:") throw new ContentError(404, "File not found.");
    res.redirect(302, source.toString());
    return;
  }
  if (!fileRow.objectPath) throw new ContentError(404, "File not found.");

  const storedFile = await dependencies.getStoredObject(fileRow.objectPath);
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
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(size));
    res.end();
    return;
  }
  if (contentType.startsWith("video/")) {
    const readUrl = await dependencies.createStoredObjectReadUrl(fileRow.objectPath);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.redirect(302, readUrl);
    return;
  }
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else {
    res.setHeader("Content-Length", String(size));
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

function handlePublicError(
  error: unknown,
  res: Response,
  next: (error?: unknown) => void,
): void {
  if (error instanceof ContentError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  next(error);
}

export function createPublicContentRouter(dependencies: PublicContentDependencies) {
  const router = Router();
  router.use((req, res, next) => {
    void (async () => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        res.status(405).end();
        return;
      }
      const segments = decodePathSegments(req.path);
      if (segments.at(-1) === "manifest.json") {
        await serveManifest(req, res, segments.slice(0, -1).join("/"), dependencies);
        return;
      }
      if (segments.length === 0) {
        await serveManifest(req, res, "", dependencies);
        return;
      }
      await servePublicFile(req, res, segments, dependencies);
    })().catch((error) => handlePublicError(error, res, next));
  });
  return router;
}
