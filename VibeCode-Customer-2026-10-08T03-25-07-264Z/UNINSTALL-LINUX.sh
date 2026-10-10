#!/usr/bin/env bash
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$HOME/.videcode-customer"
echo ""
echo "GO VIBECODE"
echo "1. Chi xoa ung dung (giu log/backup VibeCode trong thu muc nguoi dung)"
echo "2. Xoa ung dung + TOAN BO du lieu VibeCode (log/backup/trang thai)"
CHOICE="$(printenv VIDECODE_UNINSTALL_MODE 2>/dev/null || true)"
if [ -z "$CHOICE" ]; then
  if [ -t 0 ]; then
    printf "Lua chon [1]: "
    IFS= read -r CHOICE || CHOICE="1"
  else
    CHOICE="1"
  fi
fi
case "$CHOICE" in
  2|all|purge) PURGE_DATA=1 ;;
  *) PURGE_DATA=0 ;;
esac
if [ -f "$ROOT/.videcode.pid" ]; then
  PID="$(cat "$ROOT/.videcode.pid" 2>/dev/null || true)"
  case "$PID" in
    ''|*[!0-9]*) ;;
    *)
      if kill -0 "$PID" >/dev/null 2>&1; then
        CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
        case "$CMD" in *VideCode*) kill "$PID" >/dev/null 2>&1 || true ;; esac
      fi
      ;;
  esac
fi
MARKER="$STATE_DIR/install-path.txt"
if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null || true)" = "$ROOT" ]; then
  rm -f "$MARKER"
fi
HELPER="${TMPDIR:-/tmp}/videcode-uninstall-$$.sh"
cat > "$HELPER" <<EOF
#!/usr/bin/env bash
sleep 2
rm -rf -- "$ROOT"
if [ "$PURGE_DATA" -eq 1 ]; then
  rm -rf -- "$STATE_DIR"
  rm -f -- "$HOME/.videcode-customer.log"
fi
rm -f -- "$HELPER"
EOF
chmod +x "$HELPER"
nohup "$HELPER" >/dev/null 2>&1 &
echo "Dang go VibeCode. Thu muc project/code cua ban se KHONG bi xoa."
if [ "$PURGE_DATA" -eq 1 ]; then
  echo "Da chon xoa toan bo du lieu VibeCode trong profile nguoi dung."
fi
true
