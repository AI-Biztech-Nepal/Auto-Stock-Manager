// Rent arithmetic, ported from the FINANCE-NEPAL project (lib/utils/rental.ts).
// Like money.js, this is the one place the formulas live, so the list, the form and the backend agree.
//
// RENT is billed by the day, counting the day it went out and the day it came back. The renter owes the
// daily rate for every day out: the backend writes those days onto their customer ledger, and they pay
// it as Received entries whose note starts with the vehicle's name (picked in Item on the Received page).

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A vehicle's name as bills and payments compare it: trimmed, single spaces, lower case.
export const carKey = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

const dayNumber = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Billed to the day it returned; else to its due-back day when that is still ahead; else up to today
// (overdue: every day it stays out is a day more). At least one day.
export function rentalFigures(r, today) {
  const until = r.returned_on || (r.end_date && r.end_date > today ? r.end_date : today);
  const days = Math.max(1, dayNumber(until) - dayNumber(r.start_date) + 1);
  return { days, total: round2(days * Number(r.rate_per_day || 0)) };
}

export function rentalStatus(r, today) {
  if (r.returned_on) return { label: "Returned", color: "#374151", bg: "#F3F4F6" };
  if (r.end_date && r.end_date < today) return { label: "Overdue", color: "#B91C1C", bg: "#FEF2F2" };
  return { label: "Out", color: "#1D4ED8", bg: "#EFF6FF" };
}

// What a renter paid for one vehicle: their Received entries whose note starts with it (the first part of
// the note, before " · "). Journal vouchers are not payments.
const isJournal = (note) => /^journal voucher/i.test(String(note || ""));

export function receivedFor(books, customerId, car) {
  const k = carKey(car);
  if (!customerId || !k) return 0;
  return round2(books.customer_ledger
    .filter((e) => e.customer_id === customerId && e.entry_type === "credit" && e.note && !isJournal(e.note)
      && carKey(String(e.note).split(" · ")[0]) === k)
    .reduce((s, e) => s + Number(e.amount), 0));
}

// Every vehicle the Item box can offer on a payment or a rental: those already on a rental first, then the
// item names remembered from bills.
export function vehicleNames(books) {
  const seen = new Set();
  const out = [];
  const add = (name) => {
    const k = carKey(name);
    if (k && !seen.has(k)) { seen.add(k); out.push(String(name).trim()); }
  };
  books.rentals.forEach((r) => add(r.car));
  books.items.forEach((i) => add(i.name));
  return out;
}

// A payment's note is "<vehicle> · <remark>", so Rent can find what it was paid for.
export const noteWithItem = (item, remark) => {
  const it = String(item || "").trim();
  const re = String(remark || "").trim();
  return it && re ? `${it} · ${re}` : it || re;
};
