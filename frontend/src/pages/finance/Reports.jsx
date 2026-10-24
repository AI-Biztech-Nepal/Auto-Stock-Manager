import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Stat, Empty, ExportBar, exportXlsx } from "./ui";
import { balances, profitLoss, cashMovements, receivedPaid, npr, COLORS } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange, formatBSDate } from "../../utils/nepali-date";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"]];

// ── Profit & loss, straight off the bills (billed, not collected) ─────────
export function Report() {
  const { books } = useBooks();
  const [period, setPeriod] = useState("month");
  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : null;
  const pl = useMemo(() => profitLoss(books, range?.start, range?.end), [books, range?.start, range?.end]);
  const bal = useMemo(() => balances(books), [books]);
  const margin = pl.sale > 0 ? Math.round((pl.net / pl.sale) * 100) : null;

  const rows = [["Sales", pl.sale, COLORS.sale], ["Purchases", pl.purchase, COLORS.purchase], ["Gross profit (sales − purchases)", pl.gross, pl.gross < 0 ? COLORS.out : COLORS.in], ["Expenses", pl.expense, COLORS.out], ["Net profit", pl.net, pl.net < 0 ? COLORS.out : COLORS.in]];
  const cols = [{ header: "Line", value: (r) => r[0] }, { header: "Amount", value: (r) => r[1] }];

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`h-8 px-3 rounded-md text-sm font-semibold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <ExportBar onXlsx={() => exportXlsx(`report-${period}`, cols, rows)} />
      </div>
      {range && <p className="text-xs text-slate-500">{range.start} to {range.end} · {formatBSDate(range.start)} to {formatBSDate(range.end)} BS</p>}
      <Card>
        {rows.map(([label, amount, color], i) => (
          <div key={label} className={`px-5 py-3.5 flex justify-between items-center ${i ? "border-t border-slate-100" : ""} ${label === "Net profit" ? "bg-slate-50 font-bold" : ""}`}>
            <span className="text-sm text-slate-700">{label}</span>
            <span className="text-base font-semibold" style={{ color, fontFamily: "Manrope" }}>{npr(amount)}</span>
          </div>
        ))}
      </Card>
      {margin !== null && <p className="text-xs text-slate-500">Net margin {margin}% of sales.</p>}
      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available balance right now</div>
        <div className="text-2xl font-bold mt-1" style={{ color: bal.total < 0 ? COLORS.out : COLORS.balance, fontFamily: "Manrope" }}>{npr(bal.total)}</div>
        <p className="text-xs text-slate-400 mt-1">This is billed profit, not collected cash. Sales and purchases are debts until payments are recorded, so profit and balance differ. The difference is what is still to receive or give.</p>
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
