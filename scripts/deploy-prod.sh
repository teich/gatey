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

unpushed_count="$(git -C "$repo_root" rev-list --count origin/main..HEAD)"
working_tree_changes="$(git -C "$repo_root" status --porcelain)"
if [[ "$unpushed_count" -gt 0 || -n "$working_tree_changes" ]]; then
  echo >&2
  echo "WARNING: Local work will not be included in this deployment." >&2
  if [[ "$unpushed_count" -gt 0 ]]; then
    echo "$unpushed_count local commit(s) have not been pushed to origin/main:" >&2
    git -C "$repo_root" log --oneline origin/main..HEAD >&2
  fi
  if [[ -n "$working_tree_changes" ]]; then
    echo "The working tree also has uncommitted changes:" >&2
    git -C "$repo_root" status --short >&2
  fi
  echo "Gatey would deploy the older pushed origin/main instead." >&2
  if [[ ! -t 0 ]]; then
    echo "Stopping because confirmation requires an interactive terminal." >&2
    exit 1
  fi
  read -r -p "Continue with the pushed version anyway? [y/N] " continue_reply
  if [[ ! "$continue_reply" =~ ^[Yy]$ ]]; then
    echo "Deployment stopped. Push your changes, then run the deploy again."
    exit 1
  fi
fi

expected_commit="$(git -C "$repo_root" rev-parse origin/main)"
short_commit="$(git -C "$repo_root" rev-parse --short "$expected_commit")"
build_number="$(git -C "$repo_root" rev-list --count "$expected_commit")"
build_root="$deploy_temp/source"
build_env="$deploy_temp/production.env"
mkdir -p "$build_root"
git -C "$repo_root" archive "$expected_commit" | tar -x -C "$build_root"

echo "Loading the protected production build environment…"
scp "$prod_host:/etc/gatey/gatey.env" "$build_env"
chmod 600 "$build_env"
cp "$build_env" "$build_root/.env.production"

echo "Building Gatey version $build_number ($short_commit) locally…"
npm --prefix "$build_root" ci --no-audit --no-fund
GATEY_DB_PATH="$deploy_temp/build.sqlite" node "$build_root/scripts/migrate.mjs"
GATEY_DB_PATH="$deploy_temp/build.sqlite" NODE_ENV=production NEXT_PUBLIC_GATEY_VERSION="$build_number" \
  npm --prefix "$build_root" run build

# Standalone output deliberately omits static and public assets; put them beside
# its minimal server so it can serve them without the full node_modules tree.
if [[ ! -f "$build_root/.next/standalone/server.js" ]]; then
  echo "The commit being deployed does not enable Next standalone output. Commit and push the standalone deployment changes before deploying." >&2
  exit 1
fi
mkdir -p "$build_root/.next/standalone/.next"
cp -R "$build_root/.next/static" "$build_root/.next/standalone/.next/"
mkdir -p "$build_root/.next/standalone/scripts" "$build_root/.next/standalone/node_modules"
cp "$build_root/scripts/migrate.mjs" "$build_root/.next/standalone/scripts/"
cp -R "$build_root/drizzle" "$build_root/.next/standalone/"
cp -R "$build_root/node_modules/drizzle-orm" "$build_root/.next/standalone/node_modules/"
if [[ -d "$build_root/public" ]]; then
  cp -R "$build_root/public" "$build_root/.next/standalone/"
fi

artifact="$deploy_temp/gatey-$short_commit.tar.gz"
tar -C "$build_root" -czf "$artifact" .next/standalone
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
party_timer="gatey-party-scheduler.timer"
party_service="gatey-party-scheduler.service"
access_timer="gatey-access-history-scheduler.timer"
access_service="gatey-access-history-scheduler.service"
environment_file="/etc/gatey/gatey.env"
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
if [[ ! -f "$stage/.next/standalone/server.js" || ! -d "$stage/.next/standalone/.next/static" ]]; then
  echo "The uploaded build artifact is incomplete." >&2
  exit 1
