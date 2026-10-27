#!/bin/zsh
set -e
project_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
app_path="$project_dir/release/拾片-darwin-arm64/拾片.app"
if [[ -d "$app_path" ]]; then
  open "$app_path"
else
  cd "$project_dir"
  npm run dev
fi
