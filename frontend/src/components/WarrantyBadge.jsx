// Pill for a sold vehicle's warranty (vehicle.warranty from the backend's _warranty_info):
// Active with days left (amber once 30 or fewer remain), Expired, or Void.
export const WARRANTY_EXPIRING_SOON_DAYS = 30;

export function warrantyLabel(w) {
  if (!w || w.status === "none") return null;
  if (w.status === "void") return "Warranty void";
  if (w.status === "expired") return "Warranty expired";
  return w.days_left === 0 ? "Warranty ends today" : `Warranty · ${w.days_left}d left`;
}

export default function WarrantyBadge({ warranty, className = "" }) {
  const label = warrantyLabel(warranty);
  if (!label) return null;
  const style = warranty.status === "void" ? "bg-red-100 text-red-700"
    : warranty.status === "expired" ? "bg-slate-200 text-slate-600"
    : warranty.days_left <= WARRANTY_EXPIRING_SOON_DAYS ? "bg-amber-100 text-amber-700"
    : "bg-teal-100 text-teal-700";
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${style} ${className}`} data-testid="warranty-badge">
      {label}
    </span>
  );
}
