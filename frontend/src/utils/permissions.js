// Mirrors the backend's ROLE_PERMISSIONS in server.py. "admin" (Admin)
// always has full access; other roles only see what's listed here.
export const ROLE_NAV_PATHS = {
  stock_supervisor: ["/inventory", "/sales", "/sold-stock", "/jobs", "/customers", "/team", "/settings"],
  // Parts department gets read-only inventory browsing plus the ability to flip a vehicle's
  // pipeline status (Available <-> In Repair, or Scrap) — see PARTS_ALLOWED_STATUSES in server.py.
  parts_supervisor: ["/spare-parts", "/vendors", "/jobs", "/inventory", "/team", "/settings"],
  // Cross-company visibility only -- no company_id of its own, so it must never reach any
  // of the regular per-company pages (they'd have nothing scoped to show it anyway).
  platform_owner: ["/platform"],
};

export const ROLE_DEFAULT_PATH = {
  stock_supervisor: "/inventory",
  parts_supervisor: "/spare-parts",
  platform_owner: "/platform",
};

export function canAccessPath(role, path) {
  // /platform is cross-company (platform_owner only) -- never covered by admin's normal
  // "full access to every company page" blanket rule, or every company's own admin would
  // see it in nav and 403 on the backend when they clicked it.
  if (path === "/platform" || path.startsWith("/platform/")) return role === "platform_owner";
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
