// Minimal GitHub webhook listener for this app specifically — no dependencies beyond
// Node's builtins. Verifies the HMAC signature GitHub sends, and on a push to main, runs
// redeploy.sh (in this same directory). Bound to 127.0.0.1 only; nginx proxies a
// /deploy-webhook location on this app's own vhost
// (/etc/nginx/sites-available/auto-stock-backend) to it over the site's existing HTTPS,
// so this is never directly internet-facing.
//
// Deliberately its own standalone process/port, not a shared one with any other app on
// this VPS (see admin-web's deploy/webhook-listener.js, which is a near-identical
// pattern for a completely unrelated repo/app) — isolation over reuse here, so a bug or
// outage in one app's auto-deploy can never affect the other's.
//
// Requires WEBHOOK_SECRET in the environment (set in webhook.ecosystem.config.js on the
// server — copy webhook.ecosystem.config.js.example and fill in a real secret; the real
// file is gitignored and must never be committed).
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.WEBHOOK_PORT || 9002;

if (!SECRET) {
  console.error('WEBHOOK_SECRET is not set — refusing to start.');
  process.exit(1);
}

function verifySignature(payload, signatureHeader) {
  if (!signatureHeader) return false;
  const digest = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let deploying = false;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy-webhook') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    if (!verifySignature(body, req.headers['x-hub-signature-256'])) {
      res.writeHead(401);
      res.end('invalid signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('invalid payload');
      return;
    }

    // GitHub's initial webhook-setup "ping" event has no `ref` — treat it the same as
    // "ignored", so signature verification can be confirmed without needing a real push.
    if (payload.ref !== 'refs/heads/main') {
      res.writeHead(200);
      res.end('ignored (not a push to main)');
      return;
    }

    if (deploying) {
      res.writeHead(200);
      res.end('deploy already in progress, skipping');
      return;
    }

    deploying = true;
    res.writeHead(200);
    res.end('deploying');

    const logFile = path.join(__dirname, 'last-deploy.log');
    exec(`bash ${path.join(__dirname, 'redeploy.sh')} > ${logFile} 2>&1`, err => {
      deploying = false;
      if (err) console.error('[deploy-webhook] redeploy failed:', err.message);
      else console.log('[deploy-webhook] redeploy succeeded');
    });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[deploy-webhook] listening on 127.0.0.1:${PORT}`));
