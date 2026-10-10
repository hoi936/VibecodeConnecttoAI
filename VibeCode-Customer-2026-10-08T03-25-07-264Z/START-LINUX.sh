#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export DOTENV_CONFIG_OVERRIDE=true
mkdir -p "$HOME/.videcode-customer"
chmod 700 "$HOME/.videcode-customer" >/dev/null 2>&1 || true
pwd > "$HOME/.videcode-customer/install-path.txt"
chmod 600 ./.env >/dev/null 2>&1 || true
ADMIN_PORT="$(awk -F= '$1=="ADMIN_PORT" {sub(/^[^=]*=/,""); v=$0} END {print v}' ./.env 2>/dev/null || true)"
[ -n "$ADMIN_PORT" ] || ADMIN_PORT="3001"
APP="runtime/linux-x64/VideCode"
chmod +x "$APP"
chmod +x "runtime/tunnel-client/linux-amd64/tunnel-client-runtime" >/dev/null 2>&1 || true
"$APP" >"$HOME/.videcode-customer.log" 2>&1 &
echo $! > ".videcode.pid"
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  nohup xdg-open "http://127.0.0.1:$ADMIN_PORT/ui/#license" >/dev/null 2>&1 &
fi
echo "VibeCode dang chay: http://127.0.0.1:$ADMIN_PORT/ui/"
