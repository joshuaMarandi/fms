#!/usr/bin/env bash
# Update the running app from GitHub. Run on the server from the app folder:
#   bash scripts/deploy.sh
# Pulls main, installs exact dependencies, builds, and reloads PM2 with no downtime.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ] && [ ! -f .env ]; then
  echo "Missing .env.local. Copy .env.example to .env.local and fill it in first." >&2
  exit 1
fi

echo "==> Pulling latest code"
git fetch --prune origin
git reset --hard origin/main

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

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
