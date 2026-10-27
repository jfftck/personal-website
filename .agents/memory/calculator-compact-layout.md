---
name: Calculator compact layout
description: Keep calculator controls inside their grid tracks in narrow windows.
---

When the calculator stacks its support controls above the number pad, explicitly tune compact button line-height and minimum height. The inherited utility font line-height can make buttons overflow their grid rows even when the keypad itself fills its available area. Preserve visible window padding when retuning the layout.

**Why:** Repeated responsive checks showed that small outer-spacing changes reduce the available keypad height, and intrinsic button line-height can push the last row past its grid boundary.

**How to apply:** For calculator changes to compact container queries or window padding, verify both support-above and support-beside layouts, including the 360px-wide case, and assert the last keypad row stays inside its grid.
