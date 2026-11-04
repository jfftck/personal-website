---
name: Settings scroll restoration
description: Preserve scroll position when a shared settings update redraws the current responsive page.
---

Settings changes can trigger a host update that redraws the current page. Preserve the active scroll container's position and restore focus without scrolling after the redraw. Desktop settings scroll in the main panel; the narrow layout scrolls the full-screen settings page.

**Why:** Rebuilding the page after a slider change can move the user away from the control, especially when desktop and mobile use different scroll containers.

**How to apply:** For live settings controls that update the shared host state, retain the current responsive scroller position and prevent focus restoration from changing it.
