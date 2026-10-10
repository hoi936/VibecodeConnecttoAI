#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
export BRIDGE_PORT="${BRIDGE_PORT:-3213}"
export BRIDGE_DATA_DIR="${BRIDGE_DATA_DIR:-.local/gemini-preview}"
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -f upstream/mcp-servers/src/filesystem/dist/index.js ]; then npm run setup; fi
exec npm start
