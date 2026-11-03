---
name: Admin authentication
description: Provider choice and authorization boundary for the private admin console.
---

Use Replit Auth for the admin console. Permit private content mutations only when the verified OIDC username matches `REPL_OWNER`; fail closed when either value is missing. Keep `/files/` public so published content continues to behave like static files.

**Why:** The user chose not to change plans for Clerk production authentication on a personal page, and the public website must not expose its file delivery as an authenticated API.

**How to apply:** Use Replit OIDC sessions for admin routes, verify owner identity on the server, and do not put private management endpoints behind public file routes.
