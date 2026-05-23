#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/runtime"
PID_FILE="$RUNTIME_DIR/daily.pid"
LOG_FILE="$RUNTIME_DIR/daily.log"

mkdir -p "$RUNTIME_DIR"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "AI Signal Daily is already running. PID: $PID"
    if [[ -f "$RUNTIME_DIR/url.txt" ]]; then
      echo "URL: $(cat "$RUNTIME_DIR/url.txt")"
    fi
    exit 0
  fi
fi

PID="$(ROOT="$ROOT" LOG_FILE="$LOG_FILE" python3 - "$@" <<'PY'
import os
import subprocess
import sys

root = os.environ["ROOT"]
log_file = os.environ["LOG_FILE"]
log = open(log_file, "ab", buffering=0)
process = subprocess.Popen(
    ["python3", os.path.join(root, "scripts", "run_24h.py"), *sys.argv[1:]],
    stdout=log,
    stderr=subprocess.STDOUT,
    stdin=subprocess.DEVNULL,
    start_new_session=True,
)
print(process.pid)
PY
)"
echo "$PID" > "$PID_FILE"
sleep 1

echo "AI Signal Daily started. PID: $PID"
if [[ -f "$RUNTIME_DIR/url.txt" ]]; then
  echo "URL: $(cat "$RUNTIME_DIR/url.txt")"
else
  echo "URL will be written to $RUNTIME_DIR/url.txt"
fi
echo "Log: $LOG_FILE"
