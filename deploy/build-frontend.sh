#!/bin/bash
# Builds the React admin app on this VPS and publishes it for nginx (stock.hamroauto.com.np).
# Called by redeploy.sh whenever a push changed anything under frontend/; run it by hand with
#   bash ~/auto-stock-manager/deploy/build-frontend.sh
# to publish the current checkout.
#
# Safe by design: it only replaces the live site AFTER a build has fully succeeded, so a failed or
# skipped build leaves the previous version being served. It refuses to start when the server is
# short on memory (the build needs ~1.5 GB and the backend and database share this box), and runs at
# low priority so it never slows the API down.
set -e

SITE="${FRONTEND_DIR:-/var/www/auto-stock-frontend}"
MIN_FREE_MB="${MIN_FREE_MB:-1800}"
YARN="npx --yes yarn@1.22.22"

avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$avail" -lt "$MIN_FREE_MB" ]; then
  echo "frontend build skipped: only ${avail} MB of memory free (need ${MIN_FREE_MB}). The previous site is still being served."
  exit 1
fi

cd ~/auto-stock-manager/frontend
export GENERATE_SOURCEMAP=false NODE_OPTIONS="--max-old-space-size=1400" CI=false

echo "frontend: installing packages"
nice -n 15 $YARN install --frozen-lockfile --ignore-scripts --prefer-offline --silent
echo "frontend: building"
nice -n 15 $YARN build >/tmp/frontend-build.log 2>&1 || { tail -20 /tmp/frontend-build.log; echo "frontend build FAILED. The previous site is still being served."; exit 1; }
test -f build/index.html

echo "frontend: publishing to $SITE"
rsync -a --delete build/ "$SITE/"
echo "frontend published $(date -Is)"
