import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Stat, Empty, ExportBar, exportXlsx, inputCls, btnPrimary } from "./ui";
import { dayBook, todayStr, addDays, npr, num, COLORS, KIND_STYLE } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

const NEW_ENTRY = [["received", "Received"], ["paid", "Payment Out"], ["sales", "Sale"], ["purchases", "Purchase"], ["expenses", "Expense"]];

// A paper cash book for one day: opening balance, the day's rows in time order, closing balance
// with the arithmetic spelled out. Only cash rows advance the running balance; bills and transfers
// leave it blank. Tap any row to open it.
export default function DayBook({ date, setDate, goTab, businessName }) {
  const { books } = useBooks();
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  const today = todayStr();
  const day = useMemo(() => dayBook(books, date), [books, date]);

  const cols = [
    { header: "Time", value: (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "") },
    { header: "Details", value: (r) => r.label },
    { header: "Type", value: (r) => KIND_STYLE[r.kind]?.label || "" },
    { header: "Invoice", value: (r) => r.invoice || "" },
    { header: "Bill amount", value: (r) => r.bill ?? "" },
    { header: "Cash in", value: (r) => r.in ?? "" },
    { header: "Cash out", value: (r) => r.out ?? "" },
    { header: "Balance", value: (r) => r.balance ?? "" },
  ];

  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{businessName || "Day Book"}</h2>
          <p className="text-sm text-slate-600">Day Book · {date}</p>
          <p className="text-xs text-slate-400">{formatBSDate(date)} BS</p>
        </div>
        <div className="fin-no-print flex flex-wrap items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} className="h-10 w-10 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center justify-center" aria-label="Previous day"><ChevronLeft size={18} /></button>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className={`${inputCls} w-40`} />
          <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} className="h-10 w-10 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center" aria-label="Next day"><ChevronRight size={18} /></button>
          {date !== today && <button onClick={() => setDate(today)} className="h-10 px-3 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100">Today</button>}
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className={btnPrimary}><Plus size={16} /> New entry</button>
            {menu && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                {NEW_ENTRY.map(([k, l]) => <button key={k} onClick={() => { setMenu(false); goTab(k); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50">{l}</button>)}
              </div>
            )}
          </div>
          <ExportBar onXlsx={() => exportXlsx(`daybook-${date}`, cols, day.rows)} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Opening" value={day.opening} />
        <Stat label="Cash in" value={day.cashIn} color={COLORS.in} />
        <Stat label="Cash out" value={day.cashOut} color={COLORS.out} />
        <Stat label="Closing" value={day.closing} color={day.closing < 0 ? COLORS.out : COLORS.balance} />
        {day.salesBilled > 0 && <Stat label="Sales billed" value={day.salesBilled} color={COLORS.sale} />}
        {day.purchasesBilled > 0 && <Stat label="Purchases billed" value={day.purchasesBilled} color={COLORS.purchase} />}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 text-left">
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Transaction details</th>
                <th className="px-3 py-2 font-semibold hidden xl:table-cell">Type</th>
                <th className="px-3 py-2 font-semibold hidden xl:table-cell">Invoice</th>
                <th className="px-3 py-2 font-semibold text-right hidden xl:table-cell">Discount</th>
                <th className="px-3 py-2 font-semibold text-right">Bill amount</th>
                <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Cash in</th>
                <th className="px-3 py-2 font-semibold text-right hidden md:table-cell">Cash out</th>
                <th className="px-3 py-2 font-semibold text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50/60 text-slate-400 italic"><td className="px-3 py-2" /><td className="px-3 py-2" colSpan={8}>Opening balance · {npr(day.opening)}</td></tr>
              {day.rows.length === 0 && <tr><td colSpan={9}><Empty>No entries on this day.</Empty></td></tr>}
              {day.rows.map((r) => {
                const k = KIND_STYLE[r.kind];
                const amount = r.transferAmount ?? r.bill ?? r.in ?? r.out;
                return (
                  <tr key={r.key} onClick={() => setEditing(r)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-top">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{time(r)}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-900">{r.label}</div>
                      {r.note && <div className="text-xs text-slate-400">{r.note}</div>}
                      <div className="xl:hidden text-xs mt-0.5"><span style={{ color: k.color }} className="font-semibold">{k.label}</span>{r.invoice ? <span className="text-slate-400"> · #{r.invoice}</span> : null}</div>
                    </td>
                    <td className="px-3 py-2 hidden xl:table-cell"><span className="text-xs font-bold" style={{ color: k.color }}>{k.label}</span></td>
                    <td className="px-3 py-2 text-slate-500 hidden xl:table-cell">{r.invoiceAmt != null ? num(r.invoiceAmt) : r.invoice || ""}</td>
                    <td className="px-3 py-2 text-right text-slate-500 hidden xl:table-cell">{r.discount ? num(r.discount) : ""}</td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: r.bill != null ? k.color : r.transferAmount != null ? COLORS.transfer : undefined }}>
                      {r.bill != null ? num(r.bill) : r.transferAmount != null ? num(r.transferAmount) : <span className="md:hidden" style={{ color: r.in ? COLORS.in : COLORS.out }}>{num(amount)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right hidden md:table-cell" style={{ color: COLORS.in }}>{r.in ? num(r.in) : ""}</td>
                    <td className="px-3 py-2 text-right hidden md:table-cell" style={{ color: COLORS.out }}>{r.out ? num(r.out) : ""}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: r.balance < 0 ? COLORS.out : COLORS.balance }}>{r.balance != null ? num(r.balance) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-sm flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-600">Opening {num(day.opening)} + In {num(day.cashIn)} − Out {num(day.cashOut)}</span>
          <span className="font-bold" style={{ color: day.closing < 0 ? COLORS.out : COLORS.balance }}>Closing balance {npr(day.closing)}</span>
        </div>
      </Card>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
