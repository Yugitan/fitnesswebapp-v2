#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
api_root="$repo_root/apps/api"
python_bin="$api_root/.venv/bin/python"

if [ ! -x "$python_bin" ]; then
  python3 -m venv "$api_root/.venv"
  "$python_bin" -m pip install --upgrade pip
fi

"$python_bin" -m pip install -r "$api_root/requirements.txt"
