import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { canAccessPath, marketingTabsFor } from "../utils/permissions";
import { isSanakhatOverdue, sanakhatPendingDays } from "../utils/helpers";
import {
  LayoutDashboard, Bike, Wrench, BarChart3, Sparkles, Settings, LogOut, Menu, X, Bell,
  BookOpen, Wallet, Boxes, ShoppingBag, Building2, ImageOff, FileWarning, ShieldCheck, Megaphone, Inbox, ChevronDown, Share2, Gift, Eye, HeartHandshake
} from "lucide-react";

// A vehicle needs at least this many photos before it's considered adequately
// photographed — mirrors MIN_PHOTOS in Inventory.jsx, kept separate since a shared
// constant would mean importing a whole page module just for one number.
const MIN_NOTIFY_PHOTOS = 2;

const MARKETING_NAV = {
  leads: { label: "Leads", icon: Inbox },
  crm: { label: "CRM", icon: HeartHandshake },
  share: { label: "Share", icon: Share2 },
  offers: { label: "Offers", icon: Gift },
  visits: { label: "Visits", icon: Eye },
};

const navItems = [
  { path: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { path: "/platform",     label: "Companies",    icon: Building2 },
  { path: "/inventory",    label: "Inventory",    icon: Bike },
  { path: "/marketing",   label: "Marketing",    icon: Megaphone },
  { path: "/sales",        label: "Sales",        icon: ShoppingBag },
  { path: "/spare-parts",  label: "Spare Parts",  icon: Boxes },
  { path: "/ledger",       label: "Ledger",       icon: BookOpen },
  { path: "/jobs",         label: "Job Cards",    icon: Wrench },
  { path: "/warranty",     label: "Warranty",     icon: ShieldCheck },
  { path: "/finance",      label: "Finance",      icon: Wallet },
  { path: "/reports",      label: "Reports",      icon: BarChart3 },
  { path: "/ai",           label: "AI Assistant", icon: Sparkles },
  { path: "/settings",     label: "Settings",     icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname, search } = useLocation();
  const [marketingOpen, setMarketingOpen] = useState(null); // null = follow the current page

  const handleLogout = () => { logout(); navigate("/login"); };
  const visibleNavItems = navItems.filter(({ path }) => canAccessPath(user?.role, path));

  // Missing-data notifications: flags active-stock vehicles missing a photo or a
  // registration number so gaps get caught without staff having to go hunting for
  // them in Inventory. Only fetched for roles that can actually open Inventory.
  const canSeeInventory = canAccessPath(user?.role, "/inventory");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifVehicles, setNotifVehicles] = useState([]);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!user || !canSeeInventory) return;
    const load = () => { api.get("/vehicles").then(r => setNotifVehicles(r.data)).catch(() => {}); };
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min — this isn't chat, no need to poll faster
    return () => clearInterval(id);
  }, [user, canSeeInventory]);

  // New website leads (form submissions and WhatsApp/Call taps): admin-only on the backend.
  // Polled every minute; the Leads screen pings "leads-changed" so the badge clears at once.
  const [newLeads, setNewLeads] = useState(0);
  const lastNewLeads = useRef(null);
  const isAdmin = !user?.role || user.role === "admin";
  useEffect(() => {
    if (!user || !isAdmin) return;
    const load = () => {
      api.get("/leads").then(r => {
        const n = r.data.filter(l => l.status === "new").length;
        if (lastNewLeads.current !== null && n > lastNewLeads.current) {
          toast.info(`${n - lastNewLeads.current} new website lead${n - lastNewLeads.current > 1 ? "s" : ""}`, { action: { label: "View", onClick: () => navigate("/marketing?tab=leads") } });
        }
        lastNewLeads.current = n;
        setNewLeads(n);
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, 60 * 1000);
    window.addEventListener("leads-changed", load);
    return () => { clearInterval(id); window.removeEventListener("leads-changed", load); };
  }, [user, isAdmin, navigate]);

  const missingDataVehicles = useMemo(() => {
    return notifVehicles
      .filter(v => v.status !== "sold" && v.status !== "scrap")
      .map(v => {
        const issues = [];
        if (!v.registration_number?.trim()) issues.push("No reg. number");
        if (!v.has_photo) issues.push("No photos");
        else if ((v.photo_count ?? 0) < MIN_NOTIFY_PHOTOS) issues.push("Needs more photos");
        return { ...v, issues };
      })
      .filter(v => v.issues.length > 0);
  }, [notifVehicles]);

  useEffect(() => {
    if (!notifOpen) return;
    const onClickOutside = (e) => { if (!notifRef.current?.contains(e.target)) setNotifOpen(false); };
    const onEscape = (e) => { if (e.key === "Escape") setNotifOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [notifOpen]);

  const openVehicleFromNotif = (id) => {
    setNotifOpen(false);
    navigate(`/inventory/${id}`);
  };

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
    <aside className={`${mobile ? "fixed inset-0 z-50 flex" : "hidden lg:flex"} flex-col bg-slate-900 text-white ${mobile ? "w-64" : "w-64"} h-app`}>
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
        {visibleNavItems.map(({ path, label, icon: Icon }) => {
          const subTabs = path === "/marketing" ? marketingTabsFor(user?.role) : [];
          const leadsBadge = (
            <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center" data-testid="nav-leads-badge">{newLeads > 99 ? "99+" : newLeads}</span>
          );
          if (subTabs.length < 2) {
            return (
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
                {path === "/marketing" && newLeads > 0 && leadsBadge}
              </NavLink>
            );
          }
          // Marketing with several tabs: a dropdown, open by default while on a Marketing page.
          const onMarketing = pathname.startsWith("/marketing");
          const requested = new URLSearchParams(search).get("tab");
          const current = subTabs.includes(requested) ? requested : subTabs[0];
          const open = marketingOpen ?? onMarketing;
          return (
            <div key={path} data-testid="nav-marketing-group">
              <button
                onClick={() => { setMarketingOpen(!open); if (!onMarketing) navigate(`/marketing?tab=${subTabs[0]}`); }}
                aria-expanded={open}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${onMarketing ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
                data-testid="nav-marketing"
              >
                <Icon size={17} />
                {label}
                {newLeads > 0 && !open && leadsBadge}
                <ChevronDown size={15} className={`${newLeads > 0 && !open ? "" : "ml-auto"} transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="mt-0.5 ml-5 pl-3 border-l border-slate-700 space-y-0.5">
                  {subTabs.map(key => {
                    const { label: subLabel, icon: SubIcon } = MARKETING_NAV[key];
                    return (
                      <NavLink
                        key={key}
                        to={`/marketing?tab=${key}`}
                        replace={onMarketing}
                        onClick={() => mobile && setSidebarOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${onMarketing && current === key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
                        data-testid={`nav-marketing-${key}`}
                      >
                        <SubIcon size={15} />
                        {subLabel}
                        {key === "leads" && newLeads > 0 && leadsBadge}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
    <div className="flex h-app overflow-hidden bg-slate-50 pl-safe pr-safe">
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
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm h-14 box-content pt-safe flex items-center px-4 lg:px-6 gap-4">
          <button
            className="lg:hidden w-11 h-11 -ml-2.5 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-button"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          {canSeeInventory && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(o => !o)}
                className="relative w-11 h-11 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
                data-testid="notif-bell-btn"
                title="Vehicles needing attention"
              >
                <Bell size={17} />
                {missingDataVehicles.length + newLeads > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none" data-testid="notif-bell-badge">
                    {missingDataVehicles.length + newLeads > 99 ? "99+" : missingDataVehicles.length + newLeads}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden z-50"
                  data-testid="notif-panel"
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">Needs Attention</span>
                    {missingDataVehicles.length > 0 && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{missingDataVehicles.length}</span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                    {newLeads > 0 && (
                      <button onClick={() => { setNotifOpen(false); navigate("/marketing?tab=leads"); }} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 bg-blue-50/50 flex items-center gap-2 text-sm font-medium text-blue-700">
                        <Inbox size={14} /> {newLeads} new website lead{newLeads > 1 ? "s" : ""}
                      </button>
                    )}
                    {missingDataVehicles.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">Nothing needs attention ✅</div>
                    ) : (
                      missingDataVehicles.map(v => (
                        <button
                          key={v.id}
                          onClick={() => openVehicleFromNotif(v.id)}
                          data-testid="notif-vehicle-row"
                          className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="text-sm font-medium text-slate-800 truncate">{v.brand} {v.model}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {v.issues.includes("No reg. number") && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                <FileWarning size={10} /> No reg. number
                              </span>
                            )}
                            {v.issues.includes("Sanaakhat overdue") && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
                                <FileWarning size={10} /> Sanaakhat pending {sanakhatPendingDays(v)}d
                              </span>
                            )}
                            {(v.issues.includes("No photos") || v.issues.includes("Needs more photos")) && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
                                <ImageOff size={10} /> {v.issues.includes("No photos") ? "No photos" : "Needs more photos"}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-700">{user?.name}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {/* Boundary here (not only at the app root) so a lazy page loading keeps the
              sidebar/header on screen instead of swapping the whole layout for a spinner. */}
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
            <Outlet context={{ newLeads }} />
          </Suspense>
          <div className="pb-safe" aria-hidden="true" />
        </main>
      </div>
    </div>
  );
}
