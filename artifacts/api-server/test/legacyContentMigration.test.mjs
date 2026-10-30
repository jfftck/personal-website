import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { importLegacyContentDirectory } from "../src/lib/legacyContentImportCore.ts";

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
