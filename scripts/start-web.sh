#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-5173}"
LOCAL_URL="http://localhost:${PORT}"

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to start this project."
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting XiaoBai Amax web app..."
echo "Local page: $LOCAL_URL"

if command -v open >/dev/null 2>&1; then
  (
    sleep 2
    open "$LOCAL_URL" >/dev/null 2>&1 || true
  ) &
fi

npm --workspace @xiaobai-amax/web run dev -- --port "$PORT"
