---
name: Modal return state
description: Preserve form changes when nested dialogs return to upload or file details.
---

When creating a folder from an upload or metadata form, apply the new folder path after the folder dialog closes rather than before the modal transition.

**Why:** setting the value inside the folder save handler can briefly update form state, then lose it while the dialog closes and its owner rerenders.

**How to apply:** keep mutations and cache updates in the owner, queue the return value, then apply it after returning to the parent form. Verify the parent shows the value and can save it.
