#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -f ".videcode.pid" ]; then
  echo "VibeCode khong co PID da luu. Neu van dang chay, hay dung tien trinh VibeCode truoc khi xoa thu muc."
  exit 0
fi
PID="$(cat .videcode.pid 2>/dev/null || true)"
if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
  CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
  if printf '%s' "$CMD" | grep -q 'VideCode'; then
    kill "$PID" >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5; do
      kill -0 "$PID" >/dev/null 2>&1 || break
      sleep 0.4
    done
  fi
fi
rm -f .videcode.pid
echo "Da dung VibeCode. Bay gio ban co the xoa thu muc VibeCode nay."
