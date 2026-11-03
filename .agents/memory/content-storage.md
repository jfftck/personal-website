---
name: Content storage architecture
description: Durable file storage, public delivery, and version-history boundaries for this personal website.
---

Store uploaded posts, documents, pictures, and videos in App Storage. Keep file and folder metadata in the database, and serve public content through generated `/files/...` URLs and manifests. Only the authenticated admin console may modify files; public desktop apps read the static-looking endpoints.

**Why:** the user wants one storage design for every content type, server-generated manifests, and a public site that does not appear to use an API for file delivery.

**How to apply:** keep write operations behind the owner-only Replit Auth boundary in [Admin authentication](admin-authentication.md), and have public clients consume only `/files` routes.

When changing the shape of a server-cached manifest, version its cache key or invalidate the cached record as part of the change. A deployment alone does not advance the content generation, so an older JSON shape can otherwise remain cached until a file mutation happens.

**Why:** manifest JSON is persisted in the database and keyed by content generation, which changes for data mutations but not for code deployments.

**How to apply:** include cache-shape changes in the manifest cache versioning plan; keep the public URL stable while ensuring the first request after deployment rebuilds the new response shape.

For public video GETs, keep the stable `/files/...` URL but redirect to a short-lived signed App Storage read URL instead of streaming the full video through the API. Keep HEAD responses on the public route for metadata.

**Why:** production full-file video GETs were aborted after the API began a 200 response, and the front end returned 500; HEAD and range requests through the API worked. Offloading video bytes avoids sending large streams through that proxy path.

**How to apply:** generate signed GET URLs server-side for published video objects, preserve the public `/files/...` route in manifests and app links, and do not expose storage object paths in manifests.

The private `personal-files` Git repository stores immutable JSON revision records containing metadata snapshots and App Storage object references; it never stores file bytes. The API server uses a repo-scoped GitHub credential stored in Replit Secrets, not workspace-local Git credentials. Keep replaced objects in App Storage so historical versions can be restored. If Git history cannot be written, reject the file mutation rather than silently saving without a revision.

**Why:** the user later approved connecting `personal-files` to the content backend; this supersedes the earlier decision to defer Git history.

**How to apply:** make every create, metadata/content update, move/rename, trash, and restore write a Git revision record as part of the protected admin flow. Keep the GitHub credential server-side, scoped only to this repository's contents, and present missing/invalid access as an explicit failure.

Do not seed sample or test videos; the user will add their own video files. Import only real local files or uploads.

**Why:** the user asked to exclude test videos and add their own.

**How to apply:** avoid external placeholder video records in the legacy importer and keep placeholder examples out of the active library.

Admin-authored posts and documents are Markdown. Their stored filename is generated as `YYYYMMDD_Title.md` from the selected content date and title. For uploaded assets, capture the original upload filename once and keep it immutable; the title can change to a friendlier label, and a separate description can hold additional metadata. Editing a title or date regenerates the stored filename, while descriptions are revisioned.

**Why:** the user wants to retain the upload's source name while allowing the display title and descriptive metadata to change independently.

**How to apply:** set the source name from the selected file and exclude it from metadata edits; keep the browser's native date input, validate and normalize its value after submission, and preserve the upload's actual extension.
