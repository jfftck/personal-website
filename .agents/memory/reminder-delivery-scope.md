---
name: Reminder delivery scope
description: Product decision limiting reminders to page-open delivery.
---

Reminders are intentionally local and run only while the page is open. Do not reintroduce background push delivery or a production server unless the user asks for that tradeoff again.

**Why:** Reliable closed-page reminders required an always-running server, and the user decided that capability is not important enough to justify server infrastructure.

**How to apply:** Keep published builds static and reminder scheduling client-side. System notifications and built-in notification cards may still appear while the page remains open.