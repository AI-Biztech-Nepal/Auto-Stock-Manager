// The one place every finance formula lives (FINANCE-SPEC section 2). Every screen reads from
// here, so two screens can never show two different balances.
//
// Rules this encodes:
//  1. A sale/purchase bill is NOT money -- it books a debt on the party's ledger.
//  2. An expense IS money: paid on the spot.
//  3. A bill with no saved party is money: nobody can settle it later, so its cash moved when it was
//     recorded (isSettledOnTheSpot).
//  4. Cash in hand is bank_account_id = null (the bucket "cash").

export const CASH = "cash";
export const bucketOf = (accountId) => accountId || CASH;

const pad = (n) => String(n).padStart(2, "0");
// "Today" is the LOCAL day. toISOString() is UTC and would push late-evening Nepal entries into tomorrow.
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

// A saved row's own date wins; created_at is only the fallback for rows saved before dating existed.
export const dayOf = (iso) => (iso || "").slice(0, 10);
export const entryDate = (e) => e.entry_date || dayOf(e.created_at);
export const billDate = (t) => t.bill_date || dayOf(t.created_at);
export const transferDate = (t) => t.transfer_date || dayOf(t.created_at);

export const isSettledOnTheSpot = (t) => (t.type === "sale" || t.type === "purchase") && !t.customer_id;

export const npr = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `NPR ${Math.round(n).toLocaleString("en-IN")}`);
export const num = (n) => Math.round(n || 0).toLocaleString("en-IN");

// Money in / out / bill / transfer colours, used the same way everywhere.
export const COLORS = { in: "#047857", out: "#B91C1C", sale: "#1D4ED8", purchase: "#6D28D9", transfer: "#4338CA", balance: "#2563EB" };

export const emptyBooks = () => ({
  parties: [], accounts: [], transfers: [], categories: [], items: [],
  transactions: [], customer_ledger: [], vendor_ledger: [],
});

export const partyName = (books, id, fallback = "") => books.parties.find((p) => p.id === id)?.name || fallback;
export const accountName = (books, id) => (id ? books.accounts.find((a) => a.id === id)?.name || "Account" : "Cash");

// ── 2.1 what a party owes / is owed ───────────────────────────────────────
export function partyBalances(books) {
  const by = {};
  const get = (id) => (by[id] ||= { receivable: 0, payable: 0 });
  for (const e of books.customer_ledger) get(e.customer_id).receivable += e.entry_type === "debit" ? e.amount : -e.amount;
  for (const e of books.vendor_ledger) get(e.vendor_id).payable += e.entry_type === "debit" ? e.amount : -e.amount;
  return by;
}

// Business totals only count parties on the wrong side of zero, so one customer in credit never
// cancels another's debt.
export function owedTotals(books) {
  const by = partyBalances(books);
  const owingMe = [], iOwe = [];
  for (const p of books.parties) {
    const b = by[p.id];
    if (!b) continue;
    if (b.receivable > 0) owingMe.push({ party: p, amount: b.receivable });
    if (b.payable > 0) iOwe.push({ party: p, amount: b.payable });
  }
  owingMe.sort((a, b) => b.amount - a.amount);
  iOwe.sort((a, b) => b.amount - a.amount);
  return {
    owingMe, iOwe,
    totalReceivable: owingMe.reduce((s, x) => s + x.amount, 0),
    totalPayable: iOwe.reduce((s, x) => s + x.amount, 0),
  };
}

// ── 2.2 available balance (cash + every bank account) ─────────────────────
// `before` (exclusive) makes this the opening balance for a day; `upTo` (inclusive) caps it.
// Each bucket keeps the lines behind its number, so a wrong total can be traced.
export function balances(books, { before, upTo } = {}) {
  const buckets = {};
  const inRange = (d) => (before ? d < before : true) && (upTo ? d <= upTo : true);
  const add = (accountId, amount, line) => {
    const k = bucketOf(accountId);
    const b = (buckets[k] ||= { total: 0, lines: [] });
    b.total += amount;
    b.lines.push({ amount, ...line });
  };
  for (const t of books.transactions) {
    const d = billDate(t);
    if (!inRange(d)) continue;
    const who = t.party_name || partyName(books, t.customer_id) || "Walk-in";
    if (isSettledOnTheSpot(t)) add(t.bank_account_id, t.type === "sale" ? t.amount : -t.amount, { date: d, label: `${t.type === "sale" ? "Sale" : "Purchase"} (no party): ${who}`, kind: t.type });
    else if (t.type === "expense") add(t.bank_account_id, -t.amount, { date: d, label: `Expense: ${who || "—"}`, kind: "expense" });
  }
  for (const e of books.customer_ledger) {
    const d = entryDate(e);
    if (!inRange(d)) continue;
    const who = partyName(books, e.customer_id, "Customer");
    if (e.entry_type === "credit") add(e.bank_account_id, e.amount, { date: d, label: `Received from ${who}`, kind: "in" });
    else if (e.source === "manual") add(e.bank_account_id, -e.amount, { date: d, label: `Refunded to ${who}`, kind: "out" });
  }
  for (const e of books.vendor_ledger) {
    const d = entryDate(e);
    if (!inRange(d)) continue;
    if (e.entry_type === "credit") add(e.bank_account_id, -e.amount, { date: d, label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, kind: "out" });
  }
  // Transfers move money between your own accounts and never change the total.
  for (const t of books.transfers) {
    const d = transferDate(t);
    if (!inRange(d)) continue;
    add(t.from_account_id, -t.amount, { date: d, label: `Transfer to ${accountName(books, t.to_account_id)}`, kind: "transfer" });
    add(t.to_account_id, t.amount, { date: d, label: `Transfer from ${accountName(books, t.from_account_id)}`, kind: "transfer" });
  }
  const total = Object.values(buckets).reduce((s, b) => s + b.total, 0);
  return { buckets, total, cash: buckets[CASH]?.total || 0 };
}

