---
name: Game preview isolation
description: Keep appearance samples separate from live game elements.
---

Appearance previews must use preview-specific DOM classes rather than live-game element classes.

**Why:** Reusing live-card classes in Settings made decorative samples count as dealt cards and exposed them to delegated game interactions.

**How to apply:** Share artwork generators and material variables, but isolate preview wrappers and styling from selectors used to count, move, or interact with playable pieces.
