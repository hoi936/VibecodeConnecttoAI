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
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  APP="runtime/macos-arm64/VideCode"
  TUNNEL="runtime/tunnel-client/darwin-arm64/tunnel-client-runtime"
else
  APP="runtime/macos-x64/VideCode"
  TUNNEL="runtime/tunnel-client/darwin-amd64/tunnel-client-runtime"
fi
chmod +x "$APP"
chmod +x "$TUNNEL" >/dev/null 2>&1 || true
/usr/bin/codesign --force --sign - "$APP" >/dev/null 2>&1 || {
  echo "Khong the ky runtime macOS. Hay mo Terminal va chay lai START-MAC.command."
  read -r
  exit 1
}
# Không gỡ quarantine trên tunnel-client của OpenAI. Nếu Gatekeeper chặn,
# VibeCode sẽ fallback sang tunnel-client đã cài bằng Homebrew/PATH.
xattr -dr com.apple.quarantine "$APP" >/dev/null 2>&1 || true
"$APP" >"$HOME/.videcode-customer.log" 2>&1 &
echo $! > ".videcode.pid"
sleep 2
open "http://127.0.0.1:$ADMIN_PORT/ui/#license"
