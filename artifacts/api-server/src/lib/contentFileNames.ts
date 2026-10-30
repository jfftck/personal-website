export function fileExtension(name: string): string | null {
  const compound = /(\.tar\.(?:bz2|gz|xz))$/i.exec(name);
  if (compound) return compound[1].toLowerCase();
  return /(\.[a-z0-9]{1,12})$/i.exec(name)?.[1].toLowerCase() ?? null;
}

function truncateUtf16(value: string, maxLength: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maxLength) break;
    result += character;
  }
  return result;
}

export function standardFileName(title: string, date: string, extension: string): string {
  const safeExtension = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const titleExtension = fileExtension(title);
  const titleStem = titleExtension === safeExtension ? title.slice(0, -titleExtension.length) : title;
  const prefix = `${date.replaceAll("-", "")}_`;
  let stem = titleStem
    .normalize("NFC")
    .replace(/[\\/\u0000-\u001f]+/g, "_")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!stem) stem = "Untitled";
  const maxLength = Math.max(1, 255 - prefix.length - safeExtension.length);
  stem = truncateUtf16(stem, maxLength).replace(/_+$/g, "");
  return `${prefix}${stem || "Untitled"}${safeExtension}`;
}

export const CONTENT_NAME_CONFLICT_MESSAGE =
  "A file with this title and date already exists in that folder.";

export class ContentNameConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(CONTENT_NAME_CONFLICT_MESSAGE);
    this.name = "ContentNameConflictError";
  }
}

export function assertGeneratedFileNameAvailable(collision: boolean): void {
  if (collision) throw new ContentNameConflictError();
}
