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

Do not seed sample or test videos; the user will add their own video files. Import only real local files or uploads.

**Why:** the user asked to exclude test videos and add their own.

**How to apply:** avoid external placeholder video records in the legacy importer and keep placeholder examples out of the active library.

Admin-authored posts and documents are Markdown. Their stored filename is generated as `YYYYMMDD_Title.md` from the selected content date and title. For uploaded assets, keep the original upload filename as separate editable metadata, while generating the stored filename from the date, title, and actual file extension. Editing a title or date regenerates the stored filename; original-name edits remain part of revision history without changing the stored object.

**Why:** the user wants the source filename visible and editable independently from the title and generated library filename.

**How to apply:** keep the browser's native date input, validate and normalize its value after submission, preserve the upload's actual extension, and include source-name changes in content revisions.
