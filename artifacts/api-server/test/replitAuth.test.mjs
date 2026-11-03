import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test(
  "Replit OIDC creates an owner session, persists it, and logout invalidates it",
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
    const ownerUsername = `owner-${randomUUID()}`;
    const userId = `oidc-test-${randomUUID()}`;
    const clientId = `oidc-client-${randomUUID()}`;
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" });
    const signingKey = { ...jwk, use: "sig", alg: "RS256", kid: "auth-test-key" };
    let issuer = "";
    let expectedNonce = "";
    let apiChild;
    let apiUrl = "";
    let sessionId = "";
    let mockIssuer;

    const tokenFor = () => {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid: "auth-test-key" }),
      ).toString("base64url");
      const claims = Buffer.from(
        JSON.stringify({
          iss: issuer,
          aud: clientId,
          sub: userId,
          iat: now,
          exp: now + 3600,
          nonce: expectedNonce,
          preferred_username: ownerUsername,
          email: `${ownerUsername}@example.test`,
          name: "Workspace Owner",
        }),
      ).toString("base64url");
      const signingInput = `${header}.${claims}`;
      const signature = sign(
        "RSA-SHA256",
        Buffer.from(signingInput),
        privateKey,
      ).toString("base64url");
      return `${signingInput}.${signature}`;
    };

    mockIssuer = createServer(async (req, res) => {
      const requestUrl = new URL(req.url ?? "/", issuer);
      res.setHeader("Content-Type", "application/json");
      if (requestUrl.pathname === "/.well-known/openid-configuration") {
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
            end_session_endpoint: `${issuer}/logout`,
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            token_endpoint_auth_methods_supported: ["none"],
            grant_types_supported: ["authorization_code", "refresh_token"],
          }),
        );
        return;
      }
      if (requestUrl.pathname === "/jwks") {
        res.end(JSON.stringify({ keys: [signingKey] }));
        return;
      }
      if (requestUrl.pathname === "/token" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const params = new URLSearchParams(body);
        assert.equal(params.get("code"), "test-code");
        assert.ok(params.get("code_verifier"));
        res.end(
          JSON.stringify({
            access_token: "test-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            id_token: tokenFor(),
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });

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

    const cookiesFrom = (response) =>
      (response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""])
        .map((cookie) => cookie.split(";", 1)[0])
        .filter(Boolean);

    try {
      await new Promise((resolve) => mockIssuer.listen(0, "localhost", resolve));
      const mockAddress = mockIssuer.address();
      assert.ok(mockAddress && typeof mockAddress !== "string");
      issuer = `http://localhost:${mockAddress.port}`;

      const apiPort = await availablePort();
      apiUrl = `http://127.0.0.1:${apiPort}`;
      apiChild = spawn(process.execPath, ["dist/index.mjs"], {
        cwd: artifactDir,
        env: {
          ...process.env,
          PORT: String(apiPort),
          NODE_ENV: "test",
          REPL_ID: clientId,
          REPL_OWNER: ownerUsername,
          ISSUER_URL: issuer,
        },
        stdio: "ignore",
      });
      assert.equal(await waitForServer(apiChild, `${apiUrl}/api/healthz`), true);

      const loginResponse = await fetch(
        `${apiUrl}/api/login?returnTo=${encodeURIComponent("/admin-console/")}`,
        { redirect: "manual" },
      );
      const loginBody = await loginResponse.text();
      assert.equal(loginResponse.status, 302, loginBody);
      const authorizationLocation = loginResponse.headers.get("location");
      assert.ok(authorizationLocation);
      const authorizationUrl = new URL(authorizationLocation);
      assert.equal(authorizationUrl.origin, issuer);
      const loginCookies = cookiesFrom(loginResponse);
      const cookieValue = (name) =>
        loginCookies.find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);
      const state = authorizationUrl.searchParams.get("state");
      expectedNonce = cookieValue("nonce") ?? "";
      assert.equal(cookieValue("state"), state);
      assert.ok(cookieValue("code_verifier"));
      assert.ok(expectedNonce);

      const callbackResponse = await fetch(
        `${apiUrl}/api/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`,
        {
          redirect: "manual",
          headers: { Cookie: loginCookies.join("; ") },
        },
      );
      assert.equal(callbackResponse.status, 302);
      assert.equal(callbackResponse.headers.get("location"), "/admin-console/");
      const sessionCookie = cookiesFrom(callbackResponse).find((cookie) =>
        cookie.startsWith("sid="),
      );
      assert.ok(sessionCookie);
      sessionId = sessionCookie.slice("sid=".length);

      const authStatus = await fetch(`${apiUrl}/api/auth/user`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(authStatus.status, 200);
      const authData = await authStatus.json();
      assert.equal(authData.isOwner, true);
      assert.equal(authData.user.username, ownerUsername);

      const logoutResponse = await fetch(
        `${apiUrl}/api/logout?returnTo=${encodeURIComponent("/admin-console/")}`,
        { redirect: "manual", headers: { Cookie: sessionCookie } },
      );
      assert.equal(logoutResponse.status, 302);

      const afterLogout = await fetch(`${apiUrl}/api/auth/user`, {
        headers: { Cookie: sessionCookie },
      });
      assert.deepEqual(await afterLogout.json(), { user: null, isOwner: false });
    } finally {
      if (apiChild && apiChild.exitCode === null) {
        apiChild.kill("SIGTERM");
        await new Promise((resolve) => apiChild.once("exit", resolve));
      }
      if (mockIssuer?.listening) {
        await new Promise((resolve, reject) =>
          mockIssuer.close((error) => (error ? reject(error) : resolve())),
        );
      }
      try {
        if (sessionId) {
          await pool.query("DELETE FROM sessions WHERE sid = $1", [sessionId]);
        }
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      } finally {
        await pool.end();
      }
    }
  },
);
