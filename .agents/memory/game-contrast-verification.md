---
name: Game contrast verification
description: Avoid misleading contrast measurements for gradients and different game-cell states.
---

Check numbers against revealed cells and flags against untouched cells. For a gradient, check the foreground against every stop, not just the computed background color.

**Why:** Flags remain on unopened cells. CSS gradients are background images, so their computed background color can be transparent even though a visible gradient is painted. Empty samples can also produce Infinity and falsely satisfy a minimum-ratio assertion.

**How to apply:** Use the actual game surface's computed styles, include both desktop appearances, verify samples are present, and require finite contrast results before checking the minimum ratio.
