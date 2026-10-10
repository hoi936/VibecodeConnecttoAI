#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
export BRIDGE_PORT="${BRIDGE_PORT:-3213}"
export BRIDGE_DATA_DIR="${BRIDGE_DATA_DIR:-.local/gemini-preview}"
# Monitor the old local ChatGPT instance during migration; its key stays in that process.
export BRIDGE_LEGACY_URL="${BRIDGE_LEGACY_URL-http://127.0.0.1:3210}"
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -f upstream/mcp-servers/src/filesystem/dist/index.js ]; then npm run setup; fi
if [ ! -f runtime/tunnel-client-runtime ]; then npm run setup:tunnel; fi
exec npm start
