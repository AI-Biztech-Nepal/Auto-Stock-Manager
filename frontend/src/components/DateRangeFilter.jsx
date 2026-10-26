import { useState } from "react";
import { CalendarDays, X, Check } from "lucide-react";
import BSDatePicker from "./BSDatePicker";
import {
  adToBsDate, bsToAdDate, getBSMonthRange, getBSMonthMaxDays, getCurrentBSDate,
  getTodayAD, getCurrentWeekRange, BS_MONTHS,
} from "../utils/nepali-date";

// Date-range filter: a button showing the active range that opens a "Select Date"
// sheet (Today / Yesterday / This Week / This Month / Last Month /
// This Year / All Time / Custom Date). All ranges are resolved to AD YYYY-MM-DD
// start/end strings, since that's what the API filters on.

const shortMonth = (m) => BS_MONTHS[m - 1].slice(0, 3);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtBS = (adStr) => {
  const b = adToBsDate(adStr);
  return b ? `${b.year} ${shortMonth(b.month)} ${pad2(b.day)}` : adStr;
};
const fmtRange = (s, e) => (s === e ? fmtBS(s) : `${fmtBS(s)} - ${fmtBS(e)}`);

const addDays = (adStr, n) => {
  const d = new Date(`${adStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const yearEnd = (y, m) => bsToAdDate(y, m, getBSMonthMaxDays(y, m));

export const DATE_FILTER_OPTIONS = [
  { key: "daily", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time", sub: "See Transactions of all time" },
  { key: "custom", label: "Custom Date", sub: "Select date from calendar" },
];

// → { key, label, start, end, sub } | null. `custom` is { start, end } for key "custom".
export function resolveDateFilter(key, custom) {
  const today = getTodayAD();
  const bs = getCurrentBSDate();
  const label = DATE_FILTER_OPTIONS.find(o => o.key === key)?.label || "Today";
  let start, end;
  switch (key) {
    case "daily": start = end = today; break;
    case "yesterday": start = end = addDays(today, -1); break;
    case "weekly": ({ start, end } = getCurrentWeekRange()); break;
    case "monthly": {
      const r = bs && getBSMonthRange(bs.year, bs.month);
      if (!r) return null;
      ({ start, end } = r); break;
    }
    case "lastMonth": {
      if (!bs) return null;
      const y = bs.month === 1 ? bs.year - 1 : bs.year;
      const m = bs.month === 1 ? 12 : bs.month - 1;
      const r = getBSMonthRange(y, m);
      if (!r) return null;
      ({ start, end } = r); break;
    }
    case "year": {
      if (!bs) return null;
      start = bsToAdDate(bs.year, 1, 1); end = yearEnd(bs.year, 12); break;
    }
    case "all": start = "1900-01-01"; end = "2999-12-31"; break;
    case "custom":
      if (!custom?.start || !custom?.end) return null;
      start = custom.start; end = custom.end; break;
    default: return null;
  }
  if (!start || !end) return null;
  const sub = key === "all" ? "All time" : fmtRange(start, end);
  return { key, label, start, end, sub };
}

export default function DateRangeFilter({ value, custom, onChange, testid = "date-range-filter" }) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(custom?.start || "");
  const [to, setTo] = useState(custom?.end || "");

  const active = resolveDateFilter(value, custom) || resolveDateFilter("daily");

  const close = () => { setOpen(false); setCustomOpen(false); };
  const pick = (key) => {
    if (key === "custom") { setCustomOpen(true); return; }
    onChange(key, null);
    close();
  };
  const applyCustom = () => {
    if (!from || !to) return;
    const [s, e] = from <= to ? [from, to] : [to, from];
    onChange("custom", { start: s, end: e });
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testid}
        className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors max-w-full"
      >
        <CalendarDays size={14} className="text-blue-600 shrink-0" />
        <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{active.label}</span>
        <span className="text-xs text-slate-500 truncate hidden sm:inline">{active.sub}</span>
        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Change</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
          onClick={close}
          data-testid={`${testid}-backdrop`}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid={`${testid}-modal`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Select Date</h2>
              <button type="button" onClick={close} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto py-1">
              {DATE_FILTER_OPTIONS.map(o => {
                const r = resolveDateFilter(o.key, custom);
                const selected = value === o.key;
                const sub = o.sub || (r ? fmtRange(r.start, r.end) : "");
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => pick(o.key)}
                    data-testid={`${testid}-${o.key}`}
                    className="w-full flex items-center justify-between gap-3 px-6 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{sub}</span>
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? "border-emerald-500" : "border-slate-300"}`}>
                      {selected && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {customOpen && (
              <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">From</p>
                    <BSDatePicker value={from} onChange={setFrom} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">To</p>
                    <BSDatePicker value={to} onChange={setTo} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!from || !to}
                  className="w-full h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={16} /> Apply
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
