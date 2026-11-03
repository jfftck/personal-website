---
name: Authenticated API integration tests
description: How to exercise the Replit-authenticated admin API without weakening its authorization boundary.
---

Exercise Replit Auth through a mock OIDC issuer that signs test ID tokens, including PKCE/state/nonce validation. For route guard tests, insert temporary database-backed sessions and send the same `sid` cookie as the browser. Assert anonymous requests receive 401, non-owner sessions receive 403, owner sessions succeed, and `/files/` stays public.

**Why:** A test-only authentication bypass would stop exercising the session and owner checks that protect admin mutations.

**How to apply:** Use real HTTP routes and signed OIDC claims; keep the local HTTP issuer allowance gated to test mode and never add an alternate production authentication path.
