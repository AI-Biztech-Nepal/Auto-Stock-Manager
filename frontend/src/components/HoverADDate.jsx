import { formatBSDate } from "../utils/nepali-date";

/**
 * Shows a date in BS by default; hovering crossfades to the AD equivalent
 * for as long as the cursor stays, then fades back to BS on mouse-leave.
 * The BS label stays in normal inline flow (so it lines up on the same text
 * baseline as whatever precedes it, e.g. "Sold:"); the AD label is absolutely
 * positioned on top of it so the swap never reflows the layout.
 */
export default function HoverADDate({ date, className = "" }) {
  if (!date) return <span className={className}>—</span>;
  return (
    <span className={`group relative cursor-default ${className}`} data-testid="hover-ad-date">
      <span className="transition-all duration-300 ease-out group-hover:opacity-0 group-hover:-translate-y-1">
        {formatBSDate(date)}
      </span>
      <span className="absolute left-0 top-0 opacity-0 translate-y-1 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-y-0 text-blue-600 font-medium whitespace-nowrap">
        {date}
      </span>
    </span>
  );
}
