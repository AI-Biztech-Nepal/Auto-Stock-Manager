import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { canAccessPath } from "../utils/permissions";
import {
  LayoutDashboard, Bike, Wrench, Users, UsersRound,
  BarChart3, Handshake, Sparkles, Settings, LogOut, Menu, X, Bell,
  Store, Wallet, Megaphone, CreditCard, Boxes, ShoppingBag, Inbox, Archive, Building2
} from "lucide-react";

const navItems = [
  { path: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { path: "/platform",     label: "Companies",    icon: Building2 },
  { path: "/inventory",    label: "Inventory",    icon: Bike },
  { path: "/sales",        label: "Sales",        icon: ShoppingBag },
  { path: "/sold-stock",   label: "Sold Stock",   icon: Archive },
  { path: "/leads",        label: "Leads",        icon: Inbox },
  { path: "/spare-parts",  label: "Spare Parts",  icon: Boxes },
  { path: "/vendors",      label: "Vendors",      icon: Store },
  { path: "/jobs",         label: "Job Cards",    icon: Wrench },
  { path: "/customers",    label: "Customers",    icon: Users },
  { path: "/team",         label: "Team",         icon: UsersRound },
  { path: "/finance",      label: "Finance",      icon: Wallet },
  { path: "/emi",          label: "EMI",          icon: CreditCard },
  { path: "/marketing",    label: "Marketing",    icon: Megaphone },
  { path: "/partners",     label: "Partners",     icon: Handshake },
  { path: "/reports",      label: "Reports",      icon: BarChart3 },
  { path: "/ai",           label: "AI Assistant", icon: Sparkles },
  { path: "/settings",     label: "Settings",     icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };
  const visibleNavItems = navItems.filter(({ path }) => canAccessPath(user?.role, path));

  // Live presence: while the app is open, tell the backend this device is online every 30s
  // (and immediately on mount / when the tab is refocused). The heartbeat carries a
  // per-browser device id (see api.js); the dashboard's "devices online" counter reads the
  // other side of this — see OnlineUsers in Dashboard.jsx. Fire-and-forget: a failed ping
  // just means this device drops out of the count until the next one lands.
  useEffect(() => {
    if (!user) return;
    const ping = () => { api.post("/presence/heartbeat").catch(() => {}); };
    ping();
    const id = setInterval(ping, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [user]);

  const Sidebar = ({ mobile = false }) => (
    <aside className={`${mobile ? "fixed inset-0 z-50 flex" : "hidden lg:flex"} flex-col bg-slate-900 text-white ${mobile ? "w-64" : "w-64"} h-screen`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">AS</div>
        <div>
          {/* user.company_name comes back from login/signup (see AuthContext) -- this is
              the signed-in tenant's own business, not the platform's own identity, which
              only appears pre-login (see Login/SignUp's matching logo block). */}
          <div className="font-bold text-sm leading-tight" style={{ fontFamily: "Manrope, sans-serif" }}>{user?.company_name || "Auto Stock Manager"}</div>
          <div className="text-xs text-slate-400">Inventory Manager</div>
        </div>
        {mobile && (
          <button className="ml-auto w-11 h-11 -mr-2.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 sidebar-nav overflow-y-auto">
        {visibleNavItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            onClick={() => mobile && setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`
            }
            data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors" data-testid="logout-button">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm h-14 flex items-center px-4 lg:px-6 gap-4">
          <button
            className="lg:hidden w-11 h-11 -ml-2.5 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-button"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <button className="w-11 h-11 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
            <Bell size={17} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-700">{user?.name}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
