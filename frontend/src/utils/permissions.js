// Mirrors the backend's ROLE_PERMISSIONS in server.py. "admin" (Admin)
// always has full access; other roles only see what's listed here.
export const ROLE_NAV_PATHS = {
  stock_supervisor: ["/inventory", "/sales", "/sold-stock", "/jobs", "/customers", "/team", "/settings"],
  // Parts department gets read-only inventory browsing plus the ability to flip a vehicle's
  // pipeline status (Available <-> In Repair, or Scrap) — see PARTS_ALLOWED_STATUSES in server.py.
  parts_supervisor: ["/spare-parts", "/vendors", "/jobs", "/inventory", "/team", "/settings"],
  // Platform super_admin only ever sees the companies console — never a company's own data tabs.
  super_admin: ["/super-admin"],
};

export const ROLE_DEFAULT_PATH = {
  stock_supervisor: "/inventory",
  parts_supervisor: "/spare-parts",
  super_admin: "/super-admin",
};

export function canAccessPath(role, path) {
  // "admin" (a company's own admin) gets full access to that company's data. super_admin
  // is NOT included here — it must fall through to ROLE_NAV_PATHS like any other limited role.
  if (!role || role === "admin") return true;
  const allowed = ROLE_NAV_PATHS[role] || [];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

// Job Cards tab is shared: Front desk stock can only view, Parts department has full create/edit/delete access.
export function canEditJobs(role) {
  return !role || role === "admin" || role === "parts_supervisor";
}

export function canDeleteJobs(role) {
  return !role || role === "admin" || role === "parts_supervisor";
}

// Parts department has partial inventory access: browse + change pipeline status only.
// Mirrors PARTS_ALLOWED_STATUSES in server.py — keep in sync.
export const PARTS_ALLOWED_VEHICLE_STATUSES = ["available", "in_repair", "scrap"];

export function hasFullVehicleAccess(role) {
  return !role || role === "admin" || role === "stock_supervisor";
}
