---
name: Folder conflict handling
description: Keep duplicate folder-create errors specific and recoverable in the admin flow.
---

When creating a folder, compose its full path from the selected parent and entered name, then check for an existing folder at that path before inserting. Return a specific 409 conflict message for an existing folder in that location; keep database uniqueness errors mapped to conflicts for concurrent attempts.

**Why:** the database uniqueness failure for a duplicate folder create was returned to the admin as a generic 500, which did not explain how to correct the entry.

**How to apply:** preserve the folder-create dialog and entered value on failure, show the conflict beside the name field, and clear the stale message when the user edits the name.
