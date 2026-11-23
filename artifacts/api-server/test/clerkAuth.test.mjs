import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { createClerkTestSession, clerkCookie } from "./helpers/clerk-session.mjs";

test("Clerk cookies preserve the legacy ID owner gate and public files", { skip: !process.env.DATABASE_URL }, async () => {
  const artifactDir = path.resolve(import.meta.dirname, "..");
  const { Pool } = createRequire(path.join(artifactDir, "../../lib/db/src/index.ts"))("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const clerk = createClerkTestSession();
  const suffix = randomUUID();
  const owner = `owner-${suffix}`;
  const legacyId = `legacy-${suffix}`;
  const strangerId = `stranger-${suffix}`;
  let child;
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const request = (route, token) => fetch(`${base}${route}`, {
    headers: token ? { Cookie: clerkCookie(token) } : {},
    redirect: "manual",
  });
  try {
    await pool.query("INSERT INTO users (id, username) VALUES ($1, $2)", [legacyId, owner]);
    await pool.query("INSERT INTO users (id, username) VALUES ($1, $2)", [strangerId, `other-${suffix}`]);
    child = spawn(process.execPath, ["dist/index.mjs"], {
      cwd: artifactDir,
      env: { ...process.env, ...clerk.env, NODE_ENV: "test", PORT: String(port), REPL_OWNER: owner },
      stdio: "ignore",
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await request("/api/healthz")).ok; } catch {}
      if (ready || child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "API starts");
    assert.equal((await request("/api/content/tree")).status, 401);
    assert.equal((await request("/api/content/tree", clerk.token(legacyId))).status, 200);
    assert.equal((await request("/api/content/trash", clerk.token(legacyId))).status, 200);
    assert.equal((await request("/api/content/tree", clerk.token(strangerId))).status, 403);
    assert.equal((await request("/api/content/tree", clerk.token(`unknown-${suffix}`, { username: owner }))).status, 403, "owner username cannot grant access");
    assert.equal((await request("/api/content/tree", clerk.token(undefined, { sub: legacyId }))).status, 403, "Clerk native ID is not a legacy ID fallback");
    assert.equal((await request("/api/content/tree", clerk.token(legacyId).slice(0, -8) + "invalid")).status, 401);
    assert.equal((await request("/api/content/tree", clerk.token(legacyId, { exp: 1 }))).status, 401);
    assert.equal((await request("/files/manifest.json")).status, 200);
    for (const route of ["/api/login", "/api/callback", "/api/logout", "/api/auth/user"]) {
      assert.equal((await request(route, clerk.token(legacyId))).status, 404);
    }
    const result = await pool.query("SELECT id FROM users WHERE id = $1", [`unknown-${suffix}`]);
    assert.equal(result.rowCount, 0, "unknown identities are never provisioned");
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    await pool.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [[legacyId, strangerId]]);
    await pool.end();
  }
});
