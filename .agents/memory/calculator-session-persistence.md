---
name: Calculator session persistence
description: Scope and clear behavior for calculator history and memory saved in browser storage.
---

Calculator history and memory should survive page or app restarts through the shared browser data handler. Do not synchronize these values between separate browser sessions unless requested. Explicit clears should remove the saved value and its backup so cleared data cannot reappear.

**Why:** the persistence task required restart safety but explicitly kept cross-session synchronization out of scope; the data handler can otherwise restore a previous backup after a clear.

**How to apply:** preserve the history limit and existing control behavior, and use the shared handler for future calculator session state.
