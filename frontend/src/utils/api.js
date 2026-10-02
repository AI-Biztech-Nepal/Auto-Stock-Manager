import axios from "axios";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

// Without a timeout, a request that never gets a response (backend stuck on someone else's
// slow request, DB pool exhausted, etc.) leaves the caller's promise pending forever — every
// page's own "loading" state just spins with no error and no way out short of a manual
// refresh. 30s is generous for a real page load but still bounds the wait.
const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 30000 });

// A stable per-browser id, minted once and kept in localStorage (so it survives restarts
// but differs between a user's phone and laptop). The backend uses it to count distinct
// devices for the dashboard "online now" pill — it's an opaque random id, not a fingerprint.
const getDeviceId = () => {
  let id = localStorage.getItem("gng_device_id");
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem("gng_device_id", id);
  }
  return id;
};

api.interceptors.request.use((config) => {
  // localStorage persists across tabs/browser restarts, matching AuthContext
  const token = localStorage.getItem("gng_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Device-Id"] = getDeviceId();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("gng_token");
      localStorage.removeItem("gng_user");
      window.location.href = "/login";
    } else if (err.config?.suppressErrorToast) {
      // A retrying call (see postWithRetry) handles its own user-facing error once it
      // actually gives up — showing this generic toast on every attempt in between would
      // just flash a scary message for a failure the retry is about to silently recover from.
    } else if (err.code === "ECONNABORTED") {
      // Fixed id: several requests timing out around the same time (a page firing off a few
      // parallel calls) collapses to one toast instead of stacking duplicates.
      toast.error("This is taking too long to load — check your connection and try again.", { id: "api-timeout" });
    } else if (!err.response) {
      toast.error("Couldn't reach the server. Check your connection and try again.", { id: "api-network" });
    }
    return Promise.reject(err);
  }
);

// Uploads are the slowest requests this app makes — real file bytes over the wire, not a small
// JSON body — and the most exposed to a flaky mobile connection dropping mid-transfer. That shows
// up as a bare network error with no response at all (err.response is undefined), not a clean
// rejection from our own backend. Retrying exactly that failure mode, and never a real server
// response (which means the request was received and the server had something to say about it,
// e.g. "file too large"), turns one dropped connection into a non-event instead of a failed upload.
export async function postWithRetry(url, data, config = {}, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.post(url, data, { ...config, suppressErrorToast: attempt < retries });
    } catch (err) {
      if (attempt >= retries || err.response) throw err;
    }
  }
}

export default api;
