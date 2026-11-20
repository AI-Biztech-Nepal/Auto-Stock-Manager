import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Filter, Check } from "lucide-react";
import { addDays, todayStr } from "./money";
import { inputCls, btnPrimary } from "./ui";
import { adToBsDate, bsToAdDate, getBSMonthRange, getBSMonthMaxDays, BS_MONTHS, formatBSDate } from "../../utils/nepali-date";

// The Finance pages' period control, as ‹ [▾ This Year] ›: the middle button picks the kind of period (a day, a month, a year, all
// time or a range of your own) and the arrows step back and forward by that much (the next one stops at today). Months and years
// are Nepali (BS) ones. Each page keeps its own period and its own default.
//
// A period is { unit, from, to } with from / to as AD dates ("" for all time). unit: "day" | "month" | "year" | "all" | "custom".

const yearPeriod = (y) => {
  const from = bsToAdDate(y, 1, 1), to = bsToAdDate(y, 12, getBSMonthMaxDays(y, 12));
  return from && to ? { unit: "year", from, to } : null;
};
const monthPeriod = (y, m) => {
  const r = getBSMonthRange(y, m);
  return r ? { unit: "month", from: r.start, to: r.end } : null;
};

// The period of this kind that holds `day` (today by default): periodAt("month") is this month.
export function periodAt(unit, day = todayStr()) {
  if (unit === "all") return { unit, from: "", to: "" };
  if (unit === "day") return { unit, from: day, to: day };
  const bs = adToBsDate(day);
  if (!bs) return { unit: "day", from: day, to: day };
  return (unit === "month" ? monthPeriod(bs.year, bs.month) : yearPeriod(bs.year)) || { unit: "day", from: day, to: day };
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// The period one step back (dir = -1) or forward (+1), or null when there is nowhere to go.
export function stepPeriod(p, dir) {
  if (p.unit === "all") return null;
  if (p.unit === "day") return { unit: "day", from: addDays(p.from, dir), to: addDays(p.from, dir) };
  if (p.unit === "custom") {
    const span = daysBetween(p.from, p.to) + 1;
    return { unit: "custom", from: addDays(p.from, dir * span), to: addDays(p.to, dir * span) };
  }
  const bs = adToBsDate(p.from);
  if (!bs) return null;
  if (p.unit === "year") return yearPeriod(bs.year + dir);
  const idx = bs.year * 12 + (bs.month - 1) + dir;
  return monthPeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

export const canStepForward = (p, today = todayStr()) => p.unit !== "all" && !!p.to && p.to < today;

// What the middle button says: "Today", "This Month", "This Year" for the current one, else which one it is.
export function periodLabel(p, today = todayStr()) {
  if (p.unit === "all") return "All time";
  const current = p.unit !== "custom" && p.from <= today && today <= p.to;
  if (p.unit === "day") return current ? "Today" : formatBSDate(p.from);
  const bs = adToBsDate(p.from);
  if (p.unit === "month") return current || !bs ? "This Month" : `${bs.year} ${BS_MONTHS[bs.month - 1]}`;
  if (p.unit === "year") return current || !bs ? "This Year" : `${bs.year}`;
  return p.from === p.to ? formatBSDate(p.from) : `${formatBSDate(p.from)} – ${formatBSDate(p.to)}`;
}

// A short tag for file names: "all", "2026-11-17", "2026-11-17-to-2026-12-15".
export const periodSlug = (p) => (!p.from && !p.to ? "all" : p.from === p.to ? p.from : `${p.from}-to-${p.to}`);

const OPTIONS = { day: "Today", month: "This Month", year: "This Year", all: "All time", custom: "Custom range" };
const iconBtn = "h-9 w-9 shrink-0 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white flex items-center justify-center text-gray-600";

// value: the period. onChange: called with the new one. units: which kinds the middle button offers (and their order).
export default function PeriodStepper({ value, onChange, units = ["day", "month", "year", "all", "custom"] }) {
  const today = todayStr();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [f, setF] = useState(value.from || today);
  const [t, setT] = useState(value.to || today);
  const box = useRef(null);
  useEffect(() => { if (value.from) setF(value.from); if (value.to) setT(value.to); }, [value.from, value.to]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setCustom(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const prev = stepPeriod(value, -1);
  const next = canStepForward(value, today) ? stepPeriod(value, 1) : null;
  const pick = (unit) => {
    if (unit === "custom") return setCustom(true);
    onChange(periodAt(unit));
    setOpen(false);
  };
  const apply = () => {
    onChange({ unit: "custom", from: f <= t ? f : t, to: t >= f ? t : f });
    setOpen(false); setCustom(false);
  };

  return (
    <div className="fin-no-print relative flex items-center gap-1.5" ref={box} data-testid="period-stepper">
      <button type="button" onClick={() => prev && onChange(prev)} disabled={!prev} className={iconBtn} aria-label="Earlier" data-testid="period-prev"><ChevronLeft size={18} /></button>
      <button type="button" onClick={() => { setOpen(!open); setCustom(false); }} aria-expanded={open} data-testid="period-button"
        className="h-9 min-w-[10rem] px-3.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-2 text-[13px] font-semibold text-gray-900">
        <Filter size={15} className="text-gray-500" />
        <span className="flex-1 text-left whitespace-nowrap" data-testid="period-label">{periodLabel(value, today)}</span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>
      <button type="button" onClick={() => next && onChange(next)} disabled={!next} className={iconBtn} aria-label="Later" data-testid="period-next"><ChevronRight size={18} /></button>
      {open && (
        <div className="absolute left-0 top-11 z-40 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg" data-testid="period-menu">
          {units.map((u) => (
            <button key={u} type="button" onClick={() => pick(u)} data-testid={`period-option-${u}`}
              className={`w-full flex items-center rounded-lg px-3 py-2.5 text-left text-sm ${value.unit === u ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-800 font-medium hover:bg-gray-50"}`}>
              <span className="flex-1">{OPTIONS[u]}</span>{value.unit === u && <Check size={15} />}
            </button>
          ))}
          {custom && (
            <div className="mt-1 border-t border-gray-100 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-gray-600">From<input type="date" value={f} max={t} onChange={(e) => e.target.value && setF(e.target.value)} className={`${inputCls} mt-1 !px-2`} data-testid="period-from" /></label>
                <label className="text-xs font-semibold text-gray-600">To<input type="date" value={t} min={f} max={today} onChange={(e) => e.target.value && setT(e.target.value)} className={`${inputCls} mt-1 !px-2`} data-testid="period-to" /></label>
              </div>
              <div className="text-[11px] text-gray-400">{formatBSDate(f)} to {formatBSDate(t)} BS</div>
              <button type="button" onClick={apply} className={`${btnPrimary} w-full`} data-testid="period-apply">Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
