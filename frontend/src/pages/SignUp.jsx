import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";

export default function SignUp() {
  const [form, setForm] = useState({ name: "", company_name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  // Set after a successful signup -- account exists but needs email verification before
  // it can log in, so there's no token to log in with yet (see backend /auth/signup).
  const [createdEmail, setCreatedEmail] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.company_name || !form.email || !form.password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords don't match");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/signup", {
        name: form.name, company_name: form.company_name,
        email: form.email, password: form.password,
      });
      setCreatedEmail(res.data.email);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.post("/auth/resend-verification", { email: createdEmail });
      toast.success("Verification email sent again — check your inbox.");
    } catch {
      toast.error("Couldn't resend right now — try again shortly.");
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
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg">AS</div>
            <div>
              <div className="font-bold text-slate-900 text-lg leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>Auto Stock Manager</div>
              <div className="text-xs text-slate-500">Inventory Manager</div>
            </div>
          </div>

          {createdEmail ? (
            <div data-testid="signup-check-email-panel">
              <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Check your email</h1>
              <p className="text-slate-500 text-sm mb-6">
                We sent a verification link to <span className="font-medium text-slate-700">{createdEmail}</span>.
                Click it to activate your workspace, then sign in.
              </p>
              <button
                type="button"
                onClick={handleResend}
                className="w-full h-10 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-all active:scale-95"
              >
                Resend email
              </button>
              <p className="text-center text-sm text-slate-500 mt-6">
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Back to sign in</Link>
              </p>
            </div>
          ) : (
          <>
          <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Create Account</h1>
          <p className="text-slate-500 text-sm mb-6">Set up a new workspace — you'll be its Admin, and can add employees once you're in.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
              <input
                data-testid="signup-name-input"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name</label>
              <input
                data-testid="signup-company-input"
                type="text"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your business name"
                autoComplete="organization"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                data-testid="signup-email-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@yourbusiness.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                data-testid="signup-password-input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
              <input
                data-testid="signup-confirm-input"
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
            <button
              data-testid="signup-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-60 mt-2"
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account? <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
