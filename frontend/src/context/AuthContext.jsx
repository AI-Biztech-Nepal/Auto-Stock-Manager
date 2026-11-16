import { createContext, useContext, useEffect, useState } from "react";
import api from "../utils/api";
import { ALL_FEATURES_ON } from "../utils/permissions";
import { forgetAll } from "../utils/listCache";

const AuthContext = createContext(null);

// localStorage — persists across tabs and browser restarts until logout or token expiry (7 days)
const storage = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key),
};

// If only one of user/token survived (partial storage clear, browser extension, etc.),
// the leftover half is useless and just causes API calls to silently fail auth — drop it.
function readInitialAuth() {
  const user = storage.get("gng_user");
  let token = null;
  try { token = localStorage.getItem("gng_token") || null; } catch { token = null; }
  if (!user || !token) {
    storage.remove("gng_user");
    storage.remove("gng_token");
    return { user: null, token: null };
  }
  return { user, token };
}

export const AuthProvider = ({ children }) => {
  const initial = readInitialAuth();
  const [user, setUser] = useState(initial.user);
  const [token, setToken] = useState(initial.token);
  // Which stock.* features are on for this organization (null = not known / the portal cannot say: show everything).
  // Remembered from the last visit so a reload does not flash hidden items before the answer arrives.
  const [features, setFeatures] = useState(() => (initial.token ? storage.get("gng_features") : null));

  useEffect(() => {
    if (!user || !token) return undefined;
    let live = true;
    api.get("/features").then((r) => {
      if (!live) return;
      const f = r.data?.features ?? null;
      setFeatures(f);
      try { storage.set("gng_features", f); } catch { /* storage full or blocked: the answer still applies this session */ }
    }).catch(() => {}); // old server without the endpoint, or offline: keep what we had; the server's 403s still apply
    return () => { live = false; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any API answer of 403 {"feature": key} means that switch is off, whatever the screen thought.
  useEffect(() => {
    const onOff = (e) => {
      const key = e.detail?.feature;
      if (key) setFeatures((prev) => ({ ...(prev || ALL_FEATURES_ON), [key]: false }));
    };
    window.addEventListener("stock-feature-off", onOff);
    return () => window.removeEventListener("stock-feature-off", onOff);
  }, []);

  const login = (userData, authToken) => {
    forgetAll();
    setUser(userData);
    setFeatures(null);
    storage.remove("gng_features");
    setToken(authToken);
    storage.set("gng_user", userData);
    localStorage.setItem("gng_token", authToken);
  };

  const logout = () => {
    forgetAll();
    setUser(null);
    setToken(null);
    setFeatures(null);
    storage.remove("gng_features");
    localStorage.removeItem("gng_user");
    localStorage.removeItem("gng_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, features, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
