---
name: Popover state synchronization
description: Browser popover toggle events can arrive after subsequent state changes.
---

For popover-backed controls, derive open state from the element's current `:popover-open` state rather than trusting each toggle event's `newState`.

**Why:** Browsers may deliver toggle notifications after a rapid close-and-reopen interaction. Applying an old notification can reset the active option or keyboard selection.

**How to apply:** When synchronizing a custom select or menu with the Popover API, verify the element's current state before changing active-option, focus, or expanded state.
