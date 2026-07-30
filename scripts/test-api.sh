#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
api_root="$repo_root/apps/api"
python_bin="$api_root/.venv/bin/python"

bash "$repo_root/scripts/setup-api.sh"

cd "$api_root"
exec "$python_bin" -m pytest -q
