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
export const COLORS = { in: "#047857", out: "#B91C1C", sale: "#1D4ED8", purchase: "#6D28D9", transfer: "#4338CA", balance: "#2563EB", journal: "#0F766E" };

// ── journal vouchers ─────────────────────────────────────────────────────
// A voucher moves an amount between people's ledgers (or charges an expense head) and touches no cash: it is
// kept as ordinary entries that all carry one code in their note, "Journal voucher JV-7K3Q9X: narration"
// (FINANCE-NEPAL's journalVoucher.ts, and finance_books.journal_of on the server). Cash, Received / Paid
// totals and the Day Book's cash columns leave these entries out; the people's ledgers do not.
const JOURNAL_NOTE = /^Journal voucher (JV-[A-Z0-9]{6})(?::\s*([\s\S]*))?$/;
export const journalOf = (note) => {
  const m = note ? JOURNAL_NOTE.exec(String(note).trim()) : null;
  return m ? { code: m[1], narration: (m[2] || "").trim() } : null;
};
export const isJournal = (e) => !!journalOf(e.note);

// Every voucher as one record: when, who is debited / credited, the total, and the entries that make it up.
export function journalVouchers(books) {
  const by = new Map();
  const voucher = (j, date, at) => {
    if (!by.has(j.code)) by.set(j.code, { code: j.code, narration: j.narration, date, at, debits: [], credits: [], total: 0, entries: [] });
    return by.get(j.code);
  };
  const line = (name, amount) => ({ name, amount: Number(amount) });
  for (const e of books.customer_ledger) {
    const j = journalOf(e.note);
    if (!j) continue;
    const v = voucher(j, e.entry_date || dayOf(e.created_at), e.created_at);
    v.entries.push({ table: "cl", id: e.id });
    const who = books.parties.find((p) => p.id === e.customer_id)?.name || "Customer";
    // Received = the person credited; Paid = the person debited.
    if (e.entry_type === "credit") v.credits.push(line(who, e.amount));
    else { v.debits.push(line(who, e.amount)); v.total += Number(e.amount); }
  }
  for (const e of books.vendor_ledger) {
    const j = journalOf(e.note);
    if (!j) continue;
    const v = voucher(j, e.entry_date || dayOf(e.created_at), e.created_at);
    v.entries.push({ table: "vl", id: e.id });
    const who = books.parties.find((p) => p.id === e.vendor_id)?.name || "Vendor";
    if (e.entry_type === "credit") { v.debits.push(line(who, e.amount)); v.total += Number(e.amount); }
    else v.credits.push(line(who, e.amount));
  }
  for (const t of books.transactions) {
    const j = t.type === "expense" ? journalOf(t.note) : null;
    if (!j) continue;
    const v = voucher(j, t.bill_date || dayOf(t.created_at), t.created_at);
    v.entries.push({ table: "tx", id: t.id });
    v.debits.push(line(books.categories.find((c) => c.id === t.expense_category_id)?.name || t.party_name || "Expense", t.amount));
    v.total += Number(t.amount);
  }
  return [...by.values()];
}

export const voucherSummary = (v) => [
  `Dr ${v.debits.map((l) => `${l.name} ${num(l.amount)}`).join(", ") || "…"} · Cr ${v.credits.map((l) => `${l.name} ${num(l.amount)}`).join(", ") || "…"}`,
  v.narration || null,
].filter(Boolean).join(" · ");

