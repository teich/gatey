#!/usr/bin/env bash

set -euo pipefail

prod_host="${GATEY_PROD_HOST:-root@192.168.2.93}"
remote_backup="/tmp/gatey-local-sync.sqlite"
local_backup="$(mktemp /tmp/gatey-local-sync.XXXXXX.sqlite)"

cleanup() {
  rm -f "$local_backup"
  ssh "$prod_host" "rm -f '$remote_backup'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creating a consistent backup on $prod_host…"
ssh "$prod_host" "sqlite3 /var/lib/gatey/gatey.sqlite \".backup '$remote_backup'\""
scp "$prod_host:$remote_backup" "$local_backup"

if [[ "$(sqlite3 "$local_backup" 'PRAGMA integrity_check;')" != "ok" ]]; then
  echo "Downloaded database failed SQLite integrity_check." >&2
  exit 1
fi

mkdir -p data
sqlite3 "$local_backup" ".backup 'data/gatey.sqlite'"
echo "Local Gatey database synchronized from production. Restart npm run dev if it is already running."
