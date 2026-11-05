import assert from "node:assert/strict";
import test from "node:test";
import { rethrowAfterFailedUploadCleanup } from "../src/lib/failedUploadCleanup.ts";

const objectPath = "/objects/uploads/123e4567-e89b-12d3-a456-426614174000";

function dependencies(overrides = {}) {
  const calls = { deleted: [], logged: [] };
  return {
    calls,
    deps: {
      runExclusive: async (operation) => operation(),
      hasReference: async () => false,
      deleteObject: async (path) => calls.deleted.push(path),
      logError: (error, path) => calls.logged.push({ error, path }),
      ...overrides,
    },
  };
}

test("failed catalog creation deletes an unreferenced upload and rethrows its original error", async () => {
  const originalError = new Error(
    "A file or folder with that name already exists.",
  );
  const { calls, deps } = dependencies();

  await assert.rejects(
    rethrowAfterFailedUploadCleanup(originalError, objectPath, deps),
    (error) => error === originalError,
  );
  assert.deepEqual(calls.deleted, [objectPath]);
  assert.deepEqual(calls.logged, []);
});

test("failed catalog creation retains objects referenced by a current file or revision", async () => {
  const originalError = new Error("The catalog create failed.");
  const { calls, deps } = dependencies({
    hasReference: async () => true,
  });

  await assert.rejects(
    rethrowAfterFailedUploadCleanup(originalError, objectPath, deps),
    (error) => error === originalError,
  );
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.logged, []);
});

test("cleanup failures are logged without replacing the original filename conflict", async () => {
  const originalError = new Error(
    "A file or folder with that name already exists.",
  );
  const cleanupError = new Error("App Storage delete failed.");
  const { calls, deps } = dependencies({
    deleteObject: async () => {
      throw cleanupError;
    },
  });

  await assert.rejects(
    rethrowAfterFailedUploadCleanup(originalError, objectPath, deps),
    (error) => error === originalError,
  );
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.logged, [{ error: cleanupError, path: objectPath }]);
});

test("reference-check failures do not delete the object and preserve the create error", async () => {
  const originalError = new Error("The catalog create failed.");
  const referenceError = new Error("Could not check file history.");
  const { calls, deps } = dependencies({
    hasReference: async () => {
      throw referenceError;
    },
  });

  await assert.rejects(
    rethrowAfterFailedUploadCleanup(originalError, objectPath, deps),
    (error) => error === originalError,
  );
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.logged, [{ error: referenceError, path: objectPath }]);
});