export const emptyBooks = () => ({
  parties: [], accounts: [], transfers: [], categories: [], items: [],
  transactions: [], customer_ledger: [], vendor_ledger: [],
  rentals: [], cash_account: null, rent_ready: false, services_ready: false, groups_ready: false,
  party_types: [], types_ready: false,
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

// ── the Ledger's table, as Finance Nepal shows it ─────────────────────────
// One row per party, with its two ledgers read as the one account they add up to. `balance` > 0 is to
// receive, < 0 to pay, at the end of the period. Within the period: `billed` (Transaction: sales and
// purchases with them, before any payment), `paid` (money paid to them: a vendor payment or a refund to a
// customer) and `received` (money received from them). Journal vouchers move the balance, never cash.
// A party with no ledger type shows as Customer or Vendor from the side its ledger holds most of.
export function ledgerRows(books, from, to) {
  const typeName = new Map((books.party_types || []).map((t) => [t.id, t.name]));
  const rows = new Map(books.parties.map((p) => [p.id, {
    party: p, billed: 0, paid: 0, received: 0, balance: 0, last: null, custCount: 0, vendCount: 0,
  }]));
  const visit = (id, e, side) => {
    const r = rows.get(id);
    if (!r) return;
    const d = entryDate(e);
    if (to && d > to) return;
    const debit = e.entry_type === "debit";
    if (side === "c") { r.custCount++; r.balance += debit ? e.amount : -e.amount; } else { r.vendCount++; r.balance -= debit ? e.amount : -e.amount; }
    if (!r.last || d > r.last) r.last = d;
    if (from && d < from) return;
    if (isJournal(e)) return;
    if (debit && (side === "v" || e.source !== "manual")) r.billed += e.amount;
    else if (side === "c" && debit) r.paid += e.amount;       // refund to a customer
    else if (side === "c") r.received += e.amount;
    else r.paid += e.amount;                                  // payment to a vendor
  };
  for (const e of books.customer_ledger) visit(e.customer_id, e, "c");
  for (const e of books.vendor_ledger) visit(e.vendor_id, e, "v");
  return [...rows.values()].map((r) => {
    const round = (n) => Math.round(n * 100) / 100;
    const balance = round(r.balance);
    return {
      ...r, balance,
      status: balance > 0 ? "receivable" : balance < 0 ? "payable" : "settled",
      typeName: typeName.get(r.party.party_type_id) || null,
      shownType: typeName.get(r.party.party_type_id) || (r.vendCount > r.custCount ? "Vendor" : "Customer"),
    };
  });
}

// ── one party's statement, as Finance Nepal's party ledger shows it ───────
// Both ledgers as one account, oldest first to run the balance, returned newest first. Debit = they owe you
// more (a sale, a refund paid out to them, a payment made to a vendor), credit = they owe you less (money
// received, a purchase on credit). `balance` > 0 is Dr (they owe you), < 0 is Cr (you owe them).
// `kind` is the Ledger table's word for the money: billed, paid, received, or none for a journal voucher.
const BILL_KIND = { sale: "Sales no.", purchase: "Purchase no.", expense: "Expenses no." };

export function partyStatement(books, partyId) {
  const bills = new Map(books.transactions.map((t) => [t.id, t]));
  const items = [];
  const push = (e, side) => {
    const debitEntry = e.entry_type === "debit";
    const manual = e.source === "manual";
    const journal = isJournal(e);
    const kind = journal ? "none" : side === "c" ? (debitEntry ? (manual ? "paid" : "billed") : "received") : (debitEntry ? "billed" : "paid");
    const label = journal ? "Journal voucher"
      : side === "c" ? (debitEntry ? (manual ? "Paid out" : e.source_type === "rental_rent" ? "Daily rent" : "Billed") : "Received")
      : (debitEntry ? "Bought on credit" : "Paid");
    const bill = e.source_type === "business_transaction" ? bills.get(e.source_id) : null;
    const no = bill?.bill_no || e.receipt_no;
    const refKind = bill ? BILL_KIND[bill.type] : side === "v" ? (debitEntry ? "Purchase no." : "Payment no.") : (debitEntry ? (manual ? "Payment no." : "Sales no.") : "Receipt no.");
    const j = journalOf(e.note);
    const note = j ? [j.code, j.narration].filter(Boolean).join(" · ") : e.note;
    // customer debit and vendor credit raise what they owe you; the other two lower it
    const up = side === "c" ? debitEntry : !debitEntry;
    items.push({
      e, side, table: side === "c" ? "cl" : "vl", date: entryDate(e), kind, label,
      sub: [no ? `${refKind} ${no}` : null, note].filter(Boolean).join(" · "),
      debit: up ? e.amount : 0, credit: up ? 0 : e.amount,
    });
  };
  for (const e of books.customer_ledger) if (e.customer_id === partyId) push(e, "c");
  for (const e of books.vendor_ledger) if (e.vendor_id === partyId) push(e, "v");
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.e.created_at || "") < (b.e.created_at || "") ? -1 : 1));
  let run = 0;
  for (const l of items) { run += l.debit - l.credit; l.balance = Math.round(run * 100) / 100; }
  const sum = (k) => items.reduce((s, l) => s + (l.kind === k ? l.e.amount : 0), 0);
  return {
    lines: items.reverse(),
    billed: sum("billed"), paid: sum("paid"), received: sum("received"),
    debit: items.reduce((s, l) => s + l.debit, 0), credit: items.reduce((s, l) => s + l.credit, 0),
    closing: Math.round(run * 100) / 100,
  };
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
    if (!inRange(d) || isJournal(t)) continue;
    const who = t.party_name || partyName(books, t.customer_id) || "Walk-in";
    if (isSettledOnTheSpot(t)) add(t.bank_account_id, t.type === "sale" ? t.amount : -t.amount, { date: d, label: `${t.type === "sale" ? "Sale" : "Purchase"} (no party): ${who}`, kind: t.type });
    else if (t.type === "expense") add(t.bank_account_id, -t.amount, { date: d, label: `Expense: ${who || "—"}`, kind: "expense" });
  }
  for (const e of books.customer_ledger) {
    const d = entryDate(e);
    if (!inRange(d) || isJournal(e)) continue;
    const who = partyName(books, e.customer_id, "Customer");
    if (e.entry_type === "credit") add(e.bank_account_id, e.amount, { date: d, label: `Received from ${who}`, kind: "in" });
    else if (e.source === "manual") add(e.bank_account_id, -e.amount, { date: d, label: `Refunded to ${who}`, kind: "out" });
  }
  for (const e of books.vendor_ledger) {
    const d = entryDate(e);
    if (!inRange(d) || isJournal(e)) continue;
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
    if (isJournal(t)) continue;
    const d = billDate(t);
    const who = t.party_name || partyName(books, t.customer_id) || "Walk-in";
    if (isSettledOnTheSpot(t)) lines.push({ id: t.id, date: d, dir: t.type === "sale" ? "in" : "out", amount: t.amount, label: `${t.type === "sale" ? "Sale" : "Purchase"}: ${who}`, table: "tx", party: t.customer_id || null, ref: t.bill_no, src: t.type === "sale" ? "walkIn" : "walkInBought" });
    else if (t.type === "expense") lines.push({ id: t.id, date: d, dir: "out", amount: t.amount, label: `Expense: ${who}`, table: "tx", party: t.customer_id || null, ref: t.bill_no, src: "expense" });
  }
  for (const e of books.customer_ledger) {
    if (isJournal(e)) continue;
    const who = partyName(books, e.customer_id, "Customer");
    if (e.entry_type === "credit") lines.push({ id: e.id, date: entryDate(e), dir: "in", amount: e.amount, label: `Received from ${who}`, table: "cl", party: e.customer_id, ref: e.receipt_no, src: "customers" });
    else if (e.source === "manual") lines.push({ id: e.id, date: entryDate(e), dir: "out", amount: e.amount, label: `Refunded to ${who}`, table: "cl", party: e.customer_id, ref: e.receipt_no, src: "toCustomers" });
  }
  for (const e of books.vendor_ledger) {
    if (isJournal(e)) continue;
    if (e.entry_type === "credit") lines.push({ id: e.id, date: entryDate(e), dir: "out", amount: e.amount, label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, table: "vl", party: e.vendor_id, ref: e.receipt_no, src: "toVendors" });
  }
  return lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Also split by where the money came from / went (src), for the Report's received / paid account.
