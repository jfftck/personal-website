#!/bin/sh
# Start the static web server (port 80) in the background
static-web-server -w ./.config/static-web-server.toml &
STATIC_PID=$!

# Start the admin server (port 3001) in the foreground
node admin/server.js

# When admin server exits, clean up the static server too
kill "$STATIC_PID" 2>/dev/null
