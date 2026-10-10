#!/usr/bin/env bash
set -eu

NEW_ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="$HOME/.videcode-customer"
MARKER="$STATE_DIR/install-path.txt"
PREVIOUS_MARKER="$STATE_DIR/previous-install-path.txt"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" >/dev/null 2>&1 || true

read_env_value() {
  file="$1"
  key="$2"
  fallback="$3"
  if [ ! -f "$file" ]; then
    printf '%s' "$fallback"
    return
  fi
  value="$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); v=$0} END {print v}' "$file" 2>/dev/null || true)"
  if [ -n "$value" ]; then printf '%s' "$value"; else printf '%s' "$fallback"; fi
}

copy_relative() {
  from="$1"
  to="$2"
  rel="$3"
  src="$from/$rel"
  dst="$to/$rel"
  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  cp -a "$src" "$dst"
}

stop_old() {
  old="$1"
  if [ -f "$old/.videcode.pid" ]; then
    pid="$(cat "$old/.videcode.pid" 2>/dev/null || true)"
    case "$pid" in
      ''|*[!0-9]*) ;;
      *)
        if kill -0 "$pid" >/dev/null 2>&1; then
          cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
          case "$cmd" in
            *VideCode*)
      echo "Dang dung VibeCode cu (PID $pid)..."
              kill "$pid" >/dev/null 2>&1 || true
              i=0
              while kill -0 "$pid" >/dev/null 2>&1 && [ "$i" -lt 12 ]; do
                sleep 0.25
                i=$((i + 1))
              done
              ;;
            *)
      echo "Bo qua PID cu $pid vi khong phai tien trinh VibeCode."
              ;;
          esac
        fi
        ;;
    esac
  fi

  old_port="$(read_env_value "$old/.env" "ADMIN_PORT" "3001")"
  if command -v curl >/dev/null 2>&1; then
    health="$(curl -fsS --max-time 1 "http://127.0.0.1:$old_port/health" 2>/dev/null || true)"
    case "$health" in
      *'"videcode-customer"'*)
        pid="$(printf '%s' "$health" | sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' | head -1)"
        if [ -n "$pid" ]; then
      echo "Dang dung VibeCode cu qua health endpoint (PID $pid)..."
          kill "$pid" >/dev/null 2>&1 || true
          sleep 0.8
        fi
        ;;
    esac
  fi
}

sanitize_env() {
  old="$1/.env"
  new="$2/.env"
  [ -f "$old" ] || return 0
  template="$new.update-template"
  combined="$new.update-combined"
  tmp="$new.update-tmp"
  cp "$new" "$template"

  {
    cat "$template"
    awk -F= '
      /^[A-Za-z_][A-Za-z0-9_]*=/ {
        key=$1
        lower=tolower(key)
        if (lower ~ /(private|issuer)/ || key=="ADMIN_TOKEN") next
        if (key=="VIDECODE_SELLER_MODE" || key=="VIDECODE_CUSTOMER_EDITION" || key=="VIDECODE_LICENSE_REQUIRED" || key=="VIDECODE_CUSTOMER_BUILD") next
        print
      }
    ' "$old"
    printf '%s
' "VIDECODE_LICENSE_REQUIRED=true"
    printf '%s
' "VIDECODE_CUSTOMER_EDITION=true"
    printf '%s
' "VIDECODE_SELLER_MODE=false"
  } > "$combined"

  awk '
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key=$0
      sub(/=.*/, "", key)
      if (!(key in seen)) {
        order[++count]=key
        seen[key]=1
      }
      value[key]=$0
    }
    END {
      for (i=1; i<=count; i++) print value[order[i]]
    }
  ' "$combined" > "$tmp"

  mv "$tmp" "$new"
  rm -f "$template" "$combined"
  chmod 600 "$new" >/dev/null 2>&1 || true
}

