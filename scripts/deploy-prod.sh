#!/usr/bin/env bash

set -euo pipefail

prod_host="${GATEY_PROD_HOST:-root@192.168.2.93}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_temp="$(mktemp -d /tmp/gatey-deploy.XXXXXX)"

cleanup() {
  rm -rf "$deploy_temp"
}
trap cleanup EXIT

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "26" ]]; then
  echo "Gatey deploys must be built with Node 26; this machine has $(node --version)." >&2
  exit 1
fi

echo "Fetching the pushed main branch…"
git -C "$repo_root" fetch origin main
expected_commit="$(git -C "$repo_root" rev-parse origin/main)"
short_commit="$(git -C "$repo_root" rev-parse --short "$expected_commit")"
build_root="$deploy_temp/source"
build_env="$deploy_temp/production.env"
mkdir -p "$build_root"
git -C "$repo_root" archive "$expected_commit" | tar -x -C "$build_root"

echo "Loading the protected production build environment…"
scp "$prod_host:/etc/gatey/gatey.env" "$build_env"
chmod 600 "$build_env"
cp "$build_env" "$build_root/.env.production"

echo "Building Gatey $short_commit locally…"
npm --prefix "$build_root" ci --no-audit --no-fund
GATEY_DB_PATH="$deploy_temp/build.sqlite" NODE_ENV=production \
  npm --prefix "$build_root" run build

artifact="$deploy_temp/gatey-$short_commit.tar.gz"
tar -C "$build_root" -czf "$artifact" .next node_modules
remote_artifact="/tmp/gatey-$short_commit.tar.gz"

echo "Uploading the build to $prod_host…"
scp "$artifact" "$prod_host:$remote_artifact"

ssh "$prod_host" bash -s -- "$expected_commit" "$remote_artifact" <<'REMOTE'
set -euo pipefail

expected_commit="$1"
remote_artifact="$2"
app_user="gatey"
repo="/opt/gatey"
database="/var/lib/gatey/gatey.sqlite"
backup_dir="/var/lib/gatey/backups"
service="gatey.service"
stage="$repo/.deploy-$expected_commit"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "The remote deployment must run as root." >&2
  exit 1
fi

if [[ ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid deployment commit." >&2
  exit 1
fi

if [[ -n "$(runuser -u "$app_user" -- git -C "$repo" status --porcelain)" ]]; then
  echo "$repo has uncommitted changes; refusing to deploy." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "26" ]]; then
  echo "Gatey requires Node 26; production has $(node --version)." >&2
  exit 1
fi

if [[ -e "$stage" ]]; then
  echo "$stage already exists; refusing to overwrite it." >&2
  exit 1
fi

install -d -o "$app_user" -g "$app_user" -m 755 "$stage"
runuser -u "$app_user" -- tar -xzf "$remote_artifact" -C "$stage"
if [[ ! -f "$stage/.next/BUILD_ID" || ! -x "$stage/node_modules/.bin/next" ]]; then
  echo "The uploaded build artifact is incomplete." >&2
  exit 1
fi

install -d -o "$app_user" -g "$app_user" -m 700 "$backup_dir"
backup="$backup_dir/gatey-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
runuser -u "$app_user" -- sqlite3 "$database" ".backup '$backup'"
chmod 600 "$backup"
echo "Database backup: $backup"

runuser -u "$app_user" -- git -C "$repo" fetch --prune origin main
remote_commit="$(runuser -u "$app_user" -- git -C "$repo" rev-parse origin/main)"
if [[ "$remote_commit" != "$expected_commit" ]]; then
  echo "origin/main moved while the deployment was building; retry the deploy." >&2
  exit 1
fi

previous_commit="$(runuser -u "$app_user" -- git -C "$repo" rev-parse HEAD)"
runuser -u "$app_user" -- git -C "$repo" merge --ff-only "$expected_commit"

next_backup="$repo/.next.before-$previous_commit"
modules_backup="$repo/node_modules.before-$previous_commit"
if [[ -e "$next_backup" || -e "$modules_backup" ]]; then
  echo "A previous deployment backup is still present; refusing to overwrite it." >&2
  exit 1
fi

rollback() {
  echo "The new release failed its health check; restoring $previous_commit…" >&2
  systemctl stop "$service" || true
  if [[ -d "$repo/.next" ]]; then mv "$repo/.next" "$stage/.next.failed"; fi
  if [[ -d "$repo/node_modules" ]]; then mv "$repo/node_modules" "$stage/node_modules.failed"; fi
  if [[ -d "$next_backup" ]]; then mv "$next_backup" "$repo/.next"; fi
  if [[ -d "$modules_backup" ]]; then mv "$modules_backup" "$repo/node_modules"; fi
  runuser -u "$app_user" -- git -C "$repo" reset --hard "$previous_commit"
  systemctl start "$service"
}

systemctl stop "$service"
if [[ -d "$repo/.next" ]]; then mv "$repo/.next" "$next_backup"; fi
if [[ -d "$repo/node_modules" ]]; then mv "$repo/node_modules" "$modules_backup"; fi
mv "$stage/.next" "$repo/.next"
mv "$stage/node_modules" "$repo/node_modules"
chown -R "$app_user:$app_user" "$repo/.next" "$repo/node_modules"
systemctl start "$service"

healthy=0
for attempt in {1..20}; do
  if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3000/sign-in; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]] || ! systemctl is-active --quiet "$service"; then
  rollback
  journalctl -u "$service" -n 50 --no-pager >&2
  rm -rf "$stage"
  rm -f "$remote_artifact"
  exit 1
fi

rm -rf "$next_backup" "$modules_backup" "$stage"
rm -f "$remote_artifact"
echo "Gatey $(runuser -u "$app_user" -- git -C "$repo" rev-parse --short HEAD) is active on $(node --version)."
REMOTE
