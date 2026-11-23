---
name: Authenticated API integration tests
description: How to exercise the Clerk-authenticated admin API without weakening its authorization boundary.
---

Exercise protected endpoints with signed Clerk session cookies and an ephemeral JWT verification key in the isolated test server, never an auth bypass. Assert anonymous requests receive 401, non-owner sessions receive 403, admitted owner sessions succeed, and `/files/` stays public. Use distinct legacy and native IDs to detect bridge mistakes.

**Why:** A test-only authentication bypass would stop exercising the session and owner checks that protect admin mutations. Clerk development-cookie authentication also expects client-update and development-browser cookies; a session cookie alone may be rejected before signature verification.

**How to apply:** Use real HTTP routes and signed claims on isolated test processes. Test fixtures may temporarily admit a uniquely generated identity; always remove that row afterward, and never change a real owner's authorization.
