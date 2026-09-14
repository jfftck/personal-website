#!/bin/sh
# Release port 80 if a stale process is holding it
fuser -k 80/tcp 2>/dev/null || true

# The Node server serves the desktop and development-only content admin.
node admin/server.js
