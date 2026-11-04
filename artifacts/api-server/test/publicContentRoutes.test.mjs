import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import express from "express";
import test from "node:test";
import { createManifestEtag } from "../src/lib/contentManifestCache.ts";
import { ContentError } from "../src/lib/contentErrors.ts";
import { createPublicContentRouter } from "../src/routes/publicContentRouter.ts";

const objectBytes = new Map([
  ["/objects/photo", Buffer.from("image-bytes")],
  ["/objects/video", Buffer.from("video-bytes")],
  ["/objects/script", Buffer.from("<svg></svg>")],
]);
const files = new Map([
  ["pictures/photo.png", {
    name: "photo.png",
    folderPath: "pictures",
    isPublished: true,
    deletedAt: null,
    sourceUrl: null,
    objectPath: "/objects/photo",
    contentType: "image/png",
    sizeBytes: 11,
    updatedAt: new Date("2026-10-31T12:00:00.000Z"),
  }],
  ["videos/clip.mp4", {
    name: "clip.mp4",
    folderPath: "videos",
    isPublished: true,
    deletedAt: null,
    sourceUrl: null,
    objectPath: "/objects/video",
    contentType: "video/mp4",
    sizeBytes: 11,
    updatedAt: new Date("2026-10-31T12:00:00.000Z"),
  }],
  ["scripts/mark\"up.svg", {
    name: 'mark"up.svg',
    folderPath: "scripts",
    isPublished: true,
    deletedAt: null,
    sourceUrl: null,
    objectPath: "/objects/script",
    contentType: "image/svg+xml",
    sizeBytes: 11,
    updatedAt: new Date("2026-10-31T12:00:00.000Z"),
  }],
  ["legacy/manual.pdf", {
    name: "manual.pdf",
    folderPath: "legacy",
    isPublished: true,
    deletedAt: null,
    sourceUrl: "https://cdn.example.test/manual.pdf",
    objectPath: null,
    contentType: "application/pdf",
    sizeBytes: 0,
    updatedAt: new Date("2026-10-31T12:00:00.000Z"),
  }],
  ["legacy/insecure.pdf", {
    name: "insecure.pdf",
    folderPath: "legacy",
    isPublished: true,
    deletedAt: null,
    sourceUrl: "http://cdn.example.test/insecure.pdf",
    objectPath: null,
    contentType: "application/pdf",
    sizeBytes: 0,
    updatedAt: new Date("2026-10-31T12:00:00.000Z"),
  }],
]);

const manifests = new Map([
  ["", {
    manifest: {
      path: "/",
      folders: [{ name: "Pictures", path: "pictures", url: "/files/pictures/manifest.json" }],
      files: [],
      wallpapers: [],
    },
    folderCount: 1,
  }],
  ["pictures", {
    manifest: [{ filename: "photo.png", url: "/files/pictures/photo.png" }],
    folderCount: 0,
  }],
]);

let baseUrl;
let server;
let ensureCalls = 0;
const dependencies = {
  async ensureRootFolders() {
    ensureCalls++;
  },
  async getManifest(folderPath) {
    const result = manifests.get(folderPath);
    if (!result) {
      throw new ContentError(404, "Folder not found.");
    }
    return {
      ...result,
      etag: createManifestEtag({ manifest: result.manifest, folderCount: result.folderCount }),
    };
  },
  async getPublishedFile(folderPath, name) {
    return files.get(`${folderPath}/${name}`);
  },
  async getStoredObject(objectPath) {
    const bytes = objectBytes.get(objectPath);
    if (!bytes) throw new Error("Missing test object.");
    return {
      async getMetadata() {
        return [{
          size: bytes.length,
          contentType: "application/octet-stream",
          md5Hash: "test-md5",
          updated: "2026-10-31T12:00:00.000Z",
        }];
      },
      createReadStream(options = {}) {
        const start = options.start ?? 0;
        const end = options.end ?? bytes.length - 1;
        return Readable.from([bytes.subarray(start, end + 1)]);
      },
    };
  },
  async createStoredObjectReadUrl(objectPath) {
    assert.equal(objectPath, "/objects/video");
    return "https://storage.example.test/signed-video";
  },
};

