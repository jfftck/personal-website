import { createHash } from "node:crypto";

export const PUBLIC_MANIFEST_CACHE_KEY = "public-v2";
// Bump when the public manifest JSON shape changes; content generations track data edits only.
export const PUBLIC_MANIFEST_CACHE_FORMAT_VERSION = 3;

export function createManifestCacheFolderKey(
  folderPath: string,
  formatVersion = PUBLIC_MANIFEST_CACHE_FORMAT_VERSION,
): string {
  if (!Number.isSafeInteger(formatVersion) || formatVersion < 1) {
    throw new RangeError("Manifest cache format version must be a positive integer.");
  }
  const pathHash = createHash("sha256")
    .update(folderPath === "" ? "/" : folderPath)
    .digest("hex");
  return `__manifest_cache_v${formatVersion}__:${pathHash}`;
}

export function createManifestEtag(manifest: unknown): string {
  const serialized = JSON.stringify(manifest);
  return `W/"${createHash("sha256").update(serialized).digest("hex")}"`;
}

export function ifNoneMatchMatches(
  header: string | undefined,
  etag: string,
): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    if (value === "*") return true;
    const weakValue = value.startsWith("W/") ? value.slice(2) : value;
    const weakEtag = etag.startsWith("W/") ? etag.slice(2) : etag;
    return weakValue === weakEtag;
  });
}