export function receivedPaid(books, from, to) {
  let received = 0, paid = 0;
  const by = { walkIn: 0, customers: 0, expense: 0, toVendors: 0, toCustomers: 0, walkInBought: 0 };
  for (const m of cashMovements(books)) {
    if ((from && m.date < from) || (to && m.date > to)) continue;
    if (m.dir === "in") received += m.amount; else paid += m.amount;
    by[m.src] += m.amount;
  }
  return { received, paid, by };
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
// Services (installation, repair, outsourced work ...) are part of the bill: the discount and VAT apply to
// the items and the services together, and the grand total already includes them.
export const serviceLines = (services = []) => services.filter((s) => String(s.name || "").trim() && Number(s.amount) > 0);

export function billTotals(lines, discount, vatPercent, services = []) {
  const items = lines.reduce((s, l) => (l.description?.trim() && Number(l.qty) > 0 && Number(l.rate) >= 0 ? s + Number(l.qty) * Number(l.rate) : s), 0);
  const serviceTotal = serviceLines(services).reduce((s, x) => s + Number(x.amount), 0);
  const subtotal = items + serviceTotal;
  const disc = Math.max(0, Number(discount) || 0);
  const vat = Math.round(((subtotal - disc) * (Number(vatPercent) || 0)) / 100);
  return { items, services: serviceTotal, subtotal, discount: disc, vat, total: subtotal - disc + vat };
}

// A saved bill's services added up (the older single installation charge counts as one).
export const billServices = (t) =>
  (Number(t.installation_charge) || 0) + (t.service_charges || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);

// ── Tally-style trading and profit & loss account ─────────────────────────
// Trading part: sales of items and direct incomes (services sold) against purchases and direct
// expenses (services bought in, and every expense head not marked indirect), to a gross profit or
// loss. Then indirect expenses take it to the net result. Bills dated in the period, paid or not.
// Stock is not valued in these books, so there are no opening / closing stock lines.
export function tradingAccount(books, from, to) {
  const names = new Map(books.categories.map((c) => [c.id, c.name]));
  const indirectNames = new Set(books.categories.filter((c) => c.expense_group === "indirect").map((c) => c.name));
  let items = 0, services = 0, servicesBought = 0, purchase = 0;
  const bills = { sale: 0, purchase: 0, expense: 0 };
  const expenses = new Map();
  for (const t of books.transactions) {
    if (isJournal(t)) continue;
    const d = billDate(t);
    if ((from && d < from) || (to && d > to)) continue;
    bills[t.type] = (bills[t.type] || 0) + 1;
    if (t.type === "sale") {
      const svc = billServices(t);
      services += svc;
      items += t.amount - svc;
    } else if (t.type === "purchase") {
      const svc = billServices(t);
      servicesBought += svc;
      purchase += t.amount - svc;
    } else if (t.type === "expense") {
      const name = (t.expense_category_id && names.get(t.expense_category_id)) || "Uncategorised";
      expenses.set(name, (expenses.get(name) || 0) + t.amount);
    }
  }
  // Two heads only: a head is direct unless it was marked Indirect (or its name says so).
  const direct = [], indirect = [];
  [...expenses.entries()].sort((a, b) => b[1] - a[1])
    .forEach((e) => (indirectNames.has(e[0]) || /indirect/i.test(e[0]) ? indirect : direct).push(e));
  if (servicesBought > 0) direct.unshift(["Services bought (outsourced work)", servicesBought]);
  const sum = (list) => list.reduce((s, [, v]) => s + v, 0);
  const income = items + services;
  const directTotal = sum(direct);
  const indirectTotal = sum(indirect);
  const gross = income - purchase - directTotal;
  const net = gross - indirectTotal;
  return { items, services, income, purchase, direct, indirect, directTotal, indirectTotal, gross, net, bills, costOfGoods: purchase + directTotal };
}

// ── Day Book (section 3.1) ────────────────────────────────────────────────
// Rows for one day, in time order, with a running balance that only cash rows advance. The opening
// balance calls the SAME available-balance formula with a cutoff, so the two can never disagree.
// The cash book for a run of days (the Statement), with the Day Book's rows and columns. Each row carries its
// day; rows run oldest first, then by time. No `from` means from the very first entry.
export function cashBook(books, from, to) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const opening = from ? balances(books, { before: from }).total : 0;
  const rows = [];
  for (const t of books.transactions) {
    if (!inRange(billDate(t)) || isJournal(t)) continue;
    const who = t.party_name || partyName(books, t.customer_id) || "";
    if (t.type === "expense") rows.push({ key: `t${t.id}`, at: t.created_at, kind: "expense", label: `Expense${who ? `: ${who}` : ""}`, note: t.note, invoice: t.bill_no, out: t.amount, table: "tx", data: t });
    else if (isSettledOnTheSpot(t)) rows.push({ key: `t${t.id}`, at: t.created_at, kind: t.type, label: `${t.type === "sale" ? "Sale" : "Purchase"}${who ? `: ${who}` : ""} (no party)`, note: t.note, invoice: t.bill_no, bill: t.amount, discount: t.discount_amount, invoiceAmt: t.amount + (t.discount_amount || 0) - (t.vat_amount || 0), [t.type === "sale" ? "in" : "out"]: t.amount, table: "tx", data: t });
    else rows.push({ key: `t${t.id}`, at: t.created_at, kind: t.type, label: `${t.type === "sale" ? "Sale" : "Purchase"}: ${who || "—"}`, note: t.note, invoice: t.bill_no, bill: t.amount, discount: t.discount_amount, invoiceAmt: t.amount + (t.discount_amount || 0) - (t.vat_amount || 0), table: "tx", data: t });
  }
  for (const e of books.customer_ledger) {
    if (!inRange(entryDate(e)) || isJournal(e)) continue;
    const isIn = e.entry_type === "credit";
    if (!isIn && e.source !== "manual") continue; // a booking debit IS the sale bill row
    rows.push({ key: `c${e.id}`, at: e.created_at, kind: isIn ? "received" : "paid", label: isIn ? `Received from ${partyName(books, e.customer_id, "Customer")}` : `Paid to ${partyName(books, e.customer_id, "Customer")}`, note: e.note, invoice: e.receipt_no, [isIn ? "in" : "out"]: e.amount, table: "cl", data: e });
  }
  for (const e of books.vendor_ledger) {
    if (!inRange(entryDate(e)) || e.entry_type !== "credit" || isJournal(e)) continue; // debits are the Purchase itself
    rows.push({ key: `v${e.id}`, at: e.created_at, kind: "paid", label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, note: e.note, invoice: e.receipt_no, out: e.amount, table: "vl", data: e });
  }
  for (const t of books.transfers) {
    if (!inRange(transferDate(t))) continue;
    rows.push({ key: `x${t.id}`, at: t.created_at, kind: "transfer", label: `${accountName(books, t.from_account_id)} → ${accountName(books, t.to_account_id)}`, note: t.note, transferAmount: t.amount, table: "tr", data: t });
  }
  for (const v of journalVouchers(books)) {
    if (!inRange(v.date)) continue;
    rows.push({ key: `j${v.code}`, at: v.at, kind: "journal", label: `Journal voucher ${v.code}`, note: voucherSummary(v), transferAmount: v.total, table: "jv", data: v });
  }
  for (const r of rows) r.date = r.table === "tx" ? billDate(r.data) : r.table === "tr" ? transferDate(r.data) : r.table === "jv" ? r.data.date : entryDate(r.data);
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || "") < (b.at || "") ? -1 : (a.at || "") > (b.at || "") ? 1 : 0));
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

