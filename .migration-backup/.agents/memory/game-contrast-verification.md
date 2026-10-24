---
name: Game contrast verification
description: Avoid misleading contrast measurements for gradients and different game-cell states.
---

Check numbers against revealed cells and flags against untouched cells. For a gradient, check the foreground against every stop, not just the computed background color.

**Why:** Flags remain on unopened cells. CSS gradients are background images, so their computed background color can be transparent even though a visible gradient is painted. Empty samples can also produce Infinity and falsely satisfy a minimum-ratio assertion.

**How to apply:** Use the actual game surface's computed styles, include both desktop appearances, verify samples are present, and require finite contrast results before checking the minimum ratio.

Glass is deliberately exempt from fixed accessibility contrast targets for game surfaces; verify transparency, blur, and distinguishable sides, suits, and cell states instead. Keep stronger readability checks for non-Glass accessibility palettes.

**Why:** The user explicitly said Glass should not become a high-contrast theme and accepted it not passing contrast standards.

**How to apply:** Do not replace translucent Glass colors with opaque fills just to make an automated contrast threshold pass.