fi

if ! grep -q '^GATEY_SCHEDULER_SECRET=' "$environment_file"; then
  scheduler_secret="$(openssl rand -hex 32)"
  printf '\nGATEY_SCHEDULER_SECRET=%s\n' "$scheduler_secret" >> "$environment_file"
  chmod 600 "$environment_file"
fi

if ! grep -q '^GATEY_UNIFI_WRITES=' "$environment_file"; then
  printf '\nGATEY_UNIFI_WRITES=true\n' >> "$environment_file"
  chmod 600 "$environment_file"
fi

install -d -o "$app_user" -g "$app_user" -m 700 "$backup_dir"
backup="$backup_dir/gatey-$(date -u +%Y%m%dT%H%M%SZ).sqlite"

runuser -u "$app_user" -- git -C "$repo" fetch --prune origin main
remote_commit="$(runuser -u "$app_user" -- git -C "$repo" rev-parse origin/main)"
if [[ "$remote_commit" != "$expected_commit" ]]; then
  echo "origin/main moved while the deployment was building; retry the deploy." >&2
  exit 1
fi

previous_commit="$(runuser -u "$app_user" -- git -C "$repo" rev-parse HEAD)"
runuser -u "$app_user" -- git -C "$repo" merge --ff-only "$expected_commit"

install -m 644 "$repo/systemd/$party_service" "/etc/systemd/system/$party_service"
install -m 644 "$repo/systemd/$party_timer" "/etc/systemd/system/$party_timer"
install -m 644 "$repo/systemd/$access_service" "/etc/systemd/system/$access_service"
install -m 644 "$repo/systemd/$access_timer" "/etc/systemd/system/$access_timer"
systemctl daemon-reload

next_backup="$repo/.next.before-$previous_commit"
if [[ -e "$next_backup" ]]; then
  echo "A previous deployment backup is still present; refusing to overwrite it." >&2
  exit 1
fi

rollback() {
  echo "The new release failed; restoring $previous_commit and its database…" >&2
  systemctl stop "$service" || true
  if [[ -d "$next_backup" ]]; then
    if [[ -d "$repo/.next" ]]; then mv "$repo/.next" "$stage/.next.failed"; fi
    mv "$next_backup" "$repo/.next"
  fi
  runuser -u "$app_user" -- sqlite3 "$backup" ".restore '$database'"
  runuser -u "$app_user" -- git -C "$repo" reset --hard "$previous_commit"
  systemctl start "$service"
}

systemctl stop "$service"
if ! runuser -u "$app_user" -- sqlite3 "$database" ".backup '$backup'"; then
  runuser -u "$app_user" -- git -C "$repo" reset --hard "$previous_commit"
  systemctl start "$service"
  rm -rf "$stage"
  rm -f "$remote_artifact"
  exit 1
fi
chmod 600 "$backup"
echo "Database backup: $backup"

if ! runuser -u "$app_user" -- env GATEY_DB_PATH="$database" node "$stage/.next/standalone/scripts/migrate.mjs"; then
  rollback
  rm -rf "$stage"
  rm -f "$remote_artifact"
  exit 1
fi
if [[ -d "$repo/.next" ]]; then mv "$repo/.next" "$next_backup"; fi
mv "$stage/.next" "$repo/.next"
chown -R "$app_user:$app_user" "$repo/.next"
systemctl start "$service"
sleep 1

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

systemctl enable --now "$party_timer"
if ! systemctl is-active --quiet "$party_timer"; then
  echo "The party scheduler timer did not start." >&2
  exit 1
fi
systemctl enable --now "$access_timer"
if ! systemctl is-active --quiet "$access_timer"; then
  echo "The access-history scheduler timer did not start." >&2
  exit 1
fi

rm -rf "$next_backup" "$repo/node_modules" "$stage"
rm -f "$remote_artifact"
echo "Gatey $(runuser -u "$app_user" -- git -C "$repo" rev-parse --short HEAD) is active on $(node --version)."
REMOTE
