#!/bin/bash
set -u
APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PORT=${BRIDGE_PORT:-3213}
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "BRIDGE_PORT phải nằm trong khoảng 1024–65535."
  exit 1
fi
if /usr/bin/curl --noproxy '*' -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "Cổng $PORT đã có Code Bridge đang chạy. Hãy đóng phiên cũ trước."
  exit 1
fi
export BRIDGE_PORT="$PORT"
export BRIDGE_DATA_DIR="${BRIDGE_DATA_DIR:-$HOME/Library/Application Support/CodeBridge}"
unset BRIDGE_LEGACY_URL
/bin/mkdir -p "$BRIDGE_DATA_DIR"
"$APP_ROOT/runtime/node" "$APP_ROOT/src/server.mjs" &
SERVER_PID=$!
cleanup() {
  /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
READY=0
for ((i=0; i<80; i++)); do
  if ! /bin/kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Code Bridge đã dừng trước khi sẵn sàng. Xem lỗi ở trên."
    exit 1
  fi
  if /usr/bin/curl --noproxy '*' -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  /bin/sleep 0.25
done
if (( READY == 0 )); then
  echo "Code Bridge chưa sẵn sàng. Xem lỗi ở trên."
  exit 1
fi
echo "Code Bridge: http://127.0.0.1:$PORT/"
echo "Dữ liệu cấu hình: $BRIDGE_DATA_DIR"
echo "Giữ cửa sổ Terminal này mở; nhấn Ctrl+C để dừng."
/usr/bin/open "http://127.0.0.1:$PORT/#overview" || true
wait "$SERVER_PID"
