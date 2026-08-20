import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email"); return; }
    setLoading(true);
    try {
      // Backend always returns the same generic response whether or not the email
      // exists, to avoid letting this endpoint be used to check who's registered.
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      toast.error("Something went wrong — try again shortly.");
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

          {sent ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Check your email</h1>
              <p className="text-slate-500 text-sm mb-6">
                If an account exists for <span className="font-medium text-slate-700">{email}</span>, a password
                reset link is on its way. The link expires in 1 hour.
              </p>
              <p className="text-center text-sm text-slate-500">
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Back to sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Reset password</h1>
              <p className="text-slate-500 text-sm mb-6">Enter your account email and we'll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@yourbusiness.com"
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-60 mt-2"
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                <Link to="/login" className="text-blue-600 font-semibold hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
