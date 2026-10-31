---
name: Authenticated API integration tests
description: How to exercise protected API routes in local integration tests without weakening authentication.
---

Protected API integration tests should send real signed bearer JWTs and let the production Clerk middleware verify them. For local tests, generate a short-lived signing keypair, pass only the public PEM as `CLERK_JWT_KEY` to the test server, and sign a temporary token with the private key held in test memory.

**Why:** A test-only auth bypass would stop exercising the security boundary that protects admin mutations.

**How to apply:** Use the same HTTP routes as the admin client and avoid adding alternate test authentication branches or persisting test keys.
