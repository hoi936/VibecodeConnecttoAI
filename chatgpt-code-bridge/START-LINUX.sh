#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -f upstream/mcp-servers/src/filesystem/dist/index.js ]; then npm run setup; fi
if [ ! -f runtime/tunnel-client-runtime ]; then npm run setup:tunnel; fi
exec npm start
