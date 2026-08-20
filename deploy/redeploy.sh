#!/bin/bash
# Pulls latest main, installs any new/changed Python deps, restarts the backend under
# PM2. Run manually any time, or automatically by webhook-listener.js on every push to
# main. Mirrors the exact manual steps used to deploy the 2026-08-20 auth-hardening
# commit (git pull -> pip install -> pm2 restart), since a `pm2 restart` alone doesn't
# pick up new PyPI packages a commit might add.
set -e
cd ~/auto-stock-manager/backend
git pull origin main
venv/bin/pip install -r requirements.txt
pm2 restart auto-stock-backend
