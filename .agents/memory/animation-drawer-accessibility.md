---
name: Nested settings drawers
description: Preserve keyboard and pointer access when a secondary drawer opens over a game settings dialog.
---

Keep the animation drawer outside any broad sibling-inert sweep used by the game settings dialog. When the drawer opens, it becomes the active modal; when it closes, restore the parent dialog's modal state.

**Why:** The game settings dialog and its right-side drawer are sibling overlays. Inerting all app-root children can leave the drawer visible but unable to receive input.

**How to apply:** When adding a secondary overlay to an app root, ensure each modal's inert-state management excludes the overlay that is meant to remain active, and restore focus and `aria-modal` state on close.
