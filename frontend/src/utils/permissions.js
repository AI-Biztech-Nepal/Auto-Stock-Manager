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
  stock_supervisor: ["/inventory", "/items", "/warranty", "/ledger", "/sales", "/marketing", "/sanakhat", "/finance", "/settings"],
  // Sanakhat desk: one page, /sanakhat, and nothing else (no sales, stock, settings or team).
  sanakhat_officer: ["/sanakhat"],
  // Parts department gets read-only inventory browsing plus the ability to flip a vehicle's
  // pipeline status (Available <-> In Repair, or Scrap) — see PARTS_ALLOWED_STATUSES in server.py.
  // Ledger: Vendors + Staff tabs (see LEDGER_TABS below).
  parts_supervisor: ["/spare-parts", "/ledger", "/jobs", "/inventory", "/settings"],
  // Social Media adds new stock (basic details only) and manages vehicle photos -- nothing else.
  social_media: ["/inventory", "/items", "/marketing", "/settings"],
  // Cross-company visibility only -- no company_id of its own, so it must never reach any
  // of the regular per-company pages (they'd have nothing scoped to show it anyway).
  platform_owner: ["/platform"],
};

// ── Settings > Staff & Access ─────────────────────────────────────────
// The app's sections, as the side menu runs, each a row of the access grid. `group` rows are drawn indented under it.
// The keys are the backend's (staff_access.py SECTIONS).
export const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "sales", label: "Sales" },
  { key: "inventory", label: "Inventory" },
  { key: "spare_parts", label: "Spare Parts" },
  { key: "leads", label: "Marketing · Leads", group: "Marketing" },
  { key: "crm", label: "Marketing · CRM", group: "Marketing" },
  { key: "share", label: "Marketing · Share", group: "Marketing" },
  { key: "offers", label: "Marketing · Offers", group: "Marketing" },
  { key: "visits", label: "Marketing · Visits", group: "Marketing" },
  { key: "ledger", label: "Ledger (Customers, Vendors, Staff)" },
  { key: "jobs", label: "Job Cards" },
  { key: "finance", label: "Finance" },
  { key: "reports", label: "Reports" },
  { key: "warranty", label: "Warranty" },
  { key: "sanakhat", label: "Sanakhat" },
  { key: "ai", label: "AI Assistant" },
];

const allAt = (level) => Object.fromEntries(SECTIONS.map((s) => [s.key, level]));
// What each work role can do before anything is changed for one person: what the grid starts with. Mirrors
// ROLE_PERMISSIONS in server.py -- keep in step. A section left out is "none".
export const ROLE_DEFAULT_ACCESS = {
  admin: allAt("edit"),
  stock_supervisor: {
    sales: "view", inventory: "edit", leads: "edit", crm: "edit", share: "edit", offers: "edit", visits: "edit",
    ledger: "edit", finance: "edit", warranty: "edit", sanakhat: "edit",
  },
  parts_supervisor: { inventory: "view", spare_parts: "edit", ledger: "edit", jobs: "edit" },
  social_media: { inventory: "edit", share: "edit" },
  sanakhat_officer: { sanakhat: "edit" },
};

// The signed-in person's own changes (section -> none / view / edit), from /features. Set by AuthContext before it
// renders; empty for an admin and for anyone whose access was never changed, who then follow their role exactly.
let overrides = {};
export function setAccessOverrides(next) { overrides = next || {}; }
const limited = (role) => !!role && role !== "admin" && role !== "platform_owner";
const overrideOf = (role, section) => (limited(role) ? overrides[section] : undefined);
export function accessLevel(role, section) {
  if (!role || role === "admin") return "edit";
  return overrideOf(role, section) || ROLE_DEFAULT_ACCESS[role]?.[section] || "none";
}

// Which sections open each page. A page not listed here is decided by the role alone.
const PATH_SECTIONS = [
  ["/inventory", ["inventory", "spare_parts"]], ["/items", ["inventory"]], ["/spare-parts", ["spare_parts"]],
  ["/sales", ["sales"]], ["/marketing", ["leads", "crm", "share", "offers", "visits"]], ["/ledger", ["ledger"]],
  ["/jobs", ["jobs"]], ["/finance", ["finance"]], ["/reports", ["reports"]], ["/warranty", ["warranty"]],
  ["/sanakhat", ["sanakhat"]], ["/ai", ["ai"]],
];
function sectionsForPath(path) {
  if (path === "/") return ["dashboard"];
  const hit = PATH_SECTIONS.find(([p]) => path === p || path.startsWith(p + "/"));
  return hit ? hit[1] : [];
}

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
  stock_supervisor: ["vendors", "staff"],
  parts_supervisor: ["vendors", "staff"],
};

