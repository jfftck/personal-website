---
name: Admin authentication
description: Provider choice and authorization boundary for the private admin console.
---

Use Replit-managed Clerk for the admin console. Preserve the curated owner-only access boundary: resolve the signed legacy subject to an existing local row and compare its stored username to `REPL_OWNER`. Never grant access based on Clerk's user-editable username or auto-provision owner rows. Keep `/files/` public.

**Why:** The user approved migrating to Clerk, but not opening the private publishing console to other accounts. Previously, only an owner-verified OIDC callback could create local user rows; a Clerk session alone does not imply authorization.

**How to apply:** Preserve existing owner rows and legacy IDs during auth changes. Signed-in accounts without an admitted row get a terminal access-denied screen, not another sign-in redirect. Never put private management endpoints behind public file routes.
