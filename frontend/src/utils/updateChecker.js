import { toast } from "sonner";

// Long-open tabs — and especially the Android WebView wrapper (capacitor.config.json
// points it at the deployed site) — can sit on a stale JS bundle for hours after a new
// version ships, which looks exactly like "the app is broken / missing pages". There's no
// service worker in this app, so this is a plain "is there a newer deploy?" poll: every
// CHECK_INTERVAL_MS we re-fetch the build fingerprint, and if it changed we drop every
// cache layer and reload onto the new version.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// CRA emits asset-manifest.json at the site root with content-hashed filenames, so its
// "main.js" entry changes on every build — a reliable version fingerprint. Vercel serves
// the real static file here (the SPA catch-all rewrite only applies to paths with no
// matching file), and the no-store + cache-buster keep every proxy layer honest.
async function currentBuildId() {
  const res = await fetch(`/asset-manifest.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`asset-manifest ${res.status}`);
  const manifest = await res.json();
  return manifest.files?.["main.js"] || JSON.stringify(manifest.files || manifest);
}

async function hardReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch {
    // best effort — a blocked caches/SW API shouldn't stop the reload
  }
  window.location.reload();
}

// Returns the interval id so callers can clear it. Safe to call once at app startup.
export function startUpdateChecker() {
  let baseline = null;

  const check = async () => {
    let id;
    try {
      id = await currentBuildId();
    } catch {
      return; // network blip — try again next interval
    }
    if (baseline === null) { baseline = id; return; }
    if (id !== baseline) {
      baseline = id; // avoid a reload loop if the reload is slow to take effect
      toast.info("Updating to the latest version…", { duration: 2500 });
      setTimeout(hardReload, 2500);
    }
  };

  check();
  return setInterval(check, CHECK_INTERVAL_MS);
}
