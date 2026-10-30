import { createHash } from "node:crypto";

export const PUBLIC_MANIFEST_CACHE_KEY = "public-v1";

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
