// Shared "Today / This Week / This Month" segmented toggle — scopes a page's data to
// a date range. Today = the literal day; This Week = calendar week (Sun–Sat); This
// Month = the current BS month. See utils/nepali-date's getCurrentWeekRange /
// getCurrentBSMonthRange for the exact ranges each one resolves to.
export const PERIOD_OPTIONS = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
];

// `allowOff`: when true, clicking the already-active tab clears back to "all" (no
// filter) instead of staying pinned on it — used by pages where the toggle is one
// filter among several (e.g. Inventory) rather than the page's only lens (Dashboard).
export default function PeriodToggle({ period, onChange, testid = "period-toggle", allowOff = false }) {
  const handleClick = (key) => {
    onChange(allowOff && period === key ? "all" : key);
  };
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0" data-testid={testid}>
      {PERIOD_OPTIONS.map(p => (
        <button
          key={p.key}
          type="button"
          data-testid={`${testid}-${p.key}`}
          onClick={() => handleClick(p.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
            period === p.key ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
