---
name: Desktop module split
description: desktop.js was split into 7 ES modules; drag targets individual windows not columns; 3-zone drop system.
---

# Desktop Module Split

The desktop.js was factored into 7 ES modules for the Niri-style tiling window manager UI.

**Key rules:**
- Drag-and-drop targets individual windows, not whole columns
- 3-zone drop system: left edge / center / right edge of each window
- Window splitting logic is in its own module

**Why:** The monolithic desktop.js was getting large; splitting by concern keeps it maintainable.

**How to apply:** Any new desktop feature goes in the appropriate module, not back into a single file.
