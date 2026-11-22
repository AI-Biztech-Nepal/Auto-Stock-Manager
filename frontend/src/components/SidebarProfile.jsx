import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut } from "lucide-react";

/**
 * SidebarProfile.jsx — the signed-in account at the foot of the side panel: its initials, name and role. Tapping it opens a small
 * card above it with the username and Sign out. (It used to sit in the top bar.)
 *
 * user: the signed-in user ({ name, username, role }). onLogout: signs out. onPick: called after a tap that should also close
 * the panel (the phone's slide-over).
 */
const initialsOf = (name) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "A") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
};

export default function SidebarProfile({ user, onLogout, onPick }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const role = String(user?.role || "admin").replace(/_/g, " ");
  return (
    <div className="relative shrink-0 border-t border-slate-700 p-3" ref={box} data-testid="sidebar-profile">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden z-50 text-slate-900" data-testid="profile-menu">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.username}</div>
            <div className="mt-1 inline-block text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 capitalize">{role}</div>
          </div>
          <button type="button" onClick={() => { setOpen(false); onPick?.(); onLogout(); }} className="w-full flex items-center gap-2.5 px-4 h-12 text-sm font-semibold text-red-600 hover:bg-red-50" data-testid="profile-logout">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} data-testid="profile-btn"
        className="touch-manipulation w-full flex items-center gap-3 min-h-12 px-2 py-2 rounded-lg text-left hover:bg-slate-800 transition-colors">
        <span className="size-10 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold" data-testid="profile-initials">{initialsOf(user?.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold uppercase tracking-wide text-white truncate" data-testid="profile-name">{user?.name}</span>
          <span className="block text-xs text-slate-400 truncate capitalize" data-testid="profile-role">{role}</span>
        </span>
        <ChevronUp size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}