// Which Marketing tabs each role sees -- Social Media only gets Share (the backend limits
// Offers and Visits to admin).
const MARKETING_TABS = {
  stock_supervisor: ["leads", "crm", "share", "offers", "visits"],
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
// An organization that does not keep vehicles (stock.vehicles off) works with generic Items instead. Unknown features
// (null) and every dealership keep the vehicle screens exactly as before.
export function itemsMode(features) {
  return !!features && !featureOn(features, "stock.vehicles");
}

// The words screens use for what is in stock. The server sends them with /features (see terms.py); these are the
// fallback before that arrives and for an old server.
export const VEHICLE_TERMS = { kind: "vehicle", item: "Vehicle", items: "Vehicles", inventory: "Inventory", sold: "Sold", sold_stock: "Sold Stock", add: "Add Vehicle", sell: "Sell Vehicle" };
export const GENERIC_TERMS = { kind: "item", item: "Item", items: "Items", inventory: "Inventory", sold: "Sold", sold_stock: "Sold Items", add: "Add Item", sell: "Sell Item" };

// In Repair and Scrap belong to Job Cards; a role belongs to its feature. Hidden when the feature is off, never deleted.
export const STATUS_FEATURE = { in_repair: "stock.job_cards", scrap: "stock.job_cards" };
export const ROLE_FEATURE = { parts_supervisor: "stock.spare_parts", sanakhat_officer: "stock.sanakhat" };

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
  const all = ["leads", "crm", "share", "offers", "visits"];
  const byRole = !role || role === "admin" ? all : MARKETING_TABS[role] || [];
  const tabs = all.filter((t) => (overrideOf(role, t) ? overrideOf(role, t) !== "none" : byRole.includes(t)));
  return tabs.filter((t) => featureOn(features, MARKETING_FEATURE[t]));
}

export function ledgerTabsFor(role) {
  if (!role || role === "admin") return ["customers", "vendors", "staff"];
  const own = overrideOf(role, "ledger");
  if (own) return own === "none" ? [] : ["customers", "vendors", "staff"];
  return LEDGER_TABS[role] || [];
}

function roleAllowsPath(role, path) {
  // /platform is cross-company (platform_owner only) -- never covered by admin's normal
  // "full access to every company page" blanket rule, or every company's own admin would
  // see it in nav and 403 on the backend when they clicked it.
  if (path === "/platform" || path.startsWith("/platform/")) return role === "platform_owner";
  if (!role || role === "admin") return true;
  // Everyone keeps their own Settings (password), whatever else was changed for them.
  if (path === "/settings" && Object.keys(overrides).length) return true;
  const sections = sectionsForPath(path);
  if (sections.some((s) => overrideOf(role, s))) return sections.some((s) => accessLevel(role, s) !== "none");
  const allowed = ROLE_NAV_PATHS[role] || [];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

// The one place that combines the role AND the organization's features. Without `features` it is the old role-only check.
export function canAccessPath(role, path, features) {
  if (!roleAllowsPath(role, path)) return false;
  if (path === "/marketing" || path.startsWith("/marketing/")) return marketingTabsFor(role, features).length > 0;
  return featureOn(features, featureForPath(path));
}

// Where to send someone who asks for a page they cannot open (or signs in).
export function defaultPathFor(role) {
  const tries = [ROLE_DEFAULT_PATH[role] || "/", "/", "/inventory", "/sales", "/sanakhat", "/jobs", "/marketing", "/ledger", "/finance", "/warranty", "/reports", "/ai"];
  return tries.find((p) => canAccessPath(role, p)) || "/settings";
}

// Job Cards tab is shared: Front desk stock can only view, Parts department has full create/edit/delete access.
export function canEditJobs(role) {
  if (overrideOf(role, "jobs")) return overrideOf(role, "jobs") === "edit";
  return !role || role === "admin" || role === "parts_supervisor";
}

export function canDeleteJobs(role) {
  if (overrideOf(role, "jobs")) return overrideOf(role, "jobs") === "edit";
  return !role || role === "admin" || role === "parts_supervisor";
}

// Parts department has partial inventory access: browse + change pipeline status only.
// Mirrors PARTS_ALLOWED_STATUSES in server.py — keep in sync.
export const PARTS_ALLOWED_VEHICLE_STATUSES = ["available", "in_repair", "scrap"];

// Front Desk (stock_supervisor) is showroom-floor staff -- view only, no vehicle edits of any
// kind (not even status changes), so only admin gets full vehicle access.
export function hasFullVehicleAccess(role) {
  const own = overrideOf(role, "inventory");
  if (own && own !== "edit") return false;
  if (own === "edit" && role !== "social_media") return true; // social media stays on the basic form (the server enforces it)
  return !role || role === "admin" || role === "stock_supervisor";
}

// Mirrors ROLE_PERMISSIONS["social_media"] in server.py: can add a vehicle with basic
// details only (no purchase/pricing/status fields) and add/remove its photos.
export function isBasicStockRole(role) {
  return role === "social_media" && accessLevel(role, "inventory") === "edit";
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
  if (overrideOf(role, "warranty")) return overrideOf(role, "warranty") === "edit";
  return !role || role === "admin" || role === "stock_supervisor";
}

// Name-transfer / sanakhat status on a sold vehicle -- mirrors ROLE_PERMISSIONS["stock_supervisor"]["sale_statuses"].
export function canEditSaleStatuses(role) {
  const own = [overrideOf(role, "sales"), overrideOf(role, "sanakhat")];
  if (own.includes("edit")) return true;
  if (own.every(Boolean)) return false;
  return !role || role === "admin" || role === "stock_supervisor";
}

export function canManageWarranty(role) {
  return !role || role === "admin";
}
