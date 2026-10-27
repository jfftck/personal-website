---
name: Calculator keyboard shortcuts
description: Preserve keyboard activation for native controls in the calculator.
---

The calculator's document-level keyboard handler must ignore events from native interactive controls, including buttons, so Enter and Space activate the focused control instead of being treated as calculator input.

**Why:** The global Enter shortcut intercepted keyboard activation of the range-copy button, even though pointer activation worked.

**How to apply:** When changing calculator keyboard shortcuts, keep an early return for interactive elements and cover a keyboard-triggered button action in browser tests.
