---
name: Preview routing checks
description: Local screenshot routing can differ from the actual multi-artifact development preview.
---

Do not infer that an artifact route is broken solely from a failed localhost:80 request or the built-in screenshot result. Verify the same path through the actual development preview domain before changing artifact paths.

**Why:** In this workspace, the development domain correctly routed all artifacts while localhost:80 initially reached a stale legacy server and later had no listener. The local results were misleading; the managed artifact routes were valid.

**How to apply:** When local screenshot results disagree with running workflows, check the real development preview using curl or a browser. Check listener identity before modifying routing, and do not add a replacement proxy for a working platform route.
