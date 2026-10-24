---
name: Viewer restoration
description: Preserve pending viewer selections during asynchronous session restoration.
---

Keep a restored viewer selection serializable until its manifest has loaded and the selection can be resolved.

**Why:** Session saves happen independently of manifest fetches. Saving another window or finishing synchronous desktop restoration can otherwise overwrite a pending selection before the viewer has opened its file.

**How to apply:** When adding asynchronously restored app state, preserve its pending state in snapshots, and replace it only after resolution or an explicit user selection.
