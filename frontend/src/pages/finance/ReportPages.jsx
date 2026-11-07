import { useMemo, useState } from "react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Stat, Empty, Notice, ExportBar, exportXlsx, inputCls } from "./ui";
import { owedTotals, receivableAgeing, AGEING_BUCKETS, billDate, partyName, accountName, npr, num, COLORS } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange, formatBSDate } from "../../utils/nepali-date";

// The family of reports nested under Report in the side panel (the same five FINANCE-NEPAL lists): Sales,
// Purchase and Expenses off the bills for a period, and Receivable / Payable off the two ledgers as they
// stand now. Every report prints and exports to Excel from the same column definitions.
const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];

function PeriodBar({ period, setPeriod, range, onXlsx }) {
  return (
    <>
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <ExportBar onXlsx={onXlsx} />
      </div>
      {range && <p className="text-xs text-slate-500">{range.start} to {range.end} · {formatBSDate(range.start)} to {formatBSDate(range.end)} BS</p>}
    </>
  );
}

function usePeriod() {
  const [period, setPeriod] = useState("month");
  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : null;
  return { period, setPeriod, range };
}

const inRange = (date, range) => !range || (date >= range.start && date <= range.end);

// A report narrowed to one person (opened from their ledger, ?party=): who, and a way back to everyone.
function PartyBanner({ party, what, onShowAll }) {
  if (!party) return null;
  return <Notice tone="blue">Showing {party.name}'s {what} only. <button onClick={onShowAll} className="underline font-semibold">Show everyone's</button></Notice>;
}
const sameName = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