// A paper cash book for one day.
export const dayBook = (books, date) => cashBook(books, date, date);

// ── the interleaved feed under the entry forms ────────────────────────────
export function feedRows(books) {
  const rows = [];
  for (const t of books.transactions) {
    if (isJournal(t)) continue;
    const who = t.party_name || partyName(books, t.customer_id) || "—";
    rows.push({ key: `t${t.id}`, date: billDate(t), at: t.created_at, kind: t.type, label: `${t.type[0].toUpperCase()}${t.type.slice(1)}: ${who}`, amount: t.amount, number: t.bill_no, table: "tx", data: t });
  }
  for (const e of books.customer_ledger) {
    if ((e.entry_type === "debit" && e.source !== "manual") || isJournal(e)) continue;
    const isIn = e.entry_type === "credit";
    rows.push({ key: `c${e.id}`, date: entryDate(e), at: e.created_at, kind: isIn ? "received" : "paid", label: `${isIn ? "Received from" : "Refunded to"} ${partyName(books, e.customer_id, "Customer")}`, amount: e.amount, number: e.receipt_no, table: "cl", data: e });
  }
  for (const e of books.vendor_ledger) {
    if (e.entry_type !== "credit" || isJournal(e)) continue;
    rows.push({ key: `v${e.id}`, date: entryDate(e), at: e.created_at, kind: "paid", label: `Paid to ${partyName(books, e.vendor_id, "Vendor")}`, amount: e.amount, number: e.receipt_no, table: "vl", data: e });
  }
  for (const t of books.transfers) {
    rows.push({ key: `x${t.id}`, date: transferDate(t), at: t.created_at, kind: "transfer", label: `${accountName(books, t.from_account_id)} → ${accountName(books, t.to_account_id)}`, amount: t.amount, table: "tr", data: t });
  }
  for (const v of journalVouchers(books)) {
    rows.push({ key: `j${v.code}`, date: v.date, at: v.at, kind: "journal", label: `Journal voucher ${v.code}`, amount: v.total, number: null, table: "jv", data: v });
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
  journal: { label: "Journal", color: COLORS.journal },
};
