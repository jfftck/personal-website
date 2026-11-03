---
name: Settings responsive layout
description: Why Settings uses a child wrapper for container-query layout changes.
---

The Settings app root is also the app-window inline-size container, so its own container query cannot change the root grid columns. Put the responsive grid on a child layout wrapper, then use the root's container query to switch that child to the compact layout.

**Why:** A container query only styles descendants of its query container. Applying the compact grid rule to the root left the desktop sidebar track in place on narrow windows.

**How to apply:** When adjusting Settings breakpoints, target the child layout wrapper for changes to column structure; use descendant selectors for the mobile navigation and page.
