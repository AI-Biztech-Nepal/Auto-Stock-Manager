import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Stat, Empty, ExportBar, exportXlsx } from "./ui";
import { balances, tradingAccount, cashMovements, receivedPaid, owedTotals, npr, num, COLORS } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange, formatBSDate } from "../../utils/nepali-date";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];
const BRAND_DARK = "#1E3A8A";
const BRAND_TINT = "#EFF6FF";

// ── pieces of a Tally-style account: two sides that total the same ────────
const SideHead = ({ title }) => (
  <div className="mb-1 flex justify-between border-b-2 pb-2" style={{ borderColor: BRAND_DARK }}>
    <span className="text-[13px] font-bold" style={{ color: BRAND_DARK }}>{title}</span>
    <span className="text-[11px] font-semibold text-slate-500">NPR</span>
  </div>
);

function Line({ label, amount, tone, bold, muted, onOpen }) {
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag onClick={onOpen} className={`w-full flex justify-between border-b border-slate-100 py-2.5 text-[14px] text-left ${onOpen ? "hover:bg-slate-50" : ""} ${tone ? "rounded-md px-2" : ""}`} style={tone ? { backgroundColor: BRAND_TINT } : undefined}>
      <span className={bold ? "font-bold" : ""} style={{ color: muted ? "#94A3B8" : "#0F172A" }}>{label}</span>
      <span className={bold ? "font-bold" : "font-semibold"} style={{ color: tone ? BRAND_DARK : muted ? "#94A3B8" : "#0F172A" }}>{num(amount)}</span>
    </Tag>
  );
}

const TotalLine = ({ amount }) => (
  <div className="my-1 flex justify-between border-y-2 py-2.5 text-[15px] font-bold" style={{ borderColor: BRAND_DARK, color: BRAND_DARK }}>
    <span>Total</span><span>{num(amount)}</span>
  </div>
);

