---
name: Reminder behavior
description: The personal desktop's reminder behavior must remain active only while the page is open.
---

Reminders should run only while the page is open. Do not rely on background notifications, a service worker, or a server for reminder delivery.

**Why:** The user said background reminders are not a priority and they do not need a server for them.

**How to apply:** Keep reminder scheduling in the open page and avoid restoring background or server-dependent delivery when changing reminders or calendar features.
