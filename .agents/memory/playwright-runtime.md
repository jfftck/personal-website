---
name: Playwright browser runtime
description: Local Chromium tests may be blocked by incompatible Nix system libraries.
---

When Playwright downloads Chromium successfully but fails before launching a page, the browser may not match the Nix system libraries. Broad Nix dependency additions did not resolve the local launch failure here, and manually injecting Nix libraries exposed a glibc ABI mismatch.

**Why:** The runner's browser and system-library versions can be incompatible even when the browser download succeeds.

**How to apply:** Check the shared-library error first. Avoid adding broad project-level Nix dependencies or mixing Nix glibc into the host loader path; use a compatible supported browser runtime or report the test as blocked.