function Group({ id, open, onToggle, label, amount, rows, onOpen }) {
  const isOpen = open.has(id);
  return (
    <div>
      <div className="flex items-center">
        {rows.length > 0 && <button onClick={() => onToggle(id)} className="pr-2 py-2.5 text-[14px] font-bold text-slate-900" aria-label={isOpen ? "Collapse" : "Expand"}>{isOpen ? "▾" : "▸"}</button>}
        <button onClick={onOpen} disabled={!onOpen} className="flex-1 flex justify-between py-2.5 text-[14px] font-bold text-slate-900 hover:bg-slate-50 disabled:hover:bg-transparent">
          <span>{label}</span><span>{num(amount)}</span>
        </button>
      </div>
      {isOpen && rows.map(([k, v]) => (
        <button key={k} onClick={onOpen} disabled={!onOpen} className="w-full flex justify-between border-b border-slate-50 py-1.5 pl-5 text-[13px] text-slate-600 hover:bg-slate-50 disabled:hover:bg-transparent">
          <span className="text-left">{k}</span><span>{num(v)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Profit & loss in Tally style, straight off the bills (billed, not collected) ──
export function Report({ goTab }) {
  const { books } = useBooks();
  const [period, setPeriod] = useState("month");
  const [open, setOpen] = useState(() => new Set(["sales", "dincome", "purchase", "direct", "indirect"]));
  const toggle = (k) => setOpen((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : null;
  const pl = useMemo(() => tradingAccount(books, range?.start, range?.end), [books, range?.start, range?.end]);
  const cash = useMemo(() => receivedPaid(books, range?.start, range?.end), [books, range?.start, range?.end]);
  const bal = useMemo(() => balances(books), [books]);
  const go = goTab ? (tab) => () => goTab(tab) : () => undefined;

  const gross = pl.gross, net = pl.net;
  // each side of the trading account totals the same; likewise the second part
  const tradingTotal = pl.income + (gross < 0 ? -gross : 0);
  const secondTotal = pl.indirectTotal + (gross < 0 ? -gross : 0) + (net >= 0 ? net : 0);
  const owed = useMemo(() => owedTotals(books), [books]);
  const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

  const rows = [
    ["Purchase accounts", pl.purchase],
    ["Direct expenses", pl.directTotal], ...pl.direct.map(([k, v]) => [`    ${k}`, v]),
    [gross >= 0 ? "Gross profit c/o" : "Gross loss c/o", Math.abs(gross)],
    ["Sales accounts", pl.items],
    ["Direct incomes (services sold)", pl.services],
    ["Indirect expenses", pl.indirectTotal], ...pl.indirect.map(([k, v]) => [`    ${k}`, v]),
    [net >= 0 ? "Net profit" : "Net loss", Math.abs(net)],
    ["Total received", cash.received],
    ["Total paid", cash.paid],
  ];
  const cols = [{ header: "Account", value: (r) => r[0] }, { header: "Amount (NPR)", value: (r) => r[1] }];
  const periodText = range ? `${formatBSDate(range.start)} to ${formatBSDate(range.end)} BS` : "All time";

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <ExportBar onXlsx={() => exportXlsx(`profit-and-loss-${period}`, cols, rows)} />
      </div>

      {/* the report heading: one brand-blue band with the period and the key figures */}
      <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: BRAND_DARK }}>
        <div className="p-5 space-y-1">
          <div className="text-[11.5px] font-bold tracking-[0.14em]" style={{ color: "#BFDBFE" }}>FINANCE REPORT</div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">PROFIT &amp; LOSS ACCOUNT</h2>
          <div className="text-[13px]" style={{ color: "#DBEAFE" }}>{periodText}{range ? ` · ${range.start} to ${range.end}` : ""}</div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 border-t" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
          {/* a card for each of the Report's own pages (the ones under Report in the side panel): the period's
              sales, purchases and expenses, and what is owed today */}
          {[
            { label: "Sales Report", value: pl.income, sub: plural(pl.bills.sale, "sale bill"), tab: "sales-report" },
            { label: "Purchase Report", value: pl.purchase, sub: plural(pl.bills.purchase, "purchase bill"), tab: "purchase-report" },
            { label: "Expenses Report", value: pl.directTotal + pl.indirectTotal, sub: plural(pl.bills.expense, "expense bill"), tab: "expense-report" },
            { label: "Receivable Report", value: owed.totalReceivable, sub: plural(owed.owingMe.length, "party", "parties"), tab: "receivable-report" },
            { label: "Payable Report", value: owed.totalPayable, sub: plural(owed.iOwe.length, "party", "parties"), tab: "payable-report" },
          ].map((k) => (
            <button key={k.label} onClick={go(k.tab)} className="text-left px-5 py-4 border-l border-t lg:border-t-0 hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
              <div className="text-[11.5px] font-semibold" style={{ color: "#BFDBFE" }}>{k.label}</div>
              <div className="mt-0.5 text-[19px] font-bold text-white">NPR {num(k.value)}</div>
              <div className="text-[11px]" style={{ color: "#93C5FD" }}>{k.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* the account: expenses and cost on the left, income on the right */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="p-5 border-b md:border-b-0 md:border-r border-slate-200">
            <SideHead title="Particulars" />
            <Group id="purchase" open={open} onToggle={toggle} label="Purchase accounts" amount={pl.purchase} rows={[["Purchase bills (items)", pl.purchase]]} onOpen={go("purchases")} />
            <Group id="direct" open={open} onToggle={toggle} label="Direct expenses" amount={pl.directTotal} rows={pl.direct} onOpen={go("expenses")} />
            {gross >= 0 && <Line label="Gross profit c/o" amount={gross} tone bold />}
            <TotalLine amount={tradingTotal} />
            {gross < 0 && <Line label="Gross loss b/f" amount={-gross} tone bold />}
            <Group id="indirect" open={open} onToggle={toggle} label="Indirect expenses" amount={pl.indirectTotal} rows={pl.indirect} onOpen={go("expenses")} />
            {net >= 0 && <Line label="Net profit" amount={net} tone bold />}
            <TotalLine amount={secondTotal} />
          </div>
          <div className="p-5">
            <SideHead title="Particulars" />
            <Group id="sales" open={open} onToggle={toggle} label="Sales accounts" amount={pl.items} rows={[["Sales - items", pl.items]]} onOpen={go("sales")} />
            <Group id="dincome" open={open} onToggle={toggle} label="Direct incomes" amount={pl.services} rows={[["Services sold (labour, repair, installation)", pl.services]]} onOpen={go("sales")} />
            {gross < 0 && <Line label="Gross loss c/o" amount={-gross} tone bold />}
            <TotalLine amount={tradingTotal} />
            {gross >= 0 && <Line label="Gross profit b/f" amount={gross} tone bold />}
            <Line label="Indirect incomes" amount={0} muted />
            {net < 0 && <Line label="Net loss" amount={-net} tone bold />}
            <TotalLine amount={secondTotal} />
          </div>
        </div>
        <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          Both sides total the same, as in Tally. Bills dated in the period count whether paid or not. Services sold are direct income; services bought in are a direct expense. An expense head is direct unless it is marked Indirect under Expenses → Categories.
        </p>
      </Card>

      {/* Total received and total paid: what really moved in the period */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="p-5 border-b md:border-b-0 md:border-r border-slate-200">
            <SideHead title="Total received" />
            <Line label="Payments from customers" amount={cash.by.customers} onOpen={go("totals")} />
            <Line label="Walk-in sales paid on the spot" amount={cash.by.walkIn} onOpen={go("totals")} />
            <TotalLine amount={cash.received} />
          </div>
          <div className="p-5">
            <SideHead title="Total paid" />
            <Line label="Expenses" amount={cash.by.expense} onOpen={go("totals")} />
            <Line label="Payments to vendors" amount={cash.by.toVendors} onOpen={go("totals")} />
            <Line label="Payments to customers and walk-in purchases" amount={cash.by.toCustomers + cash.by.walkInBought} onOpen={go("totals")} />
            <TotalLine amount={cash.paid} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-[13px] font-bold" style={{ backgroundColor: BRAND_TINT, color: BRAND_DARK }}>
          <span>Net cash movement (received − paid)</span><span>{num(cash.received - cash.paid)}</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available balance right now</div>
        <div className="text-2xl font-bold mt-1" style={{ color: bal.total < 0 ? COLORS.out : COLORS.balance, fontFamily: "Manrope" }}>{npr(bal.total)}</div>
        <p className="text-xs text-slate-400 mt-1">Profit is billed, not collected. Sales and purchases are debts until payments are recorded, so profit and balance differ. The difference is what is still to receive or give.</p>
      </Card>
    </div>
  );
}

// ── Totals: money received / paid, charted and listed ─────────────────────
export function Totals() {
  const { books } = useBooks();
  const [by, setBy] = useState("month");
  const [editing, setEditing] = useState(null);
  const year = getCurrentBSYearRange();
  const all = useMemo(() => cashMovements(books), [books]);
  const rp = useMemo(() => receivedPaid(books, year?.start, year?.end), [books, year?.start, year?.end]);

  const chart = useMemo(() => {
    const m = {};
    for (const x of all) {
      let key = x.date.slice(0, 7);
      if (by === "week") {
        const [y, mo, d] = x.date.split("-").map(Number);
        const dt = new Date(y, mo - 1, d);
        dt.setDate(dt.getDate() - dt.getDay());
        key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      }
      (m[key] ||= { label: key, in: 0, out: 0 })[x.dir] += x.amount;
    }
    return Object.values(m).sort((a, b) => (a.label < b.label ? -1 : 1)).slice(-12);
  }, [all, by]);

  const open = (m) => {
    const data = m.table === "tx" ? books.transactions.find((t) => t.id === m.id) : m.table === "cl" ? books.customer_ledger.find((e) => e.id === m.id) : books.vendor_ledger.find((e) => e.id === m.id);
    if (data) setEditing({ table: m.table, data });
  };
  const cols = [{ header: "Date", value: (m) => m.date }, { header: "Direction", value: (m) => (m.dir === "in" ? "Received" : "Paid") }, { header: "Details", value: (m) => m.label }, { header: "Amount", value: (m) => m.amount }];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total received (this year)" value={rp.received} color={COLORS.in} />
        <Stat label="Total paid (this year)" value={rp.paid} color={COLORS.out} />
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Money in and out</h3>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">{[["week", "By week"], ["month", "By month"]].map(([k, l]) => <button key={k} onClick={() => setBy(k)} className={`h-7 px-3 rounded-md text-xs font-semibold ${by === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}</div>
        </div>
        {chart.length === 0 ? <Empty>No money has moved yet.</Empty> : (
          <div className="h-64"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} /><Tooltip formatter={(v) => npr(v)} /><Legend />
              <Bar dataKey="in" name="Received" fill={COLORS.in} radius={[4, 4, 0, 0]} /><Bar dataKey="out" name="Paid" fill={COLORS.out} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div>
        )}
      </Card>
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">Every movement</span><ExportBar onXlsx={() => exportXlsx("totals", cols, all)} /></div>
        {all.length === 0 ? <Empty>Nothing yet.</Empty> : all.slice(0, 200).map((m) => (
          <button key={`${m.table}${m.id}`} onClick={() => open(m)} className="w-full text-left px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50 flex items-center gap-3">
            <span className="text-xs text-slate-400 w-24 shrink-0">{m.date}</span>
            <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{m.label}</span>
            <span className="text-sm font-semibold" style={{ color: m.dir === "in" ? COLORS.in : COLORS.out }}>{m.dir === "in" ? "+" : "−"}{npr(m.amount).replace("NPR ", "")}</span>
          </button>
        ))}
      </Card>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── Total Received / Total Paid: the money that actually moved, one direction a page ──
// As Finance Nepal's pages opened from the Ledger's cards: what came in (or went out) in the period, with
// cards for the total, this month, the number of entries and the largest one, and one row per payment
// naming the party, its ledger type and its receipt / payment / bill no. Tap a row to open it.
const SRC_PILL = {
  walkIn: { label: "Sale", in: true }, customers: { label: "Received", in: true },
  expense: { label: "Expenses" }, toVendors: { label: "Paid" }, toCustomers: { label: "Paid" }, walkInBought: { label: "Purchase" },
};
const MOVED_PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];

export function MoneyMoved({ dir, openParty }) {
  const { books } = useBooks();
  const [period, setPeriod] = useState("month");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const incoming = dir === "in";
  const color = incoming ? COLORS.in : COLORS.out;
  const title = incoming ? "Total Received" : "Total Paid";
  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : null;
  const month = getCurrentBSMonthRange();
  const typeName = useMemo(() => {
    const names = new Map(books.party_types.map((t) => [t.id, t.name]));
    return (partyId) => {
      const p = partyId && books.parties.find((x) => x.id === partyId);
      return p ? names.get(p.party_type_id) || null : null;
    };
  }, [books.parties, books.party_types]);

  const all = useMemo(() => cashMovements(books).filter((m) => m.dir === dir), [books, dir]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((m) => (!range || (m.date >= range.start && m.date <= range.end)) && (!s || m.label.toLowerCase().includes(s) || String(m.ref || "").toLowerCase().includes(s)));
  }, [all, range?.start, range?.end, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => ({
    total: shown.reduce((s, m) => s + m.amount, 0),
    thisMonth: all.filter((m) => month && m.date >= month.start && m.date <= month.end).reduce((s, m) => s + m.amount, 0),
    largest: shown.reduce((s, m) => Math.max(s, m.amount), 0),
  }), [shown, all, month?.start, month?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (m) => {
    const data = m.table === "tx" ? books.transactions.find((t) => t.id === m.id) : m.table === "cl" ? books.customer_ledger.find((e) => e.id === m.id) : books.vendor_ledger.find((e) => e.id === m.id);
    if (data) setEditing({ table: m.table, data });
  };
  const cols = [
    { header: "SN", value: (m) => shown.indexOf(m) + 1 },
    { header: "Date", value: (m) => m.date },
    { header: "Details", value: (m) => m.label },
    { header: "No.", value: (m) => m.ref || "" },
    { header: "Type", value: (m) => SRC_PILL[m.src]?.label || "" },
    { header: "Ledger type", value: (m) => typeName(m.party) || "" },
    { header: "Amount", value: (m) => m.amount },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{incoming ? "Money actually collected, newest first" : "Money that actually left the business, newest first"}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={range ? `Total (${MOVED_PERIODS.find(([k]) => k === period)[1].toLowerCase()})` : "Total"} value={stats.total} color={color} />
        <Stat label="This month" value={stats.thisMonth} color={color} />
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entries</div><div className="text-xl font-bold mt-1 text-slate-900" style={{ fontFamily: "Manrope" }}>{shown.length}</div></Card>
        <Stat label="Largest" value={stats.largest} />
      </div>
      <div className="fin-no-print flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {MOVED_PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number" className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <ExportBar onXlsx={() => exportXlsx(incoming ? "total-received" : "total-paid", cols, shown)} />
      </div>
      {range && <p className="text-xs text-slate-500">{formatBSDate(range.start)} to {formatBSDate(range.end)} BS</p>}
      <Card className="overflow-x-auto">
        {shown.length === 0 ? <Empty>{incoming ? "Nothing received in this period." : "Nothing paid in this period."}</Empty> : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5 w-12">SN</th>
                <th className="px-3 py-2.5 hidden sm:table-cell">Date</th>
                <th className="px-3 py-2.5">Details</th>
                <th className="px-3 py-2.5 hidden md:table-cell">Ledger type</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => {
                const pill = SRC_PILL[m.src];
                return (
                  <tr key={`${m.table}${m.id}`} onClick={() => open(m)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-slate-600 whitespace-nowrap">{formatBSDate(m.date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">
                        {m.party && openParty ? <button onClick={(e) => { e.stopPropagation(); openParty(m.party); }} className="hover:underline text-left">{m.label}</button> : m.label}
                      </div>
                      <div className="text-xs text-slate-400">
                        <span className="font-semibold" style={{ color: pill?.in ? COLORS.in : COLORS.out }}>{pill?.label}</span>
                        {m.ref ? ` · No. ${m.ref}` : ""}<span className="sm:hidden"> · {formatBSDate(m.date)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell font-semibold text-slate-700">{typeName(m.party) || <span className="text-slate-300 font-normal">—</span>}</td>
                    <td className="px-3 py-2.5 text-right font-bold" style={{ color }}>{num(m.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="px-3 py-2.5" colSpan={2}>Total</td>
                <td className="px-3 py-2.5 hidden sm:table-cell" />
                <td className="px-3 py-2.5 hidden md:table-cell" />
                <td className="px-3 py-2.5 text-right" style={{ color }}>{num(stats.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
