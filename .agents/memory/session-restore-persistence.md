---
name: Session restore persistence
description: Prevent saved desktop sessions from being overwritten while restored apps are still loading.
---

Do not serialize a restored desktop session immediately after starting app restoration. App modules hydrate asynchronously, so their saved per-app state may not be available yet; an eager save can replace the persisted state with incomplete entries.

**Why:** A page refresh can otherwise erase app-specific state before the user has interacted with the restored desktop.

**How to apply:** During session restore, preserve the stored snapshot until a real user action or a completed state change intentionally saves a new one.
