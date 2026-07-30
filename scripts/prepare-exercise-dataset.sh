#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dataset_root="$repo_root/动作库/exercises-dataset"
dataset_file="$dataset_root/data/exercises.json"
dataset_repository="https://github.com/hasaneyldrm/exercises-dataset.git"

if [ -f "$dataset_file" ]; then
  exit 0
fi

echo "Downloading exercise dataset required for the web build..."
mkdir -p "$(dirname "$dataset_root")"
git clone --depth=1 "$dataset_repository" "$dataset_root"

if [ ! -f "$dataset_file" ]; then
  echo "Exercise dataset is missing data/exercises.json after clone." >&2
  exit 1
fi
