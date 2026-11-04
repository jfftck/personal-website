---
name: Desktop browser-data persistence
description: Shared persistence and recovery rules for state stored in the browser.
---

All app-local browser state in the personal desktop should use the shared data handler while keeping existing storage keys stable. The handler stores a last-known-good copy when possible, but reads must not overwrite malformed data, and an explicit removal must never restore an older copy. A write should still succeed when the browser allows writes but blocks reading the prior value.

**Why:** the user wants a standard handler throughout the desktop to prevent refresh-related data loss, without adding a server requirement.

**How to apply:** use the handler for new app preferences and session state; persist only in response to user actions or expected app state transitions, and preserve hydration guards so startup does not overwrite state before it is restored.
