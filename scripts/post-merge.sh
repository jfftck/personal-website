#!/bin/bash
set -e
pnpm install --frozen-lockfile
# The preserved website uses file-based content, not the scaffold database.
