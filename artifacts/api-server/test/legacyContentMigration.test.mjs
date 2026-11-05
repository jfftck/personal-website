import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupLegacyImportObject,
  importLegacyContentDirectory,
  retryFailedLegacyObjectCleanup,
} from "../src/lib/legacyContentImportCore.ts";

test("re-importing legacy posts preserves catalog rows and stored object references", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "legacy-import-"));
  const postDirectory = path.join(root, "posts");
  await mkdir(path.join(postDirectory, "2026"), { recursive: true });
  await writeFile(
    path.join(postDirectory, "2026", "20261030_repeat-safe.md"),
    "# Repeat-safe import\n\nThe saved bytes should match the catalog.",
  );

  const files = [];
  const objects = new Map();
  const folders = new Set();
  let nextObjectId = 0;

  const adapter = {
    async ensureFolder(folderPath) {
      folders.add(folderPath);
    },
    async findExistingFile(folderPath, name) {
      return files.some(
        (file) => file.folderPath === folderPath && file.name === name,
      );
    },
    createObjectPath() {
      nextObjectId += 1;
      return `/objects/uploads/test-${nextObjectId}`;
    },
    async saveObject(objectPath, filePath) {
      objects.set(objectPath, await readFile(filePath));
    },
    async insertFile(file) {
      const alreadyExists = files.some(
        (existing) =>
          existing.folderPath === file.folderPath &&
          existing.name === file.name,
      );
      if (alreadyExists) return false;
      files.push({ ...file });
      return true;
    },
    async deleteObject(objectPath) {
      objects.delete(objectPath);
    },
  };

  try {
    await importLegacyContentDirectory(postDirectory, "posts", adapter);
    assert.equal(files[0].title, "repeat-safe");
    const firstImport = files.map((file) => ({
      name: file.name,
      title: file.title,
      folderPath: file.folderPath,
      objectPath: file.objectPath,
      sizeBytes: file.sizeBytes,
    }));
    const firstObjectCount = objects.size;

    await importLegacyContentDirectory(postDirectory, "posts", adapter);

    assert.equal(files.length, 1);
    assert.deepEqual(
      files.map((file) => ({
        name: file.name,
        title: file.title,
        folderPath: file.folderPath,
        objectPath: file.objectPath,
        sizeBytes: file.sizeBytes,
      })),
      firstImport,
    );
    assert.equal(objects.size, firstObjectCount);
    for (const file of files) {
      const storedObject = objects.get(file.objectPath);
      assert.ok(storedObject, `expected ${file.objectPath} to remain stored`);
      assert.equal(storedObject.byteLength, file.sizeBytes);
    }
    assert.deepEqual([...folders].sort(), ["posts", "posts/2026"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a competing import cleans up its object when the catalog insert loses a conflict", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "legacy-import-race-"));
  await writeFile(path.join(root, "20261030_race.md"), "one catalog entry");
  const objects = new Set();

  const adapter = {
    async ensureFolder() {},
    async findExistingFile() {
      return false;
    },
    createObjectPath() {
      return "/objects/uploads/race-loser";
    },
    async saveObject(objectPath) {
      objects.add(objectPath);
    },
    async insertFile() {
      return false;
    },
    async deleteObject(objectPath) {
      objects.delete(objectPath);
    },
  };

  try {
    await importLegacyContentDirectory(root, "posts", adapter);
    assert.equal(objects.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed conflict cleanup records the affected App Storage object", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "legacy-import-cleanup-"));
  await writeFile(path.join(root, "20261030_conflict.md"), "temporary object");
  const objectPath = "/objects/uploads/failed-conflict-cleanup";
  const objects = new Set();
  const recorded = [];
  const reported = [];
  const cleanupError = new Error("App Storage is temporarily unavailable.");
  const adapter = {
    async ensureFolder() {},
    async findExistingFile() {
      return false;
    },
    createObjectPath() {
      return objectPath;
    },
    async saveObject(path) {
      objects.add(path);
    },
    async insertFile() {
      return false;
    },
    async deleteObject() {
      throw cleanupError;
    },
    async recordFailedCleanup(path, error) {
      recorded.push({ path, error });
    },
    reportCleanupFailure(error, path) {
      reported.push({ path, error });
    },
  };

  try {
    await importLegacyContentDirectory(root, "posts", adapter);
    assert.deepEqual([...objects], [objectPath]);
    assert.deepEqual(recorded, [{ path: objectPath, error: cleanupError }]);
    assert.deepEqual(reported, [{ path: objectPath, error: cleanupError }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup recovery deletes only unreferenced objects and clears resolved records", async () => {
  const unreferencedPath = "/objects/uploads/unreferenced-import";
  const referencedPath = "/objects/uploads/referenced-import";
  const deleted = [];
  const cleared = [];
  const referenced = new Set([referencedPath]);

  await retryFailedLegacyObjectCleanup(
    [{ objectPath: unreferencedPath }, { objectPath: referencedPath }],
    {
      async isObjectReferenced(path) {
        return referenced.has(path);
      },
      async deleteObject(path) {
        deleted.push(path);
      },
      async clearFailedCleanup(path) {
        cleared.push(path);
      },
      async recordFailedCleanup() {
        assert.fail("successful reconciliation should not record another failure");
      },
    },
  );

  assert.deepEqual(deleted, [unreferencedPath]);
  assert.deepEqual(cleared, [unreferencedPath, referencedPath]);
});

test("failed cleanup recovery is surfaced if its durable record cannot be saved", async () => {
  const objectPath = "/objects/uploads/unrecorded-import";
  await assert.rejects(
    cleanupLegacyImportObject(objectPath, {
      async deleteObject() {
        throw new Error("App Storage delete failed.");
      },
      async recordFailedCleanup() {
        throw new Error("Database insert failed.");
      },
    }),
    new RegExp(objectPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});
