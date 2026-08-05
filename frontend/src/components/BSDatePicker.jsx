import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { adToBsDate, bsToAdDate, getBSMonthMaxDays, getCurrentBSDate, BS_MONTHS, formatBSDate } from "../utils/nepali-date";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const AD_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Wide enough for old vehicle purchase dates (well into the past) plus a couple of future years
function getBSYearList() {
  const cur = getCurrentBSDate()?.year || 2083;
  return Array.from({ length: 18 }, (_, i) => cur - 15 + i);
}

function getADYearList() {
  const cur = new Date().getFullYear();
  return Array.from({ length: 18 }, (_, i) => cur - 15 + i);
}

// The BS calendar's weekday alignment is derived from the equivalent AD date —
// avoids reimplementing BS weekday math, reuses the already-converted date.
function firstWeekdayOfBSMonth(year, month) {
  const adStr = bsToAdDate(year, month, 1);
  if (!adStr) return 0;
  return new Date(`${adStr}T00:00:00`).getDay();
}

function firstWeekdayOfADMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function adMonthMaxDays(year, month) {
  return new Date(year, month, 0).getDate();
}

const pad2 = (n) => String(n).padStart(2, "0");

function adDateToParts(adStr) {
  if (!adStr) return null;
  const [y, m, d] = adStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

function formatADDate(adStr) {
  if (!adStr) return "—";
  return new Date(`${adStr}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const POPOVER_WIDTH = 288; // matches w-72
const VIEWPORT_MARGIN = 8;

/**
 * BSDatePicker — calendar picker that defaults to Nepali (Bikram Sambat) but can
 * render a Gregorian (AD) calendar instead via `mode="ad"` — same trigger/popover
 * chrome and positioning either way, just a different grid and month/year source.
 * value/onChange are always a plain AD "YYYY-MM-DD" string regardless of mode
 * (BS is converted via @sbmdkl/nepali-date-converter under nepali-date.js), so
 * the rest of the form, the API payload, and the database are unaffected.
 * The calendar popover is rendered via a portal into document.body and
 * positioned in fixed viewport coordinates so it always stays fully visible —
 * flipping above the trigger and clamping horizontally — instead of being
 * clipped by a modal's overflow or the edge of the browser window.
 */
export default function BSDatePicker({ value, onChange, required, className = "", mode = "bs" }) {
  const isBS = mode !== "ad";
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(null);
  const [viewMonth, setViewMonth] = useState(null);
  const [coords, setCoords] = useState(null); // { top, left, placement } in viewport (fixed) coordinates
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const selectedBS = isBS ? adToBsDate(value) : null;
  const selectedAD = isBS ? null : adDateToParts(value);
  const selected = isBS ? selectedBS : selectedAD;

  useEffect(() => {
    if (!open) return;
    const base = isBS ? (selectedBS || getCurrentBSDate()) : (selectedAD || adDateToParts(new Date().toISOString()));
    setViewYear(base?.year ?? (isBS ? 2083 : new Date().getFullYear()));
    setViewMonth(base?.month ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isBS]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Positions the popover in viewport ("fixed") coordinates, flipping above the
  // trigger and clamping horizontally so it always stays fully on-screen instead
  // of being clipped by a modal's overflow or the bottom of the browser window.
  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? 340;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceBelow < popoverHeight + VIEWPORT_MARGIN && rect.top > popoverHeight + VIEWPORT_MARGIN
      ? "top"
      : "bottom";

    const top = placement === "top"
      ? Math.max(VIEWPORT_MARGIN, rect.top - popoverHeight - 6)
      : Math.min(rect.bottom + 6, window.innerHeight - VIEWPORT_MARGIN);

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN
    );

    setCoords({ top, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (!open || !viewYear || !viewMonth) return;
    positionPopover();
  }, [open, viewYear, viewMonth, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => positionPopover();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, positionPopover]);

  const maxDays = viewYear && viewMonth ? (isBS ? getBSMonthMaxDays(viewYear, viewMonth) : adMonthMaxDays(viewYear, viewMonth)) : 30;
  const leadingBlanks = viewYear && viewMonth ? (isBS ? firstWeekdayOfBSMonth(viewYear, viewMonth) : firstWeekdayOfADMonth(viewYear, viewMonth)) : 0;
  const years = isBS ? getBSYearList() : getADYearList();
  const monthLabel = isBS ? BS_MONTHS[viewMonth - 1] : AD_MONTHS[viewMonth - 1];

  const changeMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const pickDay = (day) => {
    const ad = isBS ? bsToAdDate(viewYear, viewMonth, day) : `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    if (ad) onChange(ad);
    setOpen(false);
  };

  const popover = open && viewYear && coords && createPortal(
    (
      <div
        ref={popoverRef}
        className="fixed z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl p-3"
        style={{ top: coords.top, left: coords.left }}
        data-testid="bs-calendar-popover"
      >
          <div className="flex items-center justify-between mb-2 gap-2">
            <button type="button" onClick={() => changeMonth(-1)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500" data-testid="bs-prev-month">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
              <select
                value={viewYear}
                onChange={e => setViewYear(Number(e.target.value))}
                className="h-8 sm:h-7 px-1 text-base sm:text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="bs-year-select"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => changeMonth(1)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500" data-testid="bs-next-month">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 mb-1">
            {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
            {Array.from({ length: maxDays }, (_, i) => i + 1).map(day => {
              const isSelected = selected && selected.year === viewYear && selected.month === viewMonth && selected.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={`h-8 w-8 sm:h-7 sm:w-7 text-xs rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? "bg-blue-600 text-white font-semibold" : "text-slate-700 hover:bg-blue-50"
                  }`}
                  data-testid={`bs-day-${day}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
    ),
    document.body
  );

  return (
    <div className={`relative ${className}`} data-testid="bs-date-picker">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-10 sm:h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white flex items-center justify-between gap-2 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="bs-date-trigger"
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {isBS
            ? (selectedBS ? `${formatBSDate(value)} BS` : "Select date (BS)")
            : (selectedAD ? formatADDate(value) : "Select date (AD)")}
        </span>
        <Calendar size={15} className="text-slate-400 shrink-0" />
      </button>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500" data-testid="bs-date-ad-readout">
        {isBS ? (
          <>
            <span>Equivalent AD:</span>
            <span className="font-mono font-medium text-slate-700">{value || "—"}</span>
          </>
        ) : (
          <span>Equivalent BS: <span className="font-medium text-slate-700">{value ? `${formatBSDate(value)} BS` : "—"}</span></span>
        )}
        {value && <Check size={13} className="text-green-600" />}
      </div>

      {popover}
    </div>
  );
}