read_build_id() {
  file="$1/VIDECODE-BUILD.json"
  [ -f "$file" ] || return 0
  tr '\n' ' ' < "$file" | sed -n 's/.*"build_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

read_build_created_at() {
  file="$1/VIDECODE-BUILD.json"
  [ -f "$file" ] || return 0
  tr '\n' ' ' < "$file" | sed -n 's/.*"created_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

assert_update_compatible() {
  old="$1"
  new="$2"

  if [ -f "$old/profiles/license-public.pem" ] && [ -f "$new/profiles/license-public.pem" ]; then
    if command -v shasum >/dev/null 2>&1; then
      old_hash="$(shasum -a 256 "$old/profiles/license-public.pem" | awk '{print $1}')"
      new_hash="$(shasum -a 256 "$new/profiles/license-public.pem" | awk '{print $1}')"
    elif command -v sha256sum >/dev/null 2>&1; then
      old_hash="$(sha256sum "$old/profiles/license-public.pem" | awk '{print $1}')"
      new_hash="$(sha256sum "$new/profiles/license-public.pem" | awk '{print $1}')"
    else
      old_hash=""
      new_hash=""
    fi
    if [ -n "$old_hash" ] && [ -n "$new_hash" ] && [ "$old_hash" != "$new_hash" ]; then
      echo "Ban moi dung bo khoa license khac ban cu."
      echo "Dung cap nhat de tranh mat kich hoat; hay lien he nguoi ban."
      return 1
    fi
  fi

  case "$(uname -s 2>/dev/null || true):$(uname -m 2>/dev/null || true)" in
    Darwin:arm64) verifier_rel="runtime/macos-arm64/VideCode" ;;
    Darwin:*) verifier_rel="runtime/macos-x64/VideCode" ;;
    *) verifier_rel="runtime/linux-x64/VideCode" ;;
  esac
  verifier="$new/$verifier_rel"
  if [ -f "$old/RELEASE-MANIFEST.json" ] && [ -f "$old/$verifier_rel" ]; then
    verifier="$old/$verifier_rel"
  fi
  if [ ! -f "$verifier" ]; then
    echo "Ban moi thieu binary xac minh release."
    return 1
  fi
  chmod +x "$verifier" >/dev/null 2>&1 || true
  case "$(uname -s 2>/dev/null || true)" in
    Darwin) xattr -dr com.apple.quarantine "$verifier" >/dev/null 2>&1 || true ;;
  esac
  if ! "$verifier" --verify-release "$new" >/dev/null; then
    echo "Chu ky hoac checksum cua ban cap nhat khong hop le. Khong cap nhat."
    return 1
  fi

  old_created="$(read_build_created_at "$old")"
  new_created="$(read_build_created_at "$new")"
  if [ -n "$old_created" ] && [ -n "$new_created" ]; then
    if [[ "$new_created" < "$old_created" || "$new_created" = "$old_created" ]]; then
      echo "Ban nay khong moi hon ban dang dung."
      echo "Hien tai: $old_created"
      echo "Ban vua tai: $new_created"
      return 1
    fi
  else
    old_build="$(read_build_id "$old")"
    new_build="$(read_build_id "$new")"
    if [ -n "$old_build" ] && [ -n "$new_build" ]; then
      if [[ "$new_build" < "$old_build" || "$new_build" = "$old_build" ]]; then
        echo "Ban nay khong moi hon ban dang dung."
        echo "Hien tai: $old_build"
        echo "Ban vua tai: $new_build"
        return 1
      fi
    fi
  fi
}

echo "VibeCode Customer - Cap nhat an toan"
echo "Ban moi: $NEW_ROOT"

OLD_ROOT=""
if [ -f "$MARKER" ]; then
  OLD_ROOT="$(cat "$MARKER" 2>/dev/null || true)"
fi

if [ -z "$OLD_ROOT" ] || [ ! -d "$OLD_ROOT" ] || [ "$OLD_ROOT" = "$NEW_ROOT" ]; then
  echo "Chua tim thay ban cu tu dong. Hay chon thu muc VibeCode cu."
  if command -v zenity >/dev/null 2>&1; then
    OLD_ROOT="$(zenity --file-selection --directory --title='Chon thu muc VibeCode cu' 2>/dev/null || true)"
  elif command -v kdialog >/dev/null 2>&1; then
    OLD_ROOT="$(kdialog --getexistingdirectory "$HOME" 2>/dev/null || true)"
  else
    printf "Nhap duong dan thu muc VibeCode cu: "
    IFS= read -r OLD_ROOT
  fi
fi

if [ -z "$OLD_ROOT" ] || [ ! -d "$OLD_ROOT" ]; then
  echo "Da huy cap nhat vi chua chon duoc ban VibeCode cu."
  true
  exit 1
fi

OLD_ROOT="$(cd "$OLD_ROOT" && pwd)"
if [ "$OLD_ROOT" = "$NEW_ROOT" ]; then
  echo "Khong cap nhat de len cung thu muc."
  echo "Hay giai nen ban moi vao mot thu muc MOI roi chay lai UPDATE-LINUX.sh."
  true
  exit 1
fi

if [ ! -f "$OLD_ROOT/.env" ] && [ ! -d "$OLD_ROOT/runtime" ]; then
  echo "Thu muc da chon khong giong mot ban VibeCode Customer hop le."
  true
  exit 1
