---
name: Layered-card hit tests
description: Browser hit-testing precision and scroll clipping in overlapping card layouts.
---

Test card hit targets at visible interior points, not at fractional edges or outside the scrollport.

**Why:** Browser hit testing can select a neighboring card at a point a fraction of a pixel outside its reported rectangle. Offscreen card rectangles also remain measurable after automatic scrolling, even though those points cannot receive clicks.

**How to apply:** Constrain samples to the visible scrollport and leave a small clearance from surrounding cards when asserting that an uncovered part of a card receives the click.
