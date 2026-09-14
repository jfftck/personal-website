#!/bin/sh
# Release port 80 if a stale process is holding it
fuser -k 80/tcp 2>/dev/null || true

# The Node server serves the desktop, admin, and reminder APIs together.
node admin/server.js
