// The Balance Sheet, ported from FINANCE-NEPAL's BalanceSheetScreen: what the business owns (cash and bank,
// what customers owe, stock, advances paid to vendors) against what it owes (vendors, customer advances), and
// the owner's equity that balances the two. Everything is read from the books; nothing is typed here.
//
//   cash and bank      the same available-balance formula as everywhere else, up to the day
//   debtors            customers whose ledger says they owe you, up to the day
//   customer advances  customers in credit (paid more than they were billed)
//   creditors          vendors you owe; vendor advances are vendors in credit
//   stock              the vehicles in stock at cost (the app's own figure, passed in: it has no history,
//                      so every column uses today's stock)
//   equity             the balancing figure, so the sheet always balances
import { balances, entryDate } from "./money";
import { adToBsDate, bsToAdDate, getBSMonthRange, BS_MONTHS } from "../../utils/nepali-date";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export const addDays = (day, n) => iso(new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS));

// ── dates (Bikram Sambat: the fiscal year starts on Shrawan 1, the 4th month) ──
export const monthStart = (day) => { const bs = adToBsDate(day); return bs ? bsToAdDate(bs.year, bs.month, 1) : `${day.slice(0, 7)}-01`; };
export const fiscalStart = (day) => {
  const bs = adToBsDate(day);
  return bs ? bsToAdDate(bs.month >= 4 ? bs.year : bs.year - 1, 4, 1) : `${day.slice(0, 4)}-07-16`;
};

export const AS_ON = [["today", "Today"], ["last_month", "End of last month"], ["last_fy", "End of last fiscal year"]];
export const COMPARE = [["fy_start", "Start of fiscal year"], ["month_start", "Start of this month"], ["year_ago", "Same day last year"], ["none", "No comparison"]];

export const asOnDay = (key, today) => (key === "last_month" ? addDays(monthStart(today), -1) : key === "last_fy" ? addDays(fiscalStart(today), -1) : today);
export const compareDay = (key, asOn) => (key === "none" ? null : key === "fy_start" ? addDays(fiscalStart(asOn), -1) : key === "month_start" ? addDays(monthStart(asOn), -1) : addDays(asOn, -365));

// The last `n` month ends (the current month ends today), oldest first, for the trend chart.
export function monthEnds(today, n = 6) {
  const bs = adToBsDate(today);
  if (!bs) return [];
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = bs.year, m = bs.month - i;
    while (m < 1) { m += 12; y -= 1; }
    out.push({ label: BS_MONTHS[m - 1].slice(0, 3), day: i === 0 ? today : getBSMonthRange(y, m)?.end || today });
  }
  return out;
}

// The whole sheet as it stood at the end of `day`. `stock` is the stock at cost.
export function sheetAt(books, day, stock = 0) {
  const bal = balances(books, { upTo: day });
  const banks = books.accounts.map((a) => ({ id: a.id, name: a.name, balance: r2(bal.buckets[a.id]?.total || 0) }));
  const bankTotal = r2(banks.reduce((s, b) => s + b.balance, 0));
  const cust = {}, vend = {};
  for (const e of books.customer_ledger) if (entryDate(e) <= day) cust[e.customer_id] = (cust[e.customer_id] || 0) + (e.entry_type === "debit" ? e.amount : -e.amount);
  for (const e of books.vendor_ledger) if (entryDate(e) <= day) vend[e.vendor_id] = (vend[e.vendor_id] || 0) + (e.entry_type === "debit" ? e.amount : -e.amount);
  const nameOf = (id) => books.parties.find((p) => p.id === id)?.name || "Party";
  const side = (by, positive) => Object.entries(by).filter(([, v]) => (positive ? v > 0.004 : v < -0.004)).map(([id, v]) => ({ id, name: nameOf(id), amount: r2(Math.abs(v)) })).sort((a, b) => b.amount - a.amount);
  const debtors = side(cust, true), customerAdvances = side(cust, false);
  const creditors = side(vend, true), vendorAdvances = side(vend, false);
  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0));
  const cash = r2(bal.cash);
  const assets = r2(cash + bankTotal + sum(debtors) + sum(vendorAdvances) + stock);
  const liabilities = r2(sum(creditors) + sum(customerAdvances));
  return {
    cash, banks, bankTotal,
    debtors, debtorsTotal: sum(debtors), vendorAdvances, vendorAdvancesTotal: sum(vendorAdvances),
    stock: r2(stock),
    creditors, creditorsTotal: sum(creditors), customerAdvances, customerAdvancesTotal: sum(customerAdvances),
    assets, liabilities, equity: r2(assets - liabilities),
    ratio: liabilities > 0 ? assets / liabilities : null,
  };
}

export const changePct = (now, before) => (Math.abs(before) < 1 ? null : ((now - before) / Math.abs(before)) * 100);
