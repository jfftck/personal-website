---
name: Dynamic module retries
description: Reliable retry behavior for browser dynamic imports after a failed module fetch.
---

When a browser `import()` fails while fetching a module, retrying the same specifier can reuse the failed module-map entry instead of making a new network request. Add a unique query parameter for each retry while keeping retries bounded with backoff.

**Why:** A simulated transient 503 showed that retrying the unchanged module URL did not recover; a distinct URL caused a fresh fetch and succeeded.

**How to apply:** Use this for lazy-loaded desktop app modules and data helpers. Add a browser test where the first module request fails and the next succeeds, then assert the feature becomes available.
