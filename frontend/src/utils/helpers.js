export const formatNPR = (amount) => {
  if (amount === null || amount === undefined) return "N/A";
  return `Rs. ${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;
};

export const getAgingStyle = (category) => {
  const map = {
    fresh:  { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-200", label: "Fresh Stock" },
    normal: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200", label: "Normal" },
    slow:   { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200", label: "Slow Moving" },
    dead:   { bg: "bg-red-100",    text: "text-red-800",    border: "border-red-200",   label: "Dead Stock" },
  };
  return map[category] || map.fresh;
};

export const getStatusStyle = (status) => {
  const map = {
    unlisted:  { bg: "bg-slate-200",  text: "text-slate-700",  label: "Unlisted",  cardBg: "bg-slate-50",  cardBorder: "border-slate-300",  accent: "border-l-slate-400" },
    scrap:     { bg: "bg-red-100",    text: "text-red-800",    label: "Scrap",     cardBg: "bg-red-50",    cardBorder: "border-red-200",    accent: "border-l-red-500" },
    in_repair: { bg: "bg-purple-100", text: "text-purple-800", label: "In Repair", cardBg: "bg-purple-50", cardBorder: "border-purple-200", accent: "border-l-purple-500" },
    available: { bg: "bg-blue-100",   text: "text-blue-800",   label: "Available", cardBg: "bg-blue-50",   cardBorder: "border-blue-200",   accent: "border-l-blue-500" },
    sold:      { bg: "bg-green-100",  text: "text-green-800",  label: "Sold",      cardBg: "bg-green-50",  cardBorder: "border-green-200",  accent: "border-l-green-500" },
    reserved:  { bg: "bg-yellow-100", text: "text-yellow-800", label: "Reserved",  cardBg: "bg-yellow-50", cardBorder: "border-yellow-200", accent: "border-l-yellow-500" },
  };
  if (status === "hidden") return map.unlisted; // legacy alias, pre-rename data
  return map[status] || map.available;
};

// "scrap" is listed last on purpose: it's a do-not-disturb/terminal stage that should sink
// to the bottom of any list built from this order, rather than interleave with active stages.
export const VEHICLE_STATUS_OPTIONS = [
  { value: "unlisted", label: "Unlisted" },
  { value: "in_repair", label: "In Repair" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "scrap", label: "Scrap" },
];

const ordinal = (n) => `${n}${["st", "nd", "rd"][n - 1] || "th"}`;

// ownership_number encodes a transcript (bluebook lost/damaged, duplicate copy issued) as
// TRANSCRIPT_BASE + issue count, e.g. 91 = 1st transcript, 92 = 2nd transcript. Kept well
// above the real 1-5 owner range, and non-zero so it stays truthy — several call sites use
// `ownership_number || 1` as a missing-value fallback, which 0 would silently collide with.
export const TRANSCRIPT_BASE = 90;

export const formatOwnership = (n) => {
  if (n > TRANSCRIPT_BASE) return `${ordinal(n - TRANSCRIPT_BASE)} Transcript`;
  return `${ordinal(n)} Owner`;
};

export const OWNERSHIP_OPTIONS = [
  ...[1, 2, 3, 4, 5].map(n => ({ value: n, label: formatOwnership(n) })),
  ...[1, 2, 3, 4, 5].map(n => ({ value: TRANSCRIPT_BASE + n, label: formatOwnership(TRANSCRIPT_BASE + n) })),
];

export const getJobStyle = (status) => {
  const map = {
    pending:     { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending" },
    in_progress: { bg: "bg-blue-100",   text: "text-blue-800",   label: "In Progress" },
    completed:   { bg: "bg-green-100",  text: "text-green-800",  label: "Completed" },
  };
  return map[status] || map.pending;
};

export const getDocStyle = (status) => {
  const map = {
    ok:      { bg: "bg-green-100", text: "text-green-800", label: "OK" },
    pending: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending" },
    missing: { bg: "bg-red-100",   text: "text-red-800",   label: "Missing" },
  };
  return map[status] || map.pending;
};

export const BRANDS = ["Honda", "Yamaha", "TVS", "Bajaj", "Suzuki", "Hero", "KTM", "Royal Enfield", "Lifan", "Other"];
export const SOURCES = ["Direct Owner", "Auction", "Exchange", "Dealer", "Other"];
export const CONDITIONS = ["Excellent", "Good", "Fair", "Poor"];
export const FUEL_TYPES = ["Petrol", "Electric", "Hybrid"];
export const ENGINE_CCS = [50, 100, 110, 125, 150, 160, 200, 250, 300, 400, 500];
export const DOC_STATUSES = ["ok", "pending", "missing"];
export const VEHICLE_STATUSES = ["available", "reserved", "sold", "in_repair", "exchange", "finance_pending"];
export const EXPENSE_CATEGORIES = [
  { value: "denting_paint", label: "Denting/Paint" },
  { value: "servicing", label: "Servicing" },
  { value: "parts", label: "Parts Replacement" },
  { value: "labor", label: "Labor Cost" },
  { value: "transport", label: "Transport" },
  { value: "commissions", label: "Commissions" },
  { value: "other", label: "Other" },
];

export const USER_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "partner", label: "Partner" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "sales_staff", label: "Sales Staff" },
  { value: "mechanic", label: "Mechanic" },
  { value: "accountant", label: "Accountant" },
  { value: "branch_manager", label: "Branch Manager" },
];

// Bikram Sambat (BS) approximate conversion
export const adToBS = (adDateStr) => {
  if (!adDateStr) return "—";
  try {
    const d = new Date(adDateStr);
    if (isNaN(d.getTime())) return "—";
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    // Nepal New Year is ~April 13-14; after that, BS year = AD year + 57, before = +56
    const bsYear = (mo > 3 || (mo === 3 && day >= 14)) ? yr + 57 : yr + 56;
    const nepMonths = ["Baisakh","Jestha","Ashadh","Shrawan","Bhadra","Ashwin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];
    // BS month ≈ AD month shifted by ~8.5 months (very approximate)
    const bsMonthIdx = (mo + 9) % 12;
    return `${bsYear} ${nepMonths[bsMonthIdx]} BS`;
  } catch { return "—"; }
};

// Builds a wa.me deep link. Nepali phone numbers are stored locally (e.g. "98XXXXXXXX");
// wa.me requires the country code with no leading zero or "+".
export const getWhatsAppLink = (phone, message) => {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0+/, "");
  const withCountryCode = digits.startsWith("977") ? digits : `977${digits}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
};

export const formatDateDual = (adDateStr) => {
  if (!adDateStr) return "—";
  try {
    const d = new Date(adDateStr);
    if (isNaN(d.getTime())) return adDateStr.slice(0, 10);
    const adStr = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    const yr = d.getFullYear();
    const bsYear = (d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 14)) ? yr + 57 : yr + 56;
    return `${adStr} · ${bsYear} BS`;
  } catch { return adDateStr?.slice(0, 10) || "—"; }
};
