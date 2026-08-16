import { adToBs, bsToAd } from "@sbmdkl/nepali-date-converter";

export const BS_MONTHS = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];

// Convert AD date string (YYYY-MM-DD) → BS {year, month, day} or null
export function adToBsDate(adStr) {
  if (!adStr) return null;
  try {
    const result = adToBs(adStr.slice(0, 10));
    const [y, m, d] = result.split("-").map(Number);
    return { year: y, month: m, day: d };
  } catch {
    return null;
  }
}

// Convert BS {year, month, day} → AD date string (YYYY-MM-DD) or null
export function bsToAdDate(year, month, day) {
  if (!year || !month || !day) return null;
  try {
    const bsStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return bsToAd(bsStr);
  } catch {
    return null;
  }
}

// Format: "2083 Jestha 21"
export function formatBSDate(adStr) {
  const bs = adToBsDate(adStr);
  if (!bs) return "—";
  return `${bs.year} ${BS_MONTHS[bs.month - 1]} ${bs.day}`;
}

// Format: "2083/02/21"
export function formatBSDateNumeric(adStr) {
  const bs = adToBsDate(adStr);
  if (!bs) return "—";
  return `${bs.year}/${String(bs.month).padStart(2, "0")}/${String(bs.day).padStart(2, "0")}`;
}

// Get today's BS date
export function getCurrentBSDate() {
  return adToBsDate(new Date().toISOString().slice(0, 10));
}

// Get max days in a BS year/month (scans down from 32)
export function getBSMonthMaxDays(year, month) {
  for (let d = 32; d >= 28; d--) {
    if (bsToAdDate(year, month, d)) return d;
  }
  return 30;
}

// AD range for any given BS year/month → { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
export function getBSMonthRange(year, month) {
  const start = bsToAdDate(year, month, 1);
  if (!start) return null;
  const maxDay = getBSMonthMaxDays(year, month);
  const end = bsToAdDate(year, month, maxDay);
  return { start, end };
}

// AD range for the current BS month → { start: "YYYY-MM-DD", end: "YYYY-MM-DD", bsYear, bsMonth }
export function getCurrentBSMonthRange() {
  const bs = getCurrentBSDate();
  if (!bs) return null;
  const range = getBSMonthRange(bs.year, bs.month);
  return range ? { ...range, bsYear: bs.year, bsMonth: bs.month } : null;
}

// AD range for the current BS year → { start, end, bsYear }
export function getCurrentBSYearRange() {
  const bs = getCurrentBSDate();
  if (!bs) return null;
  const start = bsToAdDate(bs.year, 1, 1);
  const maxDay = getBSMonthMaxDays(bs.year, 12);
  const end = bsToAdDate(bs.year, 12, maxDay);
  return { start, end, bsYear: bs.year };
}

// Today's AD date as string
export function getTodayAD() {
  return new Date().toISOString().slice(0, 10);
}

// AD range for the current calendar week (Sunday–Saturday) → { start, end }
export function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}