test.before(async () => {
  const app = express();
  app.use("/files", createPublicContentRouter(dependencies));
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

test("root and nested manifests are public, cached, and support conditional requests", async () => {
  const rootResponse = await fetch(`${baseUrl}/files/manifest.json`);
  assert.equal(rootResponse.status, 200);
  assert.equal(rootResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.match(rootResponse.headers.get("etag"), /^W\/"[a-f0-9]{64}"$/);
  assert.equal(rootResponse.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await rootResponse.json(), manifests.get("").manifest);

  const unchanged = await fetch(`${baseUrl}/files/manifest.json`, {
    headers: { "If-None-Match": rootResponse.headers.get("etag") },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");

  const nested = await fetch(`${baseUrl}/files/pictures/manifest.json`);
  assert.equal(nested.status, 200);
  assert.equal(nested.headers.get("x-content-folders"), null);
  assert.deepEqual(await nested.json(), manifests.get("pictures").manifest);

  const nestedHead = await fetch(`${baseUrl}/files/pictures/manifest.json`, { method: "HEAD" });
  assert.equal(nestedHead.status, 200);
  assert.equal(nestedHead.headers.get("etag"), nested.headers.get("etag"));
  assert.equal(await nestedHead.text(), "");
  assert.ok(ensureCalls >= 3);
});

test("public object responses set safe headers and support HEAD and byte ranges", async () => {
  const full = await fetch(`${baseUrl}/files/pictures/photo.png`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "image/png");
  assert.equal(full.headers.get("x-content-type-options"), "nosniff");
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=60");
  assert.equal(full.headers.get("last-modified"), "Sat, 31 Oct 2026 12:00:00 GMT");
  assert.equal(full.headers.get("content-disposition"), "inline");
  assert.equal(full.headers.get("etag"), '"test-md5"');
  assert.equal(await full.text(), "image-bytes");

  const unchanged = await fetch(`${baseUrl}/files/pictures/photo.png`, {
    headers: { "If-None-Match": '"test-md5"' },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");

  const head = await fetch(`${baseUrl}/files/pictures/photo.png`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "11");
  assert.equal(await head.text(), "");

  const range = await fetch(`${baseUrl}/files/pictures/photo.png`, {
    headers: { Range: "bytes=1-3" },
  });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 1-3/11");
  assert.equal(range.headers.get("content-length"), "3");
  assert.equal(await range.text(), "mag");

  const invalidRange = await fetch(`${baseUrl}/files/pictures/photo.png`, {
    headers: { Range: "bytes=99-100" },
  });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("content-range"), "bytes */11");
});

test("unsafe active content is downloaded and video GETs redirect to signed storage URLs", async () => {
  const script = await fetch(`${baseUrl}/files/scripts/mark%22up.svg`);
  assert.equal(script.status, 200);
  assert.equal(script.headers.get("content-type"), "application/octet-stream");
  assert.equal(script.headers.get("content-disposition"), 'attachment; filename="mark_up.svg"');

  const video = await fetch(`${baseUrl}/files/videos/clip.mp4`, { redirect: "manual" });
  assert.equal(video.status, 302);
  assert.equal(video.headers.get("location"), "https://storage.example.test/signed-video");
  assert.equal(video.headers.get("cache-control"), "private, max-age=60");

  const videoHead = await fetch(`${baseUrl}/files/videos/clip.mp4`, {
    method: "HEAD",
    redirect: "manual",
  });
  assert.equal(videoHead.status, 200);
  assert.equal(videoHead.headers.get("content-length"), "11");
  assert.equal(videoHead.headers.get("location"), null);
  assert.equal(await videoHead.text(), "");
});

test("legacy external files redirect only to HTTPS sources", async () => {
  const secure = await fetch(`${baseUrl}/files/legacy/manual.pdf`, { redirect: "manual" });
  assert.equal(secure.status, 302);
  assert.equal(secure.headers.get("location"), "https://cdn.example.test/manual.pdf");

  const insecure = await fetch(`${baseUrl}/files/legacy/insecure.pdf`, { redirect: "manual" });
  assert.equal(insecure.status, 404);
  assert.equal(insecure.headers.get("location"), null);
});

test("public routes are unauthenticated, GET/HEAD-only, and reject unsafe paths", async () => {
  const publicManifest = await fetch(`${baseUrl}/files/manifest.json`);
  assert.equal(publicManifest.status, 200);

  const post = await fetch(`${baseUrl}/files/manifest.json`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");

  const missingFolder = await fetch(`${baseUrl}/files/missing/manifest.json`);
  assert.equal(missingFolder.status, 404);
  assert.deepEqual(await missingFolder.json(), { error: "Folder not found." });

  const traversal = await fetch(`${baseUrl}/files/pictures%2F..%2Fsecret`);
  assert.equal(traversal.status, 400);
});
