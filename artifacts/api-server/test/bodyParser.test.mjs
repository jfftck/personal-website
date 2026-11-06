import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(apiDir, "dist/index.mjs");

async function availablePort() {
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
}

async function waitForHealth(child, url) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) return;
    } catch {
      // The child may need a moment to bind its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("API server did not become healthy in time");
}

test("malformed compressed requests do not interrupt the API", async () => {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [entryPoint], {
    cwd: apiDir,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  try {
    await waitForHealth(child, `${baseUrl}/api/healthz`);

    const trailingBytesGzip = Buffer.concat([
      gzipSync(Buffer.from('{"name":"folder","parentPath":""}')),
      Buffer.from([0, 1, 2, 3]),
    ]);
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      signal: AbortSignal.timeout(2000),
    };
    const trailingResponse = await fetch(`${baseUrl}/api/content/folders`, {
      ...requestOptions,
      body: trailingBytesGzip,
    });
    assert.ok([400, 401].includes(trailingResponse.status));

    const malformedResponse = await fetch(`${baseUrl}/api/content/folders`, {
      ...requestOptions,
      body: Buffer.from("not a gzip stream"),
    });
    assert.equal(malformedResponse.status, 400);

    const oversizedResponse = await fetch(`${baseUrl}/api/content/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100 * 1024) }),
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(oversizedResponse.status, 413);

    const health = await fetch(`${baseUrl}/api/healthz`, {
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(health.status, 200);
    assert.equal(child.exitCode, null);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
});
