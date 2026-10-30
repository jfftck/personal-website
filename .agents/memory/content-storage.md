---
name: Content storage architecture
description: Durable file storage, public delivery, and version-history boundaries for this personal website.
---

Store uploaded posts, documents, pictures, and videos in App Storage. Keep file and folder metadata in the database, and serve public content through generated `/files/...` URLs and manifests. Only the authenticated admin console may modify files; public desktop apps read the static-looking endpoints.

**Why:** the user wants one storage design for every content type, server-generated manifests, and a public site that does not appear to use an API for file delivery.

**How to apply:** keep write operations behind Clerk-protected admin endpoints, and have public clients consume only `/files` routes.

The private `personal-files` Git repository stores immutable JSON revision records containing metadata snapshots and App Storage object references; it never stores file bytes. The API server uses a repo-scoped GitHub credential stored in Replit Secrets, not workspace-local Git credentials. Keep replaced objects in App Storage so historical versions can be restored. If Git history cannot be written, reject the file mutation rather than silently saving without a revision.

**Why:** the user later approved connecting `personal-files` to the content backend; this supersedes the earlier decision to defer Git history.

**How to apply:** make every create, metadata/content update, move/rename, trash, and restore write a Git revision record as part of the protected admin flow. Keep the GitHub credential server-side, scoped only to this repository's contents, and present missing/invalid access as an explicit failure.
