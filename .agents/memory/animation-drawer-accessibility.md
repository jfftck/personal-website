---
name: Nested settings drawers
description: Preserve keyboard and pointer access when a secondary drawer opens over a game settings dialog.
---

Keep the animation drawer outside broad sibling-inert sweeps used by game settings, victory, and computer-error dialogs. When nested panels open, make only the top panel modal; restore the parent dialog's modal state and focus when closing.

**Why:** These panels are sibling overlays at the game root. A settings or end-screen inert sweep can leave the animation drawer visible but unable to receive input, while multiple active modal states confuse keyboard and assistive-technology navigation.

**How to apply:** When adding a modal or secondary drawer to a game root, ensure each inert-state sweep excludes overlays that must remain available, and restore focus and `aria-modal` state to the underlying panel on close.
