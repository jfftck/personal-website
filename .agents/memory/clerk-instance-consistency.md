---
name: Clerk instance consistency
description: Verify managed frontend and API instance alignment before interpreting browser authentication failures.
---

Check that the browser and API resolve to the same Clerk instance before treating a browser 401 as an authorization or legacy-ID bridge bug. Compare instance equality without displaying credentials.

**Why:** Managed provisioning reported success while pre-existing API keys and the newly provisioned frontend configuration still resolved to different instances. Isolated signed-cookie API tests passed, but programmatic browser sessions were rejected before reaching local authorization.

**How to apply:** Use the sanctioned idempotent provisioning flow and restart both affected workflows. If the mismatch persists, report the managed configuration blocker instead of editing managed secrets, adding bearer tokens, bypassing authorization, or declaring the migration complete.

This project uses Replit-managed Clerk rather than the creator's manually configured Clerk tenant. The manual tenant had no user accounts to preserve. Replit-managed Development and Production environments have separate user stores; the prior Replit Auth migration does not transfer users from an external Clerk tenant.

**Why:** The user chose the managed setup because it provides separate Development and Production environments with automatic key switching, and confirmed there were no manual-tenant users to carry over.

**How to apply:** Keep this app on Replit-managed Clerk. Don't substitute the manual tenant's keys; new Production users must be provisioned in the Production Clerk environment.