// A table with a totals row. `sum` on a column adds that column up in the footer.
function ReportTable({ columns, rows, onRow, empty, noun = ["entry", "entries"] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs text-slate-500 text-left">
            {columns.map((c) => <th key={c.header} className={`px-3 py-2.5 font-semibold ${c.right ? "text-right" : ""} ${c.hide || ""}`}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}><Empty>{empty}</Empty></td></tr>}
          {rows.map((r) => (
            <tr key={r.key} onClick={onRow ? () => onRow(r) : undefined} className={`border-t border-slate-100 align-top ${onRow ? "hover:bg-slate-50 cursor-pointer" : ""}`}>
              {columns.map((c) => <td key={c.header} className={`px-3 py-2.5 ${c.right ? "text-right" : ""} ${c.hide || ""}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-slate-50 font-semibold text-slate-700 border-t border-slate-200">
              {columns.map((c, i) => (
                <td key={c.header} className={`px-3 py-2.5 ${c.right ? "text-right" : ""} ${c.hide || ""}`}>
                  {i === 0 ? `${rows.length} ${noun[rows.length === 1 ? 0 : 1]} · Total` : c.sum ? num(rows.reduce((s, r) => s + c.sum(r), 0)) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </Card>
  );
}

const DateCell = ({ date }) => <><div className="whitespace-nowrap">{date}</div><div className="text-xs text-slate-400 whitespace-nowrap">{formatBSDate(date)} BS</div></>;
const Dash = () => <span className="text-slate-300">—</span>;
const money = (v, color) => (v ? <span style={{ color }} className="font-medium">{num(v)}</span> : <Dash />);

// ── Sales / Purchase: the bills of one type for a period ─────────────────
function BillsReport({ type, partyId, onShowAll }) {
  const { books } = useBooks();
  const party = partyId ? books.parties.find((p) => p.id === partyId) : null;
  const { period, setPeriod, range } = usePeriod();
  const [editing, setEditing] = useState(null);
  const sale = type === "sale";
  const color = sale ? COLORS.sale : COLORS.purchase;
  const rows = useMemo(() => books.transactions
    .filter((t) => t.type === type && inRange(billDate(t), range) && (!party || t.customer_id === party.id))
    .map((t) => ({ key: t.id, t, date: billDate(t), who: t.party_name || partyName(books, t.customer_id) || "Walk-in" }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.t.created_at || "") > (a.t.created_at || "") ? 1 : -1)),
  [books, type, party, range?.start, range?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = (t) => (t.items || []).map((i) => i.description).filter(Boolean).join(", ");
  const columns = [
    { header: "Date", cell: (r) => <DateCell date={r.date} />, value: (r) => r.date },
    { header: "Bill no.", cell: (r) => r.t.bill_no || <Dash />, value: (r) => r.t.bill_no || "" },
    { header: sale ? "Customer" : "Vendor", cell: (r) => <span className="font-medium text-slate-900">{r.who}</span>, value: (r) => r.who },
    { header: "Items", cell: (r) => <span className="text-slate-600 line-clamp-2">{items(r.t) || <Dash />}</span>, value: (r) => items(r.t), hide: "hidden md:table-cell" },
    { header: "Services", right: true, cell: (r) => money(Number(r.t.installation_charge), color), value: (r) => Number(r.t.installation_charge) || 0, sum: (r) => Number(r.t.installation_charge) || 0, hide: "hidden lg:table-cell" },
    { header: "Discount", right: true, cell: (r) => money(Number(r.t.discount_amount), "#475569"), value: (r) => Number(r.t.discount_amount) || 0, sum: (r) => Number(r.t.discount_amount) || 0, hide: "hidden lg:table-cell" },
    { header: "VAT", right: true, cell: (r) => money(Number(r.t.vat_amount), "#475569"), value: (r) => Number(r.t.vat_amount) || 0, sum: (r) => Number(r.t.vat_amount) || 0, hide: "hidden lg:table-cell" },
    { header: "Amount", right: true, cell: (r) => <span className="font-bold" style={{ color }}>{num(r.t.amount)}</span>, value: (r) => r.t.amount, sum: (r) => r.t.amount },
  ];
  const total = rows.reduce((s, r) => s + r.t.amount, 0);

  return (
    <div className="space-y-4">
      <PeriodBar period={period} setPeriod={setPeriod} range={range}
        onXlsx={() => exportXlsx(`${sale ? "sales" : "purchase"}-report-${period}`, columns.map((c) => ({ header: c.header, value: c.value })), rows)} />
      <PartyBanner party={party} what={sale ? "sales" : "purchases"} onShowAll={onShowAll} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label={sale ? "Sales billed" : "Purchases billed"} value={total} color={color} />
        <Stat label="Bills" value={String(rows.length)} />
      </div>
      <ReportTable columns={columns} rows={rows} onRow={(r) => setEditing({ table: "tx", data: r.t })} empty={`No ${sale ? "sales" : "purchases"} in this period.`} noun={["bill", "bills"]} />
      <p className="text-xs text-slate-400">Billed, not collected: a {type} is a debt until the payment is recorded. Tap a bill to open or change it.</p>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
export const SalesReport = (props) => <BillsReport type="sale" {...props} />;
export const PurchaseReport = (props) => <BillsReport type="purchase" {...props} />;

// ── Expenses: paid on the spot, with what each category came to ──────────
export function ExpenseReport({ partyId, onShowAll }) {
  const { books } = useBooks();
  const party = partyId ? books.parties.find((p) => p.id === partyId) : null;
  const { period, setPeriod, range } = usePeriod();
  const [editing, setEditing] = useState(null);
  const rows = useMemo(() => books.transactions
    .filter((t) => t.type === "expense" && inRange(billDate(t), range) && (!party || sameName(t.party_name, party.name)))
    .map((t) => ({ key: t.id, t, date: billDate(t), who: t.party_name || "—", category: books.categories.find((c) => c.id === t.expense_category_id)?.name || "No category" }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  [books, party, range?.start, range?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const byCategory = useMemo(() => {
    const m = {};
    for (const r of rows) m[r.category] = (m[r.category] || 0) + r.t.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const columns = [
    { header: "Date", cell: (r) => <DateCell date={r.date} />, value: (r) => r.date },
    { header: "Paid to", cell: (r) => <span className="font-medium text-slate-900">{r.who}</span>, value: (r) => r.who },
    { header: "Category", cell: (r) => r.category, value: (r) => r.category },
    { header: "Paid from", cell: (r) => accountName(books, r.t.bank_account_id), value: (r) => accountName(books, r.t.bank_account_id), hide: "hidden md:table-cell" },
    { header: "Note", cell: (r) => <span className="text-slate-500">{r.t.note || ""}</span>, value: (r) => r.t.note || "", hide: "hidden lg:table-cell" },
    { header: "Amount", right: true, cell: (r) => <span className="font-bold" style={{ color: COLORS.out }}>{num(r.t.amount)}</span>, value: (r) => r.t.amount, sum: (r) => r.t.amount },
  ];
  const total = rows.reduce((s, r) => s + r.t.amount, 0);

  return (
    <div className="space-y-4">
      <PeriodBar period={period} setPeriod={setPeriod} range={range}
        onXlsx={() => exportXlsx(`expenses-report-${period}`, columns.map((c) => ({ header: c.header, value: c.value })), rows)} />
      <PartyBanner party={party} what="expenses" onShowAll={onShowAll} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Expenses" value={total} color={COLORS.out} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>
      {byCategory.length > 0 && (
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">By category</div>
          <div className="space-y-1.5">
            {byCategory.map(([name, amount]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate text-slate-700">{name}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${total ? (amount / total) * 100 : 0}%`, background: COLORS.out }} /></div>
                <span className="w-28 text-right font-semibold" style={{ color: COLORS.out }}>{num(amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <ReportTable columns={columns} rows={rows} onRow={(r) => setEditing({ table: "tx", data: r.t })} empty="No expenses in this period." noun={["expense", "expenses"]} />
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── Receivable / Payable: who owes you, who you owe, as the ledgers stand now ─
function OwedReport({ side, openParty }) {
  const { books } = useBooks();
  const [q, setQ] = useState("");
  const receivable = side === "receivable";
  const color = receivable ? COLORS.in : COLORS.out;
  const owed = useMemo(() => owedTotals(books), [books]);
  const all = receivable ? owed.owingMe : owed.iOwe;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter(({ party }) => !needle || party.name.toLowerCase().includes(needle) || (party.phone || "").includes(needle))
      .map(({ party, amount }) => ({ key: party.id, party, amount }));
  }, [all, q]);

  const columns = [
    { header: "Party", cell: (r) => <span className="font-medium text-slate-900">{r.party.name}</span>, value: (r) => r.party.name },
    { header: "Phone", cell: (r) => r.party.phone || <Dash />, value: (r) => r.party.phone || "", hide: "hidden sm:table-cell" },
    { header: "Address", cell: (r) => r.party.address || <Dash />, value: (r) => r.party.address || "", hide: "hidden md:table-cell" },
    { header: receivable ? "To receive" : "To give", right: true, cell: (r) => <span className="font-bold" style={{ color }}>{num(r.amount)}</span>, value: (r) => r.amount, sum: (r) => r.amount },
  ];

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className={`${inputCls} max-w-xs`} />
        <ExportBar onXlsx={() => exportXlsx(`${side}-report`, columns.map((c) => ({ header: c.header, value: c.value })), rows)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label={receivable ? "Total to receive" : "Total to give"} value={receivable ? owed.totalReceivable : owed.totalPayable} color={color} />
        <Stat label={receivable ? "People who owe you" : "People you owe"} value={String(all.length)} />
      </div>
      <ReportTable columns={columns} rows={rows} onRow={(r) => openParty(r.party.id)} empty={q ? "Nobody matches." : receivable ? "Nobody owes you. All settled." : "You owe nobody. All settled."} noun={["person", "people"]} />
      <p className="text-xs text-slate-400">Only parties on the {receivable ? "customer" : "vendor"} side who are in debt count; one party in credit never cancels another's debt. Tap a party to open their ledger.</p>
    </div>
  );
}
export const ReceivableReport = ({ openParty }) => <OwedReport side="receivable" openParty={openParty} />;
export const PayableReport = ({ openParty }) => <OwedReport side="payable" openParty={openParty} />;

// ── Ageing Report: what is owed to you, party by party, and how long it has waited ──
// As Jageer Nepal's: up to 30 days, 31 to 60, more; a party is as old as the last time they were billed.
// Filter by age group, search, export. A line opens that party's ledger.
const AGE_FILTERS = [["all", "All"], ...AGEING_BUCKETS.map((b, i) => [String(i), b.label])];

export function AgeingReport({ openParty }) {
  const { books } = useBooks();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const age = useMemo(() => receivableAgeing(books), [books]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return age.owing
      .filter((r) => filter === "all" || String(r.bucket) === filter)
      .filter((r) => !needle || r.party.name.toLowerCase().includes(needle) || (r.party.phone || "").includes(needle))
      .map((r) => ({ ...r, key: r.party.id }));
  }, [age, q, filter]);

  const pill = (b) => <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: AGEING_BUCKETS[b].color, backgroundColor: AGEING_BUCKETS[b].bg }}>{AGEING_BUCKETS[b].label}</span>;
  const columns = [
    { header: "Party", cell: (r) => <span className="font-medium text-slate-900">{r.party.name}</span>, value: (r) => r.party.name },
    { header: "Phone", cell: (r) => r.party.phone || <Dash />, value: (r) => r.party.phone || "", hide: "hidden md:table-cell" },
    { header: "Last billed", cell: (r) => (r.lastBilledDay ? formatBSDate(r.lastBilledDay) : <Dash />), value: (r) => r.lastBilledDay || "", hide: "hidden sm:table-cell" },
    { header: "Days", right: true, cell: (r) => r.days, value: (r) => r.days },
    { header: "Age", cell: (r) => pill(r.bucket), value: (r) => AGEING_BUCKETS[r.bucket].label, hide: "hidden sm:table-cell" },
    { header: "To receive", right: true, cell: (r) => <span className="font-bold" style={{ color: COLORS.in }}>{num(r.balance)}</span>, value: (r) => r.balance, sum: (r) => r.balance },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total to receive" value={age.receivable} color={COLORS.in} onClick={() => setFilter("all")} />
        {AGEING_BUCKETS.map((b, i) => <Stat key={b.label} label={b.label} value={age.ageing[i]} color={b.color} onClick={() => setFilter(filter === String(i) ? "all" : String(i))} />)}
      </div>
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {AGE_FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${filter === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className={`${inputCls} max-w-xs`} />
          <ExportBar onXlsx={() => exportXlsx("ageing-report", columns.map((c) => ({ header: c.header, value: c.value })), rows)} />
        </div>
      </div>
      <ReportTable columns={columns} rows={rows} onRow={(r) => openParty(r.party.id)} empty={q || filter !== "all" ? "Nobody matches." : "Nobody owes you. All settled."} noun={["party", "parties"]} />
      <p className="text-xs text-slate-400">A balance is as old as the last time that party was billed. Oldest first. Tap a party to open their ledger.</p>
    </div>
  );
}
