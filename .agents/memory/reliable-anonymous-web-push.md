---
name: Reliable anonymous web push
description: Delivery and enrollment constraints for reliable reminders without user accounts.
---

Anonymous push subscriptions must be verified with a successful setup push before they are persisted. Reminder synchronization must use absolute UTC due times, preserve sent state when content is unchanged, and keep failed creates/deletes in a persistent retry queue. Server-observed dead endpoints must be invalidated so the browser replaces rather than re-registers them.

**Why:** Unverified public enrollment permits storage abuse, server-local parsing shifts due times, dropped sync failures lose reminders or cancellations, resetting sent state duplicates notifications after reload, and retaining a dead endpoint prevents recovery.

The reminder service must use an always-running Reserved VM rather than Static or Autoscale publishing.

**Why:** Enrollment requires live API routes, and due-reminder delivery depends on a server timer that must continue running while the site has no traffic.

**How to apply:** Keep UTC normalization, persistent operation retries, enrollment verification, endpoint uniqueness, leased single-flight delivery, retriable opt-out, stale-endpoint renewal, and an always-running deployment together when changing reminder delivery.