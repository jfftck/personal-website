import { generateKeyPairSync, sign } from "node:crypto";

// Ephemeral signing keys exercise Clerk's real verification middleware without
// touching managed credentials or adding a production auth bypass.
export function createClerkTestSession() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const host = "clerk-test.clerk.accounts.dev";
  return {
    env: {
      CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }),
      CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from(`${host}$`).toString("base64")}`,
      CLERK_SECRET_KEY: "sk_test_not-a-real-key",
    },
    token(userId, extraClaims = {}) {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({
        alg: "RS256",
        typ: "JWT",
        kid: "test",
        cat: "cl_B7d4PD111AAA",
      })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        iss: `https://${host}`, sub: "user_clerk_native_test",
        azp: "http://127.0.0.1",
        sid: "sess_test", iat: now, nbf: now - 5, exp: now + 3600,
        userId, ...extraClaims,
      })).toString("base64url");
      const input = `${header}.${payload}`;
      return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
    },
  };
}

export function clerkCookie(token) {
  return `__session=${token}; __client_uat=1; __clerk_db_jwt=test-browser`;
}
