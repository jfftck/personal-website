import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

test("content mutations keep calling shared manifest invalidation", async () => {
  const source = await readFile(
    new URL("../src/routes/content.ts", import.meta.url),
    "utf8",
  );
  const routeBlocks = source.split(
    /(?=contentApiRouter\.(?:get|post|patch|delete)\()/,
  );
  const routes = [
    ["post", '"/content/folders"'],
    ["patch", '"/content/folders/:folderId"'],
    ["delete", '"/content/folders/:folderId"'],
    ["post", '"/content/files"'],
    ["patch", '"/content/files/:fileId"'],
    ["delete", '"/content/files/:fileId"'],
    ["post", '"/content/files/:fileId/restore"'],
    ["post", '"/content/files/:fileId/versions/:versionId/restore"'],
  ];
  const mutationBlocks = routes.map(([method, routePath]) =>
    routeBlocks.find(
      (block) =>
        block.startsWith(`contentApiRouter.${method}(`) &&
        block.includes(routePath),
    ),
  );

  assert.equal(mutationBlocks.length, routes.length);
  for (const [index, block] of mutationBlocks.entries()) {
    assert.ok(block, `expected route ${routes[index][0]} ${routes[index][1]}`);
    assert.match(block, /await invalidatePublicManifestCache\(tx\)/);
  }
});

test(
  "manifest mutations are visible to a second API instance",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const artifactDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const requireFromDatabasePackage = createRequire(
      path.join(artifactDir, "../../lib/db/src/index.ts"),
    );
    const { Pool } = requireFromDatabasePackage("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const suffix = randomUUID();
    const destinationPath = `manifest-test-${suffix}`;
    const initialName = `manifest-current-${suffix}.txt`;
    const restoredName = `manifest-restored-${suffix}.txt`;
    const createdName = `manifest-created-${suffix}.txt`;
    const initialTitle = `Current ${suffix}`;
    const restoredTitle = `Restored ${suffix}`;
    const createdTitle = `Created ${suffix}`;
    const createdFolderPath = `manifest-folder-created-${suffix}`;
    const renamedFolderPath = `manifest-folder-renamed-${suffix}`;
    let initialFileId;
    let createdFileId;
    let testFolderId;
    let firstServer;
    let secondServer;

    const availablePort = async () => {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const port = address.port;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      return port;
    };

    const startServer = async () => {
      const port = await availablePort();
      const child = spawn(process.execPath, ["dist/index.mjs"], {
        cwd: artifactDir,
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
      });
      const baseUrl = `http://127.0.0.1:${port}`;
      const started = await waitForServer(child, `${baseUrl}/api/healthz`);
      assert.equal(started, true);
      return {
        child,
        baseUrl,
        manifestUrl: `${baseUrl}/files/manifest.json`,
        folderManifestUrl: (folderPath) =>
          `${baseUrl}/files/${folderPath
            .split("/")
            .map(encodeURIComponent)
            .join("/")}/manifest.json`,
      };
    };

    const stopServer = async (instance) => {
      if (!instance || instance.child.exitCode !== null) return;
      instance.child.kill("SIGTERM");
      await new Promise((resolve) => instance.child.once("exit", resolve));
    };

    const readManifest = async (url, etag) => {
      const response = await fetch(url, {
        headers: etag ? { "If-None-Match": etag } : {},
      });
      return {
        response,
        manifest: response.status === 200 ? await response.json() : undefined,
      };
    };

    const applyMutationAndInvalidate = async (mutate) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await mutate(client);
        await client.query(
          `INSERT INTO content_manifest_state (key, generation)
           VALUES ('public-v1', 1)
           ON CONFLICT (key) DO UPDATE
           SET generation = content_manifest_state.generation + 1,
               updated_at = now()`,
        );
        await client.query("DELETE FROM content_manifest_cache");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };

    const applyMutationAndCheckOtherServer = async (mutate, check) => {
      const before = await readManifest(firstServer.manifestUrl);
      assert.equal(before.response.status, 200);
      const oldEtag = before.response.headers.get("etag");
      assert.ok(oldEtag);

      await applyMutationAndInvalidate(mutate);

      const after = await readManifest(secondServer.manifestUrl, oldEtag);
      assert.equal(after.response.status, 200);
      assert.notEqual(after.response.headers.get("etag"), oldEtag);
      check(after.manifest);

      const unchanged = await readManifest(firstServer.manifestUrl, after.response.headers.get("etag"));
      assert.equal(unchanged.response.status, 304);
    };

    const waitForServer = async (child, healthUrl) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) return false;
        try {
          const response = await fetch(healthUrl);
          if (response.ok) return true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      child.kill("SIGTERM");
      return false;
    };

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO content_folders (name, path, parent_path)
           VALUES ($1, $1, '')`,
          [destinationPath],
        );
        const { rows: [initialFile] } = await client.query(
          `INSERT INTO content_files
             (name, title, folder_path, content_date, content_type, size_bytes, is_published)
           VALUES ($1, $2, '', '2026-10-31', 'text/plain', 1, true)
           RETURNING id`,
          [initialName, initialTitle],
        );
        initialFileId = initialFile.id;
        const snapshot = {
          name: restoredName,
          originalFileName: restoredName,
          title: restoredTitle,
          description: "",
          folderPath: "",
          contentDate: "2026-10-31",
          contentType: "text/plain",
          sizeBytes: 1,
          objectPath: null,
          sourceUrl: null,
          posterUrl: null,
          isWallpaper: false,
          isPublished: true,
          deletedAt: null,
        };
        await client.query(
          `INSERT INTO content_file_versions
             (file_id, version_number, action, snapshot, git_path, git_commit_sha)
           VALUES ($1, 1, 'updated', $2::jsonb, $3, 'manifest-cache-test')`,
          [initialFileId, JSON.stringify(snapshot), `versions/${initialFileId}/1.json`],
        );
        await client.query(
          `INSERT INTO content_manifest_state (key, generation)
           VALUES ('public-v1', 1)
           ON CONFLICT (key) DO UPDATE
           SET generation = content_manifest_state.generation + 1,
               updated_at = now()`,
        );
        await client.query("DELETE FROM content_manifest_cache");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      firstServer = await startServer();
      const baseline = await readManifest(firstServer.manifestUrl);
      assert.equal(baseline.response.status, 200);
      assert.deepEqual(Object.keys(baseline.manifest).sort(), [
        "files",
        "folders",
        "path",
        "wallpapers",
      ]);
      assert.equal(baseline.manifest.path, "/");
      assert.ok(
        baseline.manifest.files.some((file) => file.filename === initialName),
      );
      const destinationFolder = baseline.manifest.folders.find(
        (folder) => folder.path === destinationPath,
      );
      assert.equal(
        destinationFolder?.url,
        `/files/${encodeURIComponent(destinationPath)}/manifest.json`,
      );

      secondServer = await startServer();
      const unchanged = await readManifest(
        secondServer.manifestUrl,
        baseline.response.headers.get("etag"),
      );
      assert.equal(unchanged.response.status, 304);

      await applyMutationAndCheckOtherServer(
        async (client) => {
          const { rows: [createdFile] } = await client.query(
            `INSERT INTO content_files
               (name, title, folder_path, content_date, content_type, size_bytes, is_published)
             VALUES ($1, $2, '', '2026-10-31', 'text/plain', 1, true)
             RETURNING id`,
            [createdName, createdTitle],
          );
          createdFileId = createdFile.id;
        },
        (manifest) => {
          assert.ok(manifest.files.some((file) => file.filename === createdName));
        },
      );

      await applyMutationAndCheckOtherServer(
        async (client) => {
          await client.query(
            "UPDATE content_files SET folder_path = $1 WHERE id = $2",
            [destinationPath, initialFileId],
          );
        },
        (manifest) => {
          assert.ok(
            !manifest.files.some((file) => file.filename === initialName),
          );
        },
      );
      const movedManifest = await readManifest(
        secondServer.folderManifestUrl(destinationPath),
      );
      assert.equal(movedManifest.response.status, 200);
      assert.ok(
        movedManifest.manifest.some((file) => file.filename === initialName),
      );

      await applyMutationAndCheckOtherServer(
        async (client) => {
          await client.query(
            "UPDATE content_files SET deleted_at = now() WHERE id = $1",
            [createdFileId],
          );
        },
        (manifest) => {
          assert.ok(
            !manifest.files.some((file) => file.filename === createdName),
          );
        },
      );

      await applyMutationAndCheckOtherServer(
        async (client) => {
          await client.query(
            "UPDATE content_files SET deleted_at = NULL WHERE id = $1",
            [createdFileId],
          );
        },
        (manifest) => {
          assert.ok(manifest.files.some((file) => file.filename === createdName));
        },
      );

      await applyMutationAndCheckOtherServer(
        async (client) => {
          const { rows: [version] } = await client.query(
            "SELECT snapshot FROM content_file_versions WHERE file_id = $1 ORDER BY version_number LIMIT 1",
            [initialFileId],
          );
          await client.query(
            `UPDATE content_files
             SET name = $1, title = $2, folder_path = $3, deleted_at = NULL
             WHERE id = $4`,
            [
              version.snapshot.name,
              version.snapshot.title,
              version.snapshot.folderPath,
              initialFileId,
            ],
          );
        },
        (manifest) => {
          const restored = manifest.files.find(
            (file) => file.filename === restoredName,
          );
          assert.equal(restored?.title, restoredTitle);
          assert.equal(
            restored?.url,
            `/files/${encodeURIComponent(restoredName)}`,
          );
        },
      );

      await applyMutationAndCheckOtherServer(
        async (client) => {
          const {
            rows: [folder],
          } = await client.query(
            `INSERT INTO content_folders (name, path, parent_path)
             VALUES ($1, $1, '')
             RETURNING id`,
            [createdFolderPath],
          );
          testFolderId = folder.id;
        },
        (manifest) => {
          const folder = manifest.folders.find(
            (entry) => entry.path === createdFolderPath,
          );
          assert.equal(folder?.name, createdFolderPath);
          assert.equal(
            folder?.url,
            `/files/${encodeURIComponent(createdFolderPath)}/manifest.json`,
          );
        },
      );
      const createdFolderManifest = await readManifest(
        secondServer.folderManifestUrl(createdFolderPath),
      );
      assert.equal(createdFolderManifest.response.status, 200);
      assert.deepEqual(createdFolderManifest.manifest, []);

      await applyMutationAndCheckOtherServer(
        async (client) => {
          await client.query(
            "UPDATE content_folders SET name = $1, path = $1 WHERE id = $2",
            [renamedFolderPath, testFolderId],
          );
        },
        (manifest) => {
          assert.ok(
            !manifest.folders.some(
              (entry) => entry.path === createdFolderPath,
            ),
          );
          const folder = manifest.folders.find(
            (entry) => entry.path === renamedFolderPath,
          );
          assert.equal(folder?.name, renamedFolderPath);
          assert.equal(
            folder?.url,
            `/files/${encodeURIComponent(renamedFolderPath)}/manifest.json`,
          );
        },
      );
      assert.equal(
        (
          await readManifest(
            secondServer.folderManifestUrl(createdFolderPath),
          )
        ).response.status,
        404,
      );
      const renamedFolderManifest = await readManifest(
        secondServer.folderManifestUrl(renamedFolderPath),
      );
      assert.equal(renamedFolderManifest.response.status, 200);
      assert.deepEqual(renamedFolderManifest.manifest, []);

      await applyMutationAndCheckOtherServer(
        async (client) => {
          await client.query("DELETE FROM content_folders WHERE id = $1", [
            testFolderId,
          ]);
        },
        (manifest) => {
          assert.ok(
            !manifest.folders.some(
              (entry) => entry.path === renamedFolderPath,
            ),
          );
        },
      );
      assert.equal(
        (
          await readManifest(
            secondServer.folderManifestUrl(renamedFolderPath),
          )
        ).response.status,
        404,
      );
    } finally {
      await Promise.all([stopServer(firstServer), stopServer(secondServer)]);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (initialFileId) {
          await client.query(
            "DELETE FROM content_file_versions WHERE file_id = $1",
            [initialFileId],
          );
          await client.query("DELETE FROM content_files WHERE id = $1", [
            initialFileId,
          ]);
        }
        if (createdFileId) {
          await client.query("DELETE FROM content_files WHERE id = $1", [
            createdFileId,
          ]);
        }
        await client.query("DELETE FROM content_folders WHERE path = $1", [
          destinationPath,
        ]);
        if (testFolderId) {
          await client.query("DELETE FROM content_folders WHERE id = $1", [
            testFolderId,
          ]);
        }
        await client.query(
          "DELETE FROM content_folders WHERE path = ANY($1::text[])",
          [[createdFolderPath, renamedFolderPath]],
        );
        await client.query(
          `INSERT INTO content_manifest_state (key, generation)
           VALUES ('public-v1', 1)
           ON CONFLICT (key) DO UPDATE
           SET generation = content_manifest_state.generation + 1,
               updated_at = now()`,
        );
        await client.query("DELETE FROM content_manifest_cache");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        await pool.end();
      }
    }
  },
);
