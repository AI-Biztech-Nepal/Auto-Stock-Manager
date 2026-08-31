#!/bin/bash
# Backend/DB health watchdog for the VPS. Run from cron every 1-2 minutes:
#   */2 * * * * /home/mansa/auto-stock-manager/deploy/healthcheck.sh
#
# What it does, on every run:
#   - hits the local /api/health endpoint
#   - if the process is unreachable (curl fails entirely) -> `pm2 restart` it once
#   - if health reports database != ok, or the process is down, and the state has
#     CHANGED since last run -> logs to syslog and pings the alert webhook
#   - pings again (recovery message) when it comes back
#
# Alerting is opt-in: set ALERT_WEBHOOK below to a Discord/Slack-style webhook URL
# (expects a JSON body with a "content" field — Discord's format). Leave it blank to
# rely on syslog only (`journalctl -t autostock-health`).

set -u

URL="http://127.0.0.1:8001/api/health"
STATE_FILE="/tmp/autostock-health.state"
ALERT_WEBHOOK=""   # <-- paste a Discord/Slack webhook URL here to get pushed alerts

resp="$(curl -sS -m 10 "$URL" 2>/dev/null)"
curl_rc=$?

if [ $curl_rc -ne 0 ]; then
  new="process-down"
  # Process isn't answering at all — try to bring it back before alerting.
  pm2 restart auto-stock-backend --update-env >/dev/null 2>&1
  sleep 5
  resp="$(curl -sS -m 10 "$URL" 2>/dev/null)"
  echo "$resp" | grep -q '"database":"ok"' && new="ok"
elif echo "$resp" | grep -q '"database":"ok"'; then
  new="ok"
else
  new="db-unreachable"
fi

old="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
echo "$new" > "$STATE_FILE"
[ "$new" = "$old" ] && exit 0   # nothing changed, stay quiet

if [ "$new" = "ok" ]; then
  msg="RECOVERED: Auto Stock Manager backend + DB are healthy again."
else
  msg="DOWN: Auto Stock Manager health = '$new'. Response: ${resp:-<no response>}"
fi

logger -t autostock-health "$msg"

if [ -n "$ALERT_WEBHOOK" ]; then
  payload="$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps({"content": sys.stdin.read()}))')"
  curl -sS -m 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK" >/dev/null 2>&1
fi
