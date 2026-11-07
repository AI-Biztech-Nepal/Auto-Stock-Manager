import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import NewEntryMenu from "./NewEntryMenu";
import { Card, Stat, Empty, ExportBar, exportXlsx, inputCls, btnGhost } from "./ui";
import { cashBook, todayStr, npr, num, COLORS, KIND_STYLE } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange, formatBSDate } from "../../utils/nepali-date";

const PERIODS = [["month", "This month"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]];
const KINDS = [["", "All types"], ["sale", "Sales"], ["purchase", "Purchases"], ["expense", "Expenses"], ["received", "Received"], ["paid", "Paid"], ["transfer", "Transfers"], ["journal", "Journal vouchers"]];

// The Statement: the Day Book's own table over a run of days, as Finance Nepal shows it - every bill,
// payment, transfer and journal voucher with its date, the cash ones moving a running balance from the
// opening balance of the first day. New entries start from here, and a bank statement is imported from
// its button. Tap a row to open or change it.
export default function Statement({ goTab }) {
  const { books } = useBooks();
  const today = todayStr();
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState(() => getCurrentBSMonthRange()?.start || today);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState(null);

  const range = period === "month" ? getCurrentBSMonthRange() : period === "year" ? getCurrentBSYearRange() : period === "custom" ? { start: from, end: to } : null;
  const book = useMemo(() => cashBook(books, range?.start, range?.end), [books, range?.start, range?.end]);
  const rows = useMemo(() => (kind ? book.rows.filter((r) => r.kind === kind) : book.rows), [book.rows, kind]);

  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const cols = [
    { header: "Date", value: (r) => r.date },
    { header: "Time", value: time },
    { header: "Details", value: (r) => r.label },
    { header: "Type", value: (r) => KIND_STYLE[r.kind]?.label || "" },
    { header: "Invoice", value: (r) => r.invoice || "" },
    { header: "Bill amount", value: (r) => r.bill ?? r.transferAmount ?? "" },
    { header: "Cash in", value: (r) => r.in ?? "" },
    { header: "Cash out", value: (r) => r.out ?? "" },
    { header: "Balance", value: (r) => r.balance ?? "" },
  ];

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 bg-gray-100 rounded-lg p-1">
          {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${period === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => goTab("import")} className={btnGhost} data-testid="statement-import"><FileSpreadsheet size={16} /> Import</button>
          <NewEntryMenu goTab={goTab} />
          <ExportBar onXlsx={() => exportXlsx(`statement-${range?.start || "all"}-${range?.end || today}`, cols, rows)} />
        </div>
      </div>
      <div className="fin-no-print flex flex-wrap items-center gap-2">
        {period === "custom" && (
          <>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputCls} !w-40`} aria-label="From" />
            <span className="text-sm text-slate-500">to</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputCls} !w-40`} aria-label="To" />
          </>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputCls} !w-48`} aria-label="Type">
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="text-xs text-slate-500">{range ? `${formatBSDate(range.start)} to ${formatBSDate(range.end)} BS` : "Every entry"} · {rows.length} {rows.length === 1 ? "entry" : "entries"}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Opening" value={book.opening} />
        <Stat label="Cash in" value={book.cashIn} color={COLORS.in} />
        <Stat label="Cash out" value={book.cashOut} color={COLORS.out} />
        <Stat label="Closing" value={book.closing} color={book.closing < 0 ? COLORS.out : COLORS.balance} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 text-left">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Transaction details</th>
                <th className="px-3 py-2 font-semibold hidden xl:table-cell">Type</th>
                <th className="px-3 py-2 font-semibold hidden xl:table-cell">Invoice</th>
                <th className="px-3 py-2 font-semibold text-right">Bill amount</th>
                <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Cash in</th>
                <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Cash out</th>
                <th className="px-3 py-2 font-semibold text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {!kind && <tr className="bg-slate-50/60 text-slate-400 italic"><td className="px-3 py-2" /><td className="px-3 py-2" colSpan={7}>Opening balance · {npr(book.opening)}</td></tr>}
              {rows.length === 0 && <tr><td colSpan={8}><Empty>No entries in this period.</Empty></td></tr>}
              {rows.map((r) => {
                const k = KIND_STYLE[r.kind];
                const amount = r.transferAmount ?? r.bill ?? r.in ?? r.out;
                return (
                  <tr key={r.key} onClick={() => setEditing(r)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-top">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatBSDate(r.date)}<div className="text-xs text-slate-400">{time(r)}</div></td>
                    <td className="px-3 py-2">
                      <div className="text-slate-900">{r.label}</div>
                      {r.note && <div className="text-xs text-slate-400">{r.note}</div>}
                      <div className="xl:hidden text-xs mt-0.5"><span style={{ color: k.color }} className="font-semibold">{k.label}</span>{r.invoice ? <span className="text-slate-400"> · #{r.invoice}</span> : null}</div>
                    </td>
                    <td className="px-3 py-2 hidden xl:table-cell"><span className="text-xs font-bold" style={{ color: k.color }}>{k.label}</span></td>
                    <td className="px-3 py-2 text-slate-500 hidden xl:table-cell">{r.invoice || ""}</td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: r.bill != null ? k.color : r.transferAmount != null ? (r.kind === "journal" ? COLORS.journal : COLORS.transfer) : undefined }}>
                      {r.bill != null ? num(r.bill) : r.transferAmount != null ? num(r.transferAmount) : <span className="md:hidden" style={{ color: r.in ? COLORS.in : COLORS.out }}>{num(amount)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right hidden md:table-cell" style={{ color: COLORS.in }}>{r.in ? num(r.in) : ""}</td>
                    <td className="px-3 py-2 text-right hidden md:table-cell" style={{ color: COLORS.out }}>{r.out ? num(r.out) : ""}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: r.balance < 0 ? COLORS.out : COLORS.balance }}>{!kind && r.balance != null ? num(r.balance) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-600">Opening {num(book.opening)} + In {num(book.cashIn)} − Out {num(book.cashOut)}</span>
          <span className="font-bold" style={{ color: book.closing < 0 ? COLORS.out : COLORS.balance }}>Closing balance {npr(book.closing)}</span>
        </div>
      </Card>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