// ── 2.3 total received / total paid, bucketed by entry date ───────────────
// Returns every contributing line so a Totals screen can list and link them.
export function cashMovements(books) {
  const lines = [];
  for (const t of books.transactions) {
    const d = billDate(t);
    const who = t.party_name || partyName(books, t.customer_id) || "Walk-in";
    if (isSettledOnTheSpot(t)) lines.push({ id: t.id, date: d, dir: t.type === "sale" ? "in" : "out", amount: t.amount, label: `${t.type === "sale" ? "Sale" : "Purchase"}: ${who}`, table: "tx" });
    else if (t.type === "expense") lines.push({ id: t.id, date: d, dir: "out", amount: t.amount, label: `Expense: ${who}`, table: "tx" });
  }
  for (const e of books.customer_ledger) {
    const who = partyName(books, e.customer_id, "Customer");
    if (e.entry_type === "credit") lines.push({ id: e.id, date: entryDate(e), dir: "in", amount: e.amount, label: `Received from ${who}`, table: "cl" });
    else if (e.source === "manual") lines.push({ id: e.id, date: entryDate(e), dir: "out", amount: e.amount, label: `Refunded to ${who}`, table: "cl" });
  }
  for (const e of books.vendor_ledger) {
    if (e.entry_type === "credit") lines.push({ id: e.id, date: entryDate(e), dir: "out", amount: e.amount, label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, table: "vl" });
  }
  return lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function receivedPaid(books, from, to) {
  let received = 0, paid = 0;
  for (const m of cashMovements(books)) {
    if ((from && m.date < from) || (to && m.date > to)) continue;
    if (m.dir === "in") received += m.amount; else paid += m.amount;
  }
  return { received, paid };
}

// ── 2.4 profit & loss, straight off the bills ─────────────────────────────
export function profitLoss(books, from, to) {
  let sale = 0, purchase = 0, expense = 0;
  for (const t of books.transactions) {
    const d = billDate(t);
    if ((from && d < from) || (to && d > to)) continue;
    if (t.type === "sale") sale += t.amount;
    else if (t.type === "purchase") purchase += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }
  const gross = sale - purchase;
  return { sale, purchase, expense, gross, net: gross - expense };
}

// ── receipt numbering: 001, 002, ... from the highest used in THIS direction ─
export function nextReceiptNo(entries) {
  const nums = entries.map((e) => Number(String(e.receipt_no ?? "").replace(/\D/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  // Falls back to the row count: entries saved before numbering existed have no receipt_no, and
  // without this the suggestion would stick at 001 forever.
  const next = (nums.length ? Math.max(...nums) : entries.length) + 1;
  return String(next).padStart(3, "0");
}

export function nextBillNo(transactions, type) {
  const rows = transactions.filter((t) => t.type === type);
  const nums = rows.map((t) => Number(String(t.bill_no ?? "").replace(/\D/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  return String((nums.length ? Math.max(...nums) : rows.length) + 1).padStart(3, "0");
}

// ── bill arithmetic ───────────────────────────────────────────────────────
export function billTotals(lines, discount, vatPercent) {
  const subtotal = lines.reduce((s, l) => (l.description?.trim() && Number(l.qty) > 0 && Number(l.rate) >= 0 ? s + Number(l.qty) * Number(l.rate) : s), 0);
  const disc = Math.max(0, Number(discount) || 0);
  const vat = Math.round(((subtotal - disc) * (Number(vatPercent) || 0)) / 100);
  return { subtotal, discount: disc, vat, total: subtotal - disc + vat };
}

// ── Day Book (section 3.1) ────────────────────────────────────────────────
// Rows for one day, in time order, with a running balance that only cash rows advance. The opening
// balance calls the SAME available-balance formula with a cutoff, so the two can never disagree.
export function dayBook(books, date) {
  const opening = balances(books, { before: date }).total;
  const rows = [];
  for (const t of books.transactions) {
    if (billDate(t) !== date) continue;
    const who = t.party_name || partyName(books, t.customer_id) || "";
    if (t.type === "expense") rows.push({ key: `t${t.id}`, at: t.created_at, kind: "expense", label: `Expense${who ? `: ${who}` : ""}`, note: t.note, invoice: t.bill_no, out: t.amount, table: "tx", data: t });
    else if (isSettledOnTheSpot(t)) rows.push({ key: `t${t.id}`, at: t.created_at, kind: t.type, label: `${t.type === "sale" ? "Sale" : "Purchase"}${who ? `: ${who}` : ""} (no party)`, note: t.note, invoice: t.bill_no, bill: t.amount, discount: t.discount_amount, invoiceAmt: t.amount + (t.discount_amount || 0) - (t.vat_amount || 0), [t.type === "sale" ? "in" : "out"]: t.amount, table: "tx", data: t });
    else rows.push({ key: `t${t.id}`, at: t.created_at, kind: t.type, label: `${t.type === "sale" ? "Sale" : "Purchase"}: ${who || "—"}`, note: t.note, invoice: t.bill_no, bill: t.amount, discount: t.discount_amount, invoiceAmt: t.amount + (t.discount_amount || 0) - (t.vat_amount || 0), table: "tx", data: t });
  }
  for (const e of books.customer_ledger) {
    if (entryDate(e) !== date) continue;
    const isIn = e.entry_type === "credit";
    if (!isIn && e.source !== "manual") continue; // a booking debit IS the sale bill row
    rows.push({ key: `c${e.id}`, at: e.created_at, kind: isIn ? "received" : "paid", label: isIn ? `Received from ${partyName(books, e.customer_id, "Customer")}` : `Paid to ${partyName(books, e.customer_id, "Customer")}`, note: e.note, invoice: e.receipt_no, [isIn ? "in" : "out"]: e.amount, table: "cl", data: e });
  }
  for (const e of books.vendor_ledger) {
    if (entryDate(e) !== date || e.entry_type !== "credit") continue; // debits are the Purchase itself
    rows.push({ key: `v${e.id}`, at: e.created_at, kind: "paid", label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, note: e.note, invoice: e.receipt_no, out: e.amount, table: "vl", data: e });
  }
  for (const t of books.transfers) {
    if (transferDate(t) !== date) continue;
    rows.push({ key: `x${t.id}`, at: t.created_at, kind: "transfer", label: `${accountName(books, t.from_account_id)} → ${accountName(books, t.to_account_id)}`, note: t.note, transferAmount: t.amount, table: "tr", data: t });
  }
  rows.sort((a, b) => ((a.at || "") < (b.at || "") ? -1 : (a.at || "") > (b.at || "") ? 1 : 0));
  let running = opening, cashIn = 0, cashOut = 0, salesBilled = 0, purchasesBilled = 0;
  for (const r of rows) {
    if (r.in) { running += r.in; cashIn += r.in; }
    if (r.out) { running -= r.out; cashOut += r.out; }
    if (r.in || r.out) r.balance = running;
    if (r.kind === "sale") salesBilled += r.bill || 0;
    if (r.kind === "purchase") purchasesBilled += r.bill || 0;
  }
  return { opening, rows, cashIn, cashOut, closing: opening + cashIn - cashOut, salesBilled, purchasesBilled };
}

// ── the interleaved feed under the entry forms ────────────────────────────
export function feedRows(books) {
  const rows = [];
  for (const t of books.transactions) {
    const who = t.party_name || partyName(books, t.customer_id) || "—";
    rows.push({ key: `t${t.id}`, date: billDate(t), at: t.created_at, kind: t.type, label: `${t.type[0].toUpperCase()}${t.type.slice(1)}: ${who}`, amount: t.amount, number: t.bill_no, table: "tx", data: t });
  }
  for (const e of books.customer_ledger) {
    if (e.entry_type === "debit" && e.source !== "manual") continue;
    const isIn = e.entry_type === "credit";
    rows.push({ key: `c${e.id}`, date: entryDate(e), at: e.created_at, kind: isIn ? "received" : "paid", label: `${isIn ? "Received from" : "Refunded to"} ${partyName(books, e.customer_id, "Customer")}`, amount: e.amount, number: e.receipt_no, table: "cl", data: e });
  }
  for (const e of books.vendor_ledger) {
    if (e.entry_type !== "credit") continue;
    rows.push({ key: `v${e.id}`, date: entryDate(e), at: e.created_at, kind: "paid", label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, amount: e.amount, number: e.receipt_no, table: "vl", data: e });
  }
  for (const t of books.transfers) {
    rows.push({ key: `x${t.id}`, date: transferDate(t), at: t.created_at, kind: "transfer", label: `${accountName(books, t.from_account_id)} → ${accountName(books, t.to_account_id)}`, amount: t.amount, table: "tr", data: t });
  }
  return rows.sort((a, b) => (a.date === b.date ? ((a.at || "") < (b.at || "") ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export const KIND_STYLE = {
  sale: { label: "Sale", color: COLORS.sale },
  purchase: { label: "Purchase", color: COLORS.purchase },
  expense: { label: "Expense", color: COLORS.out },
  received: { label: "Received", color: COLORS.in },
  paid: { label: "Paid out", color: COLORS.out },
  transfer: { label: "Transfer", color: COLORS.transfer },
};
