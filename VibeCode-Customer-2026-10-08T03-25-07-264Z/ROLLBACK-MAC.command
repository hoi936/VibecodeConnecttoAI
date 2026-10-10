#!/usr/bin/env bash
set -eu

CURRENT_ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$HOME/.videcode-customer"
MARKER="$STATE_DIR/install-path.txt"
PREVIOUS_MARKER="$STATE_DIR/previous-install-path.txt"

read_env_value() {
  file="$1"
  key="$2"
  fallback="$3"
  if [ ! -f "$file" ]; then printf '%s' "$fallback"; return; fi
  value="$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); v=$0} END {print v}' "$file" 2>/dev/null || true)"
  if [ -n "$value" ]; then printf '%s' "$value"; else printf '%s' "$fallback"; fi
}

stop_root() {
  root="$1"
  if [ -f "$root/.videcode.pid" ]; then
    pid="$(cat "$root/.videcode.pid" 2>/dev/null || true)"
    case "$pid" in
      ''|*[!0-9]*) ;;
      *)
        if kill -0 "$pid" >/dev/null 2>&1; then
          cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
          case "$cmd" in *VideCode*) kill "$pid" >/dev/null 2>&1 || true; sleep 0.7 ;; esac
        fi
        ;;
    esac
  fi
  port="$(read_env_value "$root/.env" "ADMIN_PORT" "3001")"
  if command -v curl >/dev/null 2>&1; then
    health="$(curl -fsS --max-time 1 "http://127.0.0.1:$port/health" 2>/dev/null || true)"
    case "$health" in
      *'"videcode-customer"'*)
        pid="$(printf '%s' "$health" | sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' | head -1)"
        [ -n "$pid" ] && kill "$pid" >/dev/null 2>&1 || true
        sleep 0.7
        ;;
    esac
  fi
}

echo "VibeCode Customer - Quay lai ban truoc"
if [ ! -f "$PREVIOUS_MARKER" ]; then
  echo "Khong tim thay thong tin ban truoc. Chi rollback duoc sau khi da cap nhat bang file UPDATE."
  read -r
  exit 1
fi

OLD_ROOT="$(cat "$PREVIOUS_MARKER" 2>/dev/null || true)"
if [ -z "$OLD_ROOT" ] || [ ! -d "$OLD_ROOT" ]; then
  echo "Thu muc ban truoc khong con ton tai. Co the ban da xoa thu muc cu."
  read -r
  exit 1
fi
OLD_ROOT="$(cd "$OLD_ROOT" && pwd)"
if [ "$OLD_ROOT" = "$CURRENT_ROOT" ]; then
  echo "Ban truoc va ban hien tai dang trung nhau; khong co gi de rollback."
  read -r
  exit 1
fi
if [ ! -f "$OLD_ROOT/START-MAC.command" ]; then
  echo "Ban truoc thieu START-MAC.command. Khong rollback de tranh loi."
  read -r
  exit 1
fi

stop_root "$CURRENT_ROOT"
printf '%s
' "$OLD_ROOT" > "$MARKER"
chmod +x "$OLD_ROOT/START-MAC.command" >/dev/null 2>&1 || true
"$OLD_ROOT/START-MAC.command" >/dev/null 2>&1 || true

ADMIN_PORT="$(read_env_value "$OLD_ROOT/.env" "ADMIN_PORT" "3001")"
HEALTHY=0
i=0
while [ "$i" -lt 35 ]; do
  sleep 0.5
  if command -v curl >/dev/null 2>&1; then
    health="$(curl -fsS --max-time 1 "http://127.0.0.1:$ADMIN_PORT/health" 2>/dev/null || true)"
    case "$health" in *'"videcode-customer"'*) HEALTHY=1; break ;; esac
  else
    if [ "$i" -ge 6 ]; then HEALTHY=1; break; fi
  fi
  i=$((i + 1))
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "Ban truoc khong khoi dong duoc. Dang quay lai ban hien tai..."
  printf '%s
' "$CURRENT_ROOT" > "$MARKER"
  chmod +x "$CURRENT_ROOT/START-MAC.command" >/dev/null 2>&1 || true
  "$CURRENT_ROOT/START-MAC.command" >/dev/null 2>&1 || true
  read -r
  exit 1
fi

echo ""
echo "ROLLBACK THANH CONG"
echo "- Dang chay lai: $OLD_ROOT"
echo "- Ban vua rollback van con tai: $CURRENT_ROOT"
echo "- Project/code khong bi thay doi."
read -r
