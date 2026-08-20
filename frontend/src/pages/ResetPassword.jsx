import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) { toast.error("This reset link is missing its token"); return; }
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Password reset — sign in with your new password.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || "This link is invalid or has expired");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-900">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.pexels.com/photos/11890957/pexels-photo-11890957.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')" }}
      />
      <div className="absolute inset-0 bg-slate-900/75" />

      <div className="relative z-10 w-full max-w-sm mx-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg">GG</div>
            <div>
              <div className="font-bold text-slate-900 text-lg leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>Hamro G&G Auto</div>
              <div className="text-xs text-slate-500">Inventory Manager</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Choose a new password</h1>
          <p className="text-slate-500 text-sm mb-6">Enter a new password for your account.</p>

          {!token ? (
            <p className="text-sm text-red-600">
              This link is missing its token — open the reset link from your email again, or{" "}
              <Link to="/forgot-password" className="text-blue-600 font-semibold hover:underline">request a new one</Link>.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-60 mt-2"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
