// Pill for a sold vehicle's warranty (vehicle.warranty from the backend's _warranty_info):
// Awaiting 1st service, Active with days left (amber once 30 or fewer remain), Expired, or Void.
export const WARRANTY_EXPIRING_SOON_DAYS = 30;

export function warrantyLabel(w) {
  if (!w || w.status === "none") return null;
  if (w.status === "void") return "Warranty void";
  if (w.status === "expired") return "Warranty expired";
  if (w.status === "awaiting") return "Awaiting 1st service";
  return w.days_left === 0 ? "Warranty ends today" : `Warranty · ${w.days_left}d left`;
}

// "1st service", "2nd service", ... for a job card's service_no after the sale.
export function serviceLabel(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  return `${n}${suffix} service`;
}

export default function WarrantyBadge({ warranty, className = "" }) {
  const label = warrantyLabel(warranty);
  if (!label) return null;
  const style = warranty.status === "void" ? "bg-red-100 text-red-700"
    : warranty.status === "expired" ? "bg-slate-200 text-slate-600"
    : warranty.status === "awaiting" ? "bg-sky-100 text-sky-700"
    : warranty.days_left <= WARRANTY_EXPIRING_SOON_DAYS ? "bg-amber-100 text-amber-700"
    : "bg-teal-100 text-teal-700";
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${style} ${className}`} data-testid="warranty-badge">
      {label}
    </span>
  );
}
