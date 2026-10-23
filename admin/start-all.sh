#!/bin/sh
# Release port 80 if a stale process is holding it. fuser is optional in the
# runtime image, so fall back to the exact server command when it is absent.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 80/tcp 2>/dev/null || true
elif command -v pkill >/dev/null 2>&1; then
  pkill -f 'node admin/server.js' 2>/dev/null || true
fi

# The Node server serves the desktop and development-only content admin.
node admin/server.js
