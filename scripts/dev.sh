#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  kill "${api_pid:-}" "${web_pid:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev:api &
api_pid=$!
npm run dev:web &
web_pid=$!

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

exit 1
