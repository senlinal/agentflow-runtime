#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/runtime/daily.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "AI Signal Daily is not running."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped AI Signal Daily. PID: $PID"
else
  echo "Stale PID file removed."
fi

rm -f "$PID_FILE"
