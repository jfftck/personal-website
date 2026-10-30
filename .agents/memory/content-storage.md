---
name: Content storage architecture
description: Durable file storage, public delivery, and version-history boundaries for this personal website.
---

Store uploaded posts, documents, pictures, and videos in App Storage. Keep file and folder metadata in the database, and serve public content through generated `/files/...` URLs and manifests. Only the authenticated admin console may modify files; public desktop apps read the static-looking endpoints.

**Why:** the user wants one storage design for every content type, server-generated manifests, and a public site that does not appear to use an API for file delivery.

**How to apply:** keep write operations behind Clerk-protected admin endpoints, and have public clients consume only `/files` routes.

Git-backed revision history is deferred. The user chose to proceed without Git history while GitHub access was unavailable. The current trash/restore flow is not historical version recovery.

**Why:** the user explicitly chose to continue without Git history for this implementation.

**How to apply:** do not promise revision comparison or historical restore until a version-history backend is separately approved and implemented.
