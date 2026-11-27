import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";

const PORTAL_URL = process.env.REACT_APP_PORTAL_URL || "https://aibiztech.vercel.app";

// Where "Open Stock Manager" in the AI Biz Tech Nepal portal lands. The signed pass is after the # in the address, so it
// never reaches a server log. It is traded for a session here, then the page asked for (?to=/inventory) opens.
export default function SsoLanding() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const started = useRef(false); // a pass works once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const asked = new URLSearchParams(window.location.search).get("to") || "/";
    const to = asked.startsWith("/") && !asked.startsWith("//") && !asked.startsWith("/sso") ? asked : "/";
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!token) { navigate("/login", { replace: true }); return; }
    (async () => {
      try {
        const { data } = await api.post("/auth/sso", { token }, { suppressErrorToast: true });
        login({ username: data.username, name: data.name, role: data.role, company_name: data.company_name }, data.token);
        navigate(to, { replace: true });
      } catch (e) {
        const detail = e?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Could not sign you in.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      {error ? (
        <div className="max-w-sm space-y-4">
          <p role="alert" className="text-red-600 font-medium">{error}</p>
          <p className="flex justify-center gap-4 text-sm font-semibold">
            <a href={PORTAL_URL} target="_top" className="text-blue-600 hover:underline">Back to AI Biz Tech Nepal</a>
            <a href="/login" className="text-slate-600 hover:underline">Sign in here instead</a>
          </p>
        </div>
      ) : (
        <p className="text-slate-500">Signing you in…</p>
      )}
    </div>
  );
}
