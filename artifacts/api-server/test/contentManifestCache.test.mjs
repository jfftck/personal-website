import assert from "node:assert/strict";
import test from "node:test";

const { createManifestEtag, ifNoneMatchMatches } = await import(
  "../src/lib/contentManifestCache.ts"
);

test("manifest ETags are stable for equivalent serialized content", () => {
  const manifest = [{ filename: "20261030_note.md", sizeBytes: 42 }];

  assert.equal(createManifestEtag(manifest), createManifestEtag(manifest));
  assert.match(createManifestEtag(manifest), /^W\/"[a-f0-9]{64}"$/);
});

test("If-None-Match supports strong, weak, and wildcard validators", () => {
  const etag = createManifestEtag([{ filename: "note.md" }]);

  assert.equal(ifNoneMatchMatches(etag, etag), true);
  assert.equal(ifNoneMatchMatches(`"other", ${etag}`, etag), true);
  assert.equal(ifNoneMatchMatches(etag.slice(2), etag), true);
  assert.equal(ifNoneMatchMatches("*", etag), true);
  assert.equal(ifNoneMatchMatches('"other"', etag), false);
  assert.equal(ifNoneMatchMatches(undefined, etag), false);
});
