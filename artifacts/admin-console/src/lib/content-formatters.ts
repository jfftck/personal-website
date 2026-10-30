const MIME_EXTENSIONS: Record<string, string> = {
  "application/json": ".json",
  "application/msword": ".doc",
  "application/pdf": ".pdf",
  "application/rtf": ".rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/zip": ".zip",
  "application/octet-stream": ".bin",
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "text/csv": ".csv",
  "text/css": ".css",
  "text/html": ".html",
  "text/javascript": ".js",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "text/xml": ".xml",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

function sourceExtension(filename: string): string | null {
  const basename = filename.split(/[\\/]/).at(-1) ?? filename;
  const compound = /\.(tar\.bz2|tar\.gz|tar\.xz)$/i.exec(basename);
  if (compound) return compound[0].toLowerCase();
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0) return null;
  const suffix = basename.slice(dotIndex);
  return /^\.[a-z0-9]{1,12}$/i.test(suffix) ? suffix.toLowerCase() : null;
}

export function titleFromFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).at(-1) ?? filename;
  const extension = sourceExtension(basename);
  return extension ? basename.slice(0, -extension.length) : basename;
}

export function filenameFromTitle(
  title: string,
  sourceName: string,
  contentType: string,
): string {
  const extension =
    sourceExtension(sourceName) ??
    MIME_EXTENSIONS[contentType.toLowerCase().split(";")[0].trim()] ??
    ".bin";
  let stem = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!stem) stem = "file";
  stem = Array.from(stem).slice(0, Math.max(1, 255 - extension.length)).join("").replace(/-+$/g, "");
  let filename = `${stem || "file"}${extension}`;
  if (filename.toLowerCase() === "manifest.json") filename = `manifest-file${extension}`;
  return filename;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDateForApi(localDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function isImageFile(file: Pick<File, "name" | "type">): boolean {
  return (
    file.type.toLowerCase().startsWith("image/") ||
    /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name)
  );
}
