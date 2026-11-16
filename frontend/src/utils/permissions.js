// Mirrors the backend's ROLE_PERMISSIONS in server.py. "admin" (Admin)
// always has full access; other roles only see what's listed here.
export const ROLE_NAV_PATHS = {
  // Sales, Sold Stock, Job Cards, and Customers were pulled from Front Desk -- they only get
  // Inventory (view/edit, no create) plus Team and Settings now.
  // Warranty tracker: they follow up on sold vehicles and void a warranty when the customer
  // serviced elsewhere (restoring one or changing its length stays admin-only).
  // Ledger: Staff tab only (see LEDGER_TABS below).
  // /sales/vehicle: the sold-vehicle page, so they can keep Transfer / Sanakhat status current
  // (the Sales list itself stays admin-only -- it carries prices and margins).
  stock_supervisor: ["/inventory", "/warranty", "/ledger", "/sales/vehicle", "/settings"],
  // Sanakhat desk: one page, /sanakhat, and nothing else (no sales, stock, settings or team).
  sanakhat_officer: ["/sanakhat"],
  // Parts department gets read-only inventory browsing plus the ability to flip a vehicle's
  // pipeline status (Available <-> In Repair, or Scrap) — see PARTS_ALLOWED_STATUSES in server.py.
  // Ledger: Vendors + Staff tabs (see LEDGER_TABS below).
  parts_supervisor: ["/spare-parts", "/ledger", "/jobs", "/inventory", "/settings"],
  // Social Media adds new stock (basic details only) and manages vehicle photos -- nothing else.
  social_media: ["/inventory", "/marketing", "/settings"],
  // Cross-company visibility only -- no company_id of its own, so it must never reach any
  // of the regular per-company pages (they'd have nothing scoped to show it anyway).
  platform_owner: ["/platform"],
};

export const ROLE_DEFAULT_PATH = {
  sanakhat_officer: "/sanakhat",
  stock_supervisor: "/inventory",
  parts_supervisor: "/spare-parts",
  social_media: "/inventory",
  platform_owner: "/platform",
};

// Which Ledger tabs each role sees -- mirrors the backend's "customers" / "vendors" / "team"
// resources in ROLE_PERMISSIONS. Admin gets all three.
const LEDGER_TABS = {
  stock_supervisor: ["staff"],
  parts_supervisor: ["vendors", "staff"],
};

// Which Marketing tabs each role sees -- Social Media only gets Share (the backend limits
// Offers and Visits to admin).
const MARKETING_TABS = {
  social_media: ["share"],
};

// Feature switches (the portal's stock.* catalogue). `features` is the map from GET /api/features, or null/undefined
// when it is not known yet or the portal cannot say: then nothing is hidden and the server's own 403 stays the boundary.
// A key missing from a loaded map reads as its catalogue default (same as the server).
export const FEATURE_DEFAULTS = {
  "stock.vehicles": false, "stock.sanakhat": false, "stock.job_cards": false, "stock.spare_parts": false,
  "stock.warranty": true, "stock.bookings": true, "stock.crm": true, "stock.ai_assistant": true,
  "stock.leads": false, "stock.public_site": false, "stock.share": false, "stock.visits": false, "stock.offers": false,
};
export const ALL_FEATURES_ON = Object.fromEntries(Object.keys(FEATURE_DEFAULTS).map((k) => [k, true]));

export function featureOn(features, key) {
  if (!key || !features) return true;
  return key in features ? features[key] !== false : FEATURE_DEFAULTS[key] !== false;
}

// Pages that belong to one feature. Longest match wins by listing order; query strings are not part of the path.
const PATH_FEATURES = [
  ["/jobs", "stock.job_cards"], ["/warranty", "stock.warranty"], ["/sanakhat", "stock.sanakhat"],
  ["/spare-parts", "stock.spare_parts"], ["/ai", "stock.ai_assistant"], ["/bookings", "stock.bookings"],
];
export function featureForPath(path) {
  const hit = PATH_FEATURES.find(([p]) => path === p || path.startsWith(p + "/"));
  return hit ? hit[1] : null;
}

const MARKETING_FEATURE = { leads: "stock.leads", crm: "stock.crm", share: "stock.share", offers: "stock.offers", visits: "stock.visits" };

export function marketingTabsFor(role, features) {
  const tabs = !role || role === "admin" ? ["leads", "crm", "share", "offers", "visits"] : MARKETING_TABS[role] || [];
  return tabs.filter((t) => featureOn(features, MARKETING_FEATURE[t]));
}

export function ledgerTabsFor(role) {
  if (!role || role === "admin") return ["customers", "vendors", "staff"];
  return LEDGER_TABS[role] || [];
}

function roleAllowsPath(role, path) {
  // /platform is cross-company (platform_owner only) -- never covered by admin's normal
  // "full access to every company page" blanket rule, or every company's own admin would
  // see it in nav and 403 on the backend when they clicked it.
  if (path === "/platform" || path.startsWith("/platform/")) return role === "platform_owner";
  if (!role || role === "admin") return true;
  const allowed = ROLE_NAV_PATHS[role] || [];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

// The one place that combines the role AND the organization's features. Without `features` it is the old role-only check.
export function canAccessPath(role, path, features) {
  if (!roleAllowsPath(role, path)) return false;
  if (path === "/marketing" || path.startsWith("/marketing/")) return marketingTabsFor(role, features).length > 0;
  return featureOn(features, featureForPath(path));
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

// Front Desk (stock_supervisor) is showroom-floor staff -- view only, no vehicle edits of any
// kind (not even status changes), so only admin gets full vehicle access.
export function hasFullVehicleAccess(role) {
  return !role || role === "admin";
}

// Mirrors ROLE_PERMISSIONS["social_media"] in server.py: can add a vehicle with basic
// details only (no purchase/pricing/status fields) and add/remove its photos.
export function isBasicStockRole(role) {
  return role === "social_media";
}

export function canAddVehicle(role) {
  return hasFullVehicleAccess(role) || isBasicStockRole(role);
}

export function canManageVehiclePhotos(role) {
  return hasFullVehicleAccess(role) || isBasicStockRole(role);
}

// Roles that never see any vehicle pricing (selling / minimum selling price included).
export function hidesVehiclePricing(role) {
  return role === "parts_supervisor" || role === "social_media";
}

// Mirrors ROLE_PERMISSIONS["stock_supervisor"]["warranty"] in server.py: front desk can void a
// warranty (customer serviced elsewhere); restoring it or changing its length is admin-only.
export function canVoidWarranty(role) {
  return !role || role === "admin" || role === "stock_supervisor";
}

// Name-transfer / sanakhat status on a sold vehicle -- mirrors ROLE_PERMISSIONS["stock_supervisor"]["sale_statuses"].
export function canEditSaleStatuses(role) {
  return !role || role === "admin" || role === "stock_supervisor";
}

export function canManageWarranty(role) {
  return !role || role === "admin";
}
