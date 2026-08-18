import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { isNative, isBiometricAvailable, hasSavedCredentials, saveCredentials, verifyAndGetCredentials } from "../utils/biometric";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showBiometric, setShowBiometric] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (await isBiometricAvailable() && await hasSavedCredentials()) setShowBiometric(true);
    })();
  }, []);

  const doLogin = async (credentials) => {
    const res = await api.post("/auth/login", credentials);
    login({
      username: res.data.username,
      name: res.data.name,
      role: res.data.role,
      company_name: res.data.company_name,
    }, res.data.token);
    toast.success(`Welcome back, ${res.data.name}!`);
    navigate("/");
    return res;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) { toast.error("Please enter username and password"); return; }
    setLoading(true);
    try {
      await doLogin(form);
      if (isNative() && await isBiometricAvailable() && !(await hasSavedCredentials())) {
        try {
          await saveCredentials(form.username, form.password);
          toast.success("Biometric login enabled — you can turn it off in Settings");
        } catch { /* user can enable later from Settings */ }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const handleBiometricLogin = async () => {
    setBioLoading(true);
    try {
      const creds = await verifyAndGetCredentials();
      await doLogin({ username: creds.username, password: creds.password });
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) toast.error("Biometric login failed");
    } finally { setBioLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-900">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.pexels.com/photos/11890957/pexels-photo-11890957.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')" }}
      />
      <div className="absolute inset-0 bg-slate-900/75" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg">GG</div>
            <div>
              <div className="font-bold text-slate-900 text-lg leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>Hamro G&G Auto</div>
              <div className="text-xs text-slate-500">Inventory Manager</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Sign In</h1>
          <p className="text-slate-500 text-sm mb-6">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
              <input
                data-testid="username-input"
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                data-testid="password-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-60 mt-2"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {showBiometric && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-xs text-slate-400">or</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>
              <button
                type="button"
                data-testid="biometric-login-button"
                onClick={handleBiometricLogin}
                disabled={bioLoading}
                className="w-full h-10 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Fingerprint size={18} />
                {bioLoading ? "Verifying..." : "Login with biometrics"}
              </button>
            </>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account? <Link to="/signup" className="text-blue-600 font-semibold hover:underline">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
