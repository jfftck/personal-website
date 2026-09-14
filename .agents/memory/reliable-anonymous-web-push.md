---
name: Reliable anonymous web push
description: Delivery and enrollment constraints for reliable reminders without user accounts.
---

Anonymous push subscriptions must be verified with a successful setup push before they are persisted. Reminder synchronization must use absolute UTC due times, preserve sent state when content is unchanged, and keep failed creates/deletes in a persistent retry queue. Server-observed dead endpoints must be invalidated so the browser replaces rather than re-registers them.

**Why:** Unverified public enrollment permits storage abuse, server-local parsing shifts due times, dropped sync failures lose reminders or cancellations, resetting sent state duplicates notifications after reload, and retaining a dead endpoint prevents recovery.

**How to apply:** Keep UTC normalization, persistent operation retries, enrollment verification, endpoint uniqueness, leased single-flight delivery, retriable opt-out, and stale-endpoint renewal together when changing reminder delivery.