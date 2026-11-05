import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test(
  "concurrent same-name inserts keep one file and reject the loser without replacing its object",
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
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();
    const folderPath = `concurrent-create-${randomUUID()}`;
    const name = "20261105_Simultaneous_update.md";
    const date = "2026-11-05";
    const firstObjectPath = `/objects/uploads/${randomUUID()}`;
    const secondObjectPath = `/objects/uploads/${randomUUID()}`;

    try {
      await Promise.all([
        firstClient.query("BEGIN"),
        secondClient.query("BEGIN"),
      ]);
      const [firstCheck, secondCheck] = await Promise.all([
        firstClient.query(
          `SELECT id FROM content_files
           WHERE folder_path = $1 AND name = $2 AND deleted_at IS NULL`,
          [folderPath, name],
        ),
        secondClient.query(
          `SELECT id FROM content_files
           WHERE folder_path = $1 AND name = $2 AND deleted_at IS NULL`,
          [folderPath, name],
        ),
      ]);
      assert.equal(firstCheck.rowCount, 0);
      assert.equal(secondCheck.rowCount, 0);

      await firstClient.query(
        `INSERT INTO content_files
           (name, title, folder_path, content_date, content_type, size_bytes, object_path, is_published)
         VALUES ($1, $2, $3, $4, 'text/markdown', 21, $5, true)`,
        [name, "Simultaneous update", folderPath, date, firstObjectPath],
      );
      const losingInsert = secondClient.query(
        `INSERT INTO content_files
           (name, title, folder_path, content_date, content_type, size_bytes, object_path, is_published)
         VALUES ($1, $2, $3, $4, 'text/markdown', 63, $5, true)`,
        [name, "Simultaneous update", folderPath, date, secondObjectPath],
      );

      await new Promise((resolve) => setTimeout(resolve, 25));
      await firstClient.query("COMMIT");

      let conflict;
      try {
        await losingInsert;
      } catch (error) {
        conflict = error;
      }
      assert.ok(conflict, "the second insert should lose the unique-index race");
      assert.equal(conflict.code, "23505");
      assert.equal(conflict.constraint, "content_files_folder_name_unique");
      await secondClient.query("ROLLBACK");

      const { rows } = await pool.query(
        `SELECT name, title, content_date::text AS content_date, size_bytes, object_path
         FROM content_files
         WHERE folder_path = $1 AND name = $2 AND deleted_at IS NULL`,
        [folderPath, name],
      );
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], {
        name,
        title: "Simultaneous update",
        content_date: date,
        size_bytes: 21,
        object_path: firstObjectPath,
      });
    } finally {
      await firstClient.query("ROLLBACK").catch(() => undefined);
      await secondClient.query("ROLLBACK").catch(() => undefined);
      await pool
        .query("DELETE FROM content_files WHERE folder_path = $1", [folderPath])
        .catch(() => undefined);
      firstClient.release();
      secondClient.release();
      await pool.end();
    }
  },
);
