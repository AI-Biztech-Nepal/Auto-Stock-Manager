import { createContext, useContext, useState } from "react";

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

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    storage.set("gng_user", userData);
    localStorage.setItem("gng_token", authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("gng_user");
    localStorage.removeItem("gng_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
