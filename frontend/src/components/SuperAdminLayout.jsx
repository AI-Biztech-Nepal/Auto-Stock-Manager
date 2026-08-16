import { ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

// Dedicated shell for the platform-owner super_admin role — deliberately not the
// company Layout, since super_admin isn't tied to any one tenant and shouldn't be
// branded as one (that shell hardcodes the company's own name/logo).
export default function SuperAdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

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
    </div>
  );
}
