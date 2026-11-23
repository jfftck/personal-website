---
name: Overview viewport restoration
description: Preserve the user's visible window position when overview mode opens and closes.
---

When overview closes, invalidate pending position frames before restoring the window strip. On mobile, restoring the scrollable wrapper while its overview transform is still animating can make scroll snapping advance by one column.

**Why:** Toggling overview without changing focus or layout should return to the same visible window, but responsive overflow changes can otherwise move it offscreen.

**How to apply:** Keep the entry scroll position and focused/layout snapshot. Restore the saved position after the transform settles when focus and layout are unchanged; if the user changes focus or rearranges windows, scroll the new focused window into view instead.
