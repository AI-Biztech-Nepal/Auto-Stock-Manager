import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL || "";

const api = axios.create({ baseURL: `${API_URL}/api` });

api.interceptors.request.use((config) => {
  // localStorage persists across tabs/browser restarts, matching AuthContext
  const token = localStorage.getItem("gng_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("gng_token");
      localStorage.removeItem("gng_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
