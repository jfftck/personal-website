---
name: Preview overlay compatibility
description: Avoid preview overlays that interfere with the desktop toolbar.
---

Do not enable template development banners on the desktop website without checking its top-bar controls.

**Why:** The template's development banner covered the existing app launcher and intercepted clicks, despite the original website files being unchanged.

**How to apply:** If adding preview-only UI, verify the launcher and other fixed-position controls remain visible and clickable, not just that the page loads.
