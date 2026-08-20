import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../utils/api";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  // 'checking' | 'success' | 'error' -- drives the message below, no navigation happens
  // automatically since the account still needs a real login afterward.
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This link is missing its token.");
      return;
    }
    api.get("/auth/verify-email", { params: { token } })
      .then((res) => {
        setStatus("success");
        setMessage(res.data.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.detail || "This link is invalid or has expired.");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-900">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.pexels.com/photos/11890957/pexels-photo-11890957.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')" }}
      />
      <div className="absolute inset-0 bg-slate-900/75" />

      <div className="relative z-10 w-full max-w-sm mx-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg">GG</div>
            <div className="text-left">
              <div className="font-bold text-slate-900 text-lg leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>Hamro G&G Auto</div>
              <div className="text-xs text-slate-500">Inventory Manager</div>
            </div>
          </div>

          {status === "checking" && (
            <>
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Verifying your email...</p>
            </>
          )}
          {status === "success" && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>Email verified</h1>
              <p className="text-slate-500 text-sm mb-6">{message}</p>
              <Link to="/login" className="inline-block w-full h-10 leading-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
                Sign in
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "Manrope, sans-serif" }}>Verification failed</h1>
              <p className="text-slate-500 text-sm mb-6">{message}</p>
              <Link to="/login" className="text-blue-600 font-semibold hover:underline text-sm">Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
