import { useState } from "react";
import { ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";

const EMPTY_PW_FORM = { current_password: "", new_password: "", confirm: "" };

// Dedicated shell for the platform-owner super_admin role — deliberately not the
// company Layout, since super_admin isn't tied to any one tenant and shouldn't be
// branded as one (that shell hardcodes the company's own name/logo).
export default function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState(EMPTY_PW_FORM);
  const [saving, setSaving] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.current_password || !pwForm.new_password) { toast.error("Fill all fields"); return; }
    if (pwForm.new_password !== pwForm.confirm) { toast.error("Passwords don't match"); return; }
    if (pwForm.new_password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success("Password changed successfully!");
      setPwForm(EMPTY_PW_FORM);
      setShowPwModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    } finally { setSaving(false); }
  };

  const inp = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 h-14 flex items-center px-4 lg:px-6 gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <ShieldCheck size={16} className="text-white" />
        </div>
        <div className="leading-tight">
          <div className="font-bold text-sm text-white" style={{ fontFamily: "Manrope, sans-serif" }}>Super Admin</div>
          <div className="text-[11px] text-slate-400">Platform Console</div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right leading-tight">
            <div className="text-sm font-medium text-white">{user?.name}</div>
            <div className="text-[11px] text-slate-400">Platform Administrator</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() || "S"}
          </div>
          <button
            onClick={() => setShowPwModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            data-testid="super-admin-change-password-button"
            title="Change password"
          >
            <KeyRound size={16} />
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            data-testid="super-admin-logout-button"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 lg:p-8">
        {children}
      </main>

      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
              <button onClick={() => setShowPwModal(false)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={changePassword} className="p-5 space-y-4">
              {[["Current Password", "current_password"], ["New Password", "new_password"], ["Confirm New Password", "confirm"]].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={(e) => setPwForm({ ...pwForm, [key]: e.target.value })}
                    className={inp}
                    data-testid={`super-admin-pw-${key}`}
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={saving}
                data-testid="super-admin-save-password-btn"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-all active:scale-95"
              >
                {saving ? "Saving..." : "Change Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
