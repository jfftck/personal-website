---
name: Workflow port collisions
description: Recover artifact workflows when a restart collides with a leftover server process.
---

If a managed artifact restart fails because its port is already in use, the previous server process may still be serving requests even though the workflow is marked failed. Stop that exact workflow and confirm its port no longer responds before restarting it; don't change the artifact's configured port to mask the stale process.

**Why:** A stopped/restarted website workflow initially reported a port collision while the old Vite server still answered requests. Stopping the workflow closed the port and allowed a clean restart.

**How to apply:** Use this for artifact-owned web services after a restart reports “port already in use.” Verify the actual listener and health response before retrying.