fi

OLD_STOPPED=0
UPDATE_COMPLETE=0
BACKUP_ROOT=""

rollback_on_exit() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$OLD_STOPPED" -eq 1 ] && [ "$UPDATE_COMPLETE" -eq 0 ]; then
    echo ""
    echo "CAP NHAT THAT BAI - DANG QUAY LAI BAN CU"
    stop_old "$NEW_ROOT" >/dev/null 2>&1 || true
    printf '%s
' "$OLD_ROOT" > "$MARKER"
    if [ -f "$OLD_ROOT/START-LINUX.sh" ]; then
      chmod +x "$OLD_ROOT/START-LINUX.sh" >/dev/null 2>&1 || true
      "$OLD_ROOT/START-LINUX.sh" >/dev/null 2>&1 || true
    fi
    [ -n "$BACKUP_ROOT" ] && echo "Ban sao luu: $BACKUP_ROOT"
  fi
  exit "$status"
}
trap rollback_on_exit EXIT

echo ""
echo "==> Kiem tra tuong thich ban cap nhat"
if ! assert_update_compatible "$OLD_ROOT" "$NEW_ROOT"; then
  true
  exit 1
fi

STAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_ROOT="$STATE_DIR/backups/$STAMP"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT" >/dev/null 2>&1 || true

echo ""
echo "==> Sao luu cau hinh cu"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".env"
chmod 600 "$BACKUP_ROOT/.env" >/dev/null 2>&1 || true
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/license.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/license-clock.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/mcp-upstream.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/plugins.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/codex-hooks.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/post-edit-hooks.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" "profiles/tool-overrides.json"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".videcode"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".mcp-oauth"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".mcp-state"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".mcp-checkpoints"
copy_relative "$OLD_ROOT" "$BACKUP_ROOT" ".mcp-audit.log"

echo ""
echo "==> Dung ban VibeCode cu"
stop_old "$OLD_ROOT"
OLD_STOPPED=1

echo ""
echo "==> Chuyen license, Tunnel, workspace va lich su sang ban moi"
sanitize_env "$OLD_ROOT" "$NEW_ROOT"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/license.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/license-clock.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/mcp-upstream.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/plugins.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/codex-hooks.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/post-edit-hooks.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" "profiles/tool-overrides.json"
copy_relative "$OLD_ROOT" "$NEW_ROOT" ".videcode"
copy_relative "$OLD_ROOT" "$NEW_ROOT" ".mcp-oauth"
copy_relative "$OLD_ROOT" "$NEW_ROOT" ".mcp-state"
copy_relative "$OLD_ROOT" "$NEW_ROOT" ".mcp-checkpoints"
copy_relative "$OLD_ROOT" "$NEW_ROOT" ".mcp-audit.log"

printf '%s
' "$OLD_ROOT" > "$PREVIOUS_MARKER"
printf '%s
' "$NEW_ROOT" > "$MARKER"
printf '%s | %s -> %s | backup=%s
' "$(date '+%Y-%m-%dT%H:%M:%S')" "$OLD_ROOT" "$NEW_ROOT" "$BACKUP_ROOT" >> "$STATE_DIR/update-history.log"

echo ""
echo "==> Khoi dong ban moi"
chmod +x "$NEW_ROOT/START-LINUX.sh" >/dev/null 2>&1 || true
"$NEW_ROOT/START-LINUX.sh" || true

ADMIN_PORT="$(read_env_value "$NEW_ROOT/.env" "ADMIN_PORT" "3001")"
HEALTHY=0
i=0
while [ "$i" -lt 35 ]; do
  sleep 0.5
  if command -v curl >/dev/null 2>&1; then
    health="$(curl -fsS --max-time 1 "http://127.0.0.1:$ADMIN_PORT/health" 2>/dev/null || true)"
    case "$health" in
      *'"videcode-customer"'*) HEALTHY=1; break ;;
    esac
  else
    if [ "$i" -ge 6 ]; then HEALTHY=1; break; fi
  fi
  i=$((i + 1))
done

if [ "$HEALTHY" -ne 1 ]; then
  echo ""
  echo "Ban moi khong khoi dong duoc sau khi cap nhat."
  true
  exit 1
fi

UPDATE_COMPLETE=1
echo ""
echo "CAP NHAT THANH CONG"
echo "- Ban cu van con de rollback: $OLD_ROOT"
echo "- Ban sao luu cau hinh: $BACKUP_ROOT"
echo "- Sau khi dung thu ban moi on dinh, ban co the xoa thu muc ban cu."
true
