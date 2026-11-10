#!/usr/bin/env bash
# Update the running app from GitHub. Run on the server from the app folder:
#   bash scripts/deploy.sh
# Pulls main, installs exact dependencies, builds, and reloads PM2 with no downtime.
set -euo pipefail
cd "$(dirname "$0")/.."

# Run as the user that owns the app folder (the CloudPanel site user), never as root.
owner="$(stat -c '%U' .)"
if [ "$(id -un)" != "$owner" ]; then
  echo "Run this as the site user '$owner', not '$(id -un)':" >&2
  echo "  su - $owner -c 'cd $(pwd) && bash scripts/deploy.sh'" >&2
  exit 1
fi

if [ ! -f .env.local ] && [ ! -f .env ]; then
  echo "Missing .env.local. Copy .env.example to .env.local and fill it in first." >&2
  exit 1
fi

echo "==> Pulling latest code"
git fetch --prune origin
git reset --hard origin/main

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2 for $(id -un)"
  npm install -g pm2 --no-audit --no-fund
fi

echo "==> Building"
NODE_OPTIONS="--max-old-space-size=3072" npm run build

echo "==> Restarting"
if pm2 describe fms >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "==> Done. $(git log --oneline -1)"
