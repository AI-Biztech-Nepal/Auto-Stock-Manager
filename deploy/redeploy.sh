#!/bin/bash
# Pulls latest main, installs any new/changed Python deps, restarts the backend under
# PM2, then rebuilds the frontend if the push touched anything under frontend/. Run manually
# any time, or automatically by webhook-listener.js on every push to main. Mirrors the exact
# manual steps used to deploy the 2026-08-20 auth-hardening commit (git pull -> pip install ->
# pm2 restart), since a `pm2 restart` alone doesn't pick up new PyPI packages a commit might add.
#
#   FORCE_FRONTEND=1 bash deploy/redeploy.sh    # rebuild the frontend even if it didn't change
set -e
cd ~/auto-stock-manager/backend
OLD_HEAD=$(git rev-parse HEAD)
git pull origin main
venv/bin/pip install -r requirements.txt
pm2 restart auto-stock-backend

# The admin frontend is hosted here (nginx serves /var/www/auto-stock-frontend), not on Vercel.
# A failed or skipped build never takes the backend down or removes the site that is live: the
# build script only swaps the site in after it has fully succeeded.
cd ~/auto-stock-manager
if [ "${FORCE_FRONTEND:-0}" = "1" ] || ! git diff --quiet "$OLD_HEAD" HEAD -- frontend ':!frontend/android' ':!frontend/capacitor.config.json'; then
  bash deploy/build-frontend.sh || echo "frontend NOT updated (see the message above); the backend deploy itself succeeded."
fi

# Auto-deploy pipeline verified working end-to-end 2026-08-20.
