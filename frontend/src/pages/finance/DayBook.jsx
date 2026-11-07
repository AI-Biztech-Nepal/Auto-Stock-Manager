import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, ArrowDownCircle, ArrowUpCircle, ShoppingBag, ShoppingCart, Receipt, FileText, ArrowLeftRight } from "lucide-react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Pill, ExportBar, exportXlsx, inputCls, btnPrimary, btnGhost } from "./ui";
import { cashBook, todayStr, addDays, num, npr } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// The Day Book as Jageer Nepal draws it: the New entry buttons and the date stepper up top, then one bordered
// table - SN, Date, Invoice no., Transaction details, Type, Discount, Bill amount, Cash in, Cash out, Balance -
// opening with the opening balance and closing on the closing balance. Only cash rows move the balance; a sale or
// purchase bill shows what was billed. A day by default, or any run of days. Tap a row to open it.

// The Type pill of each row, in Jageer's words and colours.
const KIND = {
  received: { label: "Received", color: "#047857", bg: "#ECFDF5" },
  paid: { label: "Paid", color: "#B91C1C", bg: "#FEF2F2" },
  expense: { label: "Expenses", color: "#B91C1C", bg: "#FEF2F2" },
  sale: { label: "Sale bill", color: "#047857", bg: "#ECFDF5" },
  purchase: { label: "Purchase bill", color: "#B91C1C", bg: "#FEF2F2" },
  transfer: { label: "Contra", color: "#4338CA", bg: "#EEF2FF" },
  journal: { label: "Journal", color: "#B45309", bg: "#FFFBEB" },
};

// Every entry form, one button each, with its own coloured icon.
const NEW_ENTRY = [
  ["received", "Received", ArrowDownCircle, "#059669"],
  ["paid", "Paid", ArrowUpCircle, "#DC2626"],
  ["sales", "Sales", ShoppingBag, "#059669"],
  ["purchases", "Purchase", ShoppingCart, "#DC2626"],
  ["expenses", "Expenses", Receipt, "#DC2626"],
  ["voucher", "Voucher", FileText, "#B45309"],
  ["contra", "Contra", ArrowLeftRight, "#4338CA"],
];

export function NewEntryButtons({ goTab }) {
  return (
    <div className="fin-no-print flex flex-wrap items-center gap-1.5">
      {NEW_ENTRY.map(([k, l, Icon, color]) => (
        <button key={k} onClick={() => goTab(k)} className={`${btnGhost} min-h-9`} aria-label={`New ${l}`}>
          <Icon size={16} style={{ color }} /> {l}
        </button>
      ))}
    </div>
  );
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ◀ [Today / the range] ▶ - the middle opens a small From / To picker with a Today shortcut.
function DateStepper({ range, setRange, today }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const box = useRef(null);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range.from, range.to]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const span = daysBetween(range.from, range.to) + 1;
  const step = (dir) => {
    const nf = addDays(range.from, dir * span), nt = addDays(range.to, dir * span);
    if (nt > today) return;
    setRange({ from: nf, to: nt });
  };
  const isToday = range.from === today && range.to === today;
  const label = isToday ? "Today" : range.from === range.to ? formatBSDate(range.from) : `${formatBSDate(range.from)} – ${formatBSDate(range.to)}`;
  const iconBtn = "h-9 w-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center text-gray-600";
  return (
    <div className="fin-no-print relative flex items-center gap-1.5" ref={box}>
      <button onClick={() => step(-1)} className={iconBtn} aria-label="Earlier"><ChevronLeft size={18} /></button>
      <button onClick={() => setOpen(!open)} className={`${btnGhost} min-w-[8.5rem]`}><CalendarDays size={15} className="text-gray-500" /> {label}</button>
      <button onClick={() => step(1)} disabled={range.to >= today} className={iconBtn} aria-label="Later"><ChevronRight size={18} /></button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg space-y-3">
          <button onClick={() => { setRange({ from: today, to: today }); setOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${isToday ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}>Today</button>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-gray-600">From<input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputCls} mt-1 !px-2`} /></label>
            <label className="text-xs font-semibold text-gray-600">To<input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputCls} mt-1 !px-2`} /></label>
          </div>
          <div className="text-[11px] text-gray-400">{formatBSDate(from)} to {formatBSDate(to)} BS</div>
          <button onClick={() => { setRange({ from: from <= to ? from : to, to: to >= from ? to : from }); setOpen(false); }} className={`${btnPrimary} w-full`}>Apply</button>
        </div>
      )}
    </div>
  );
}

export default function DayBook({ date, setDate, goTab }) {
  const { books } = useBooks();
  const [editing, setEditing] = useState(null);
  const today = todayStr();
  const [range, setRangeState] = useState({ from: date || today, to: date || today });
  const setRange = (r) => { setRangeState(r); if (r.from === r.to) setDate?.(r.from); };
  const book = useMemo(() => cashBook(books, range.from, range.to), [books, range.from, range.to]);
  const singleDay = range.from === range.to;

  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const billAmount = (r) => r.bill ?? r.transferAmount ?? (r.kind === "expense" ? r.out : null);
  const cols = [
    { header: "SN", value: (r) => book.rows.indexOf(r) + 1 },
    { header: "Date", value: (r) => r.date },
    { header: "Invoice no.", value: (r) => r.invoice || "" },
    { header: "Transaction details", value: (r) => [r.label, r.note].filter(Boolean).join(" · ") },
    { header: "Type", value: (r) => KIND[r.kind]?.label || "" },
    { header: "Discount", value: (r) => r.discount || "" },
    { header: "Bill amount", value: (r) => billAmount(r) ?? "" },
    { header: "Cash in", value: (r) => r.in ?? "" },
    { header: "Cash out", value: (r) => r.out ?? "" },
    { header: "Balance", value: (r) => r.balance ?? "" },
  ];
  const fig = (v, color, strong) => (v ? <span className={strong ? "font-bold" : "font-medium"} style={{ color }}>{num(v)}</span> : <span className="text-gray-300">—</span>);
  const balanceColor = (b) => (b < 0 ? "#B91C1C" : "#1D4ED8");

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NewEntryButtons goTab={goTab} />
        <div className="flex flex-wrap items-center gap-2">
          <DateStepper range={range} setRange={setRange} today={today} />
          <ExportBar onXlsx={() => exportXlsx(`daybook-${range.from}${singleDay ? "" : `-to-${range.to}`}`, cols, book.rows)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="text-left">
                <th className="w-10">SN</th>
                <th className="hidden sm:table-cell">Date</th>
                <th className="hidden xl:table-cell">Invoice no.</th>
                <th>Transaction details</th>
                <th className="hidden md:table-cell">Type</th>
                <th className="text-right hidden xl:table-cell">Discount</th>
                <th className="text-right hidden md:table-cell">Bill amount</th>
                <th className="text-right">Cash in</th>
                <th className="text-right">Cash out</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-gray-500">
                <td />
                <td className="hidden sm:table-cell" />
                <td className="hidden xl:table-cell" />
                <td className="font-semibold">Opening balance</td>
                <td className="hidden md:table-cell"><Pill text="Opening" color="#374151" bg="#F3F4F6" /></td>
                <td className="hidden xl:table-cell" />
                <td className="hidden md:table-cell" />
                <td /><td />
                <td className="text-right font-bold" style={{ color: balanceColor(book.opening) }}>{num(book.opening)}</td>
              </tr>
              {book.rows.map((r, i) => {
                const k = KIND[r.kind];
                return (
                  <tr key={r.key} onClick={() => setEditing(r)} className="cursor-pointer">
                    <td className="text-gray-500">{i + 1}</td>
                    <td className="hidden sm:table-cell text-gray-600 whitespace-nowrap">{formatBSDate(r.date)}<div className="text-[11px] text-gray-400">{time(r)}</div></td>
                    <td className="hidden xl:table-cell text-gray-600">{r.invoice || <span className="text-gray-300">—</span>}</td>
                    <td className="min-w-[12rem]">
                      <div className="font-medium text-gray-900">{r.label}</div>
                      {r.note && <div className="text-xs text-gray-400">{r.note}</div>}
                      <div className="md:hidden mt-0.5 flex items-center gap-1.5"><Pill text={k.label} color={k.color} bg={k.bg} />{!singleDay && <span className="sm:hidden text-[11px] text-gray-400">{formatBSDate(r.date)}</span>}</div>
                    </td>
                    <td className="hidden md:table-cell"><Pill text={k.label} color={k.color} bg={k.bg} /></td>
                    <td className="text-right hidden xl:table-cell">{fig(r.discount, "#4B5563")}</td>
                    <td className="text-right hidden md:table-cell">{fig(billAmount(r), r.kind === "sale" || r.kind === "purchase" ? "#111827" : k.color)}</td>
                    <td className="text-right">{fig(r.in, "#047857", true)}</td>
                    <td className="text-right">{fig(r.out, "#B91C1C", true)}</td>
                    <td className="text-right font-bold whitespace-nowrap" style={{ color: r.balance != null ? balanceColor(r.balance) : undefined }}>{r.balance != null ? num(r.balance) : <span className="text-gray-300 font-normal">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sm:hidden" />
                <td colSpan={3} className="text-right hidden xl:table-cell" />
                <td colSpan={2} className="text-right hidden sm:table-cell xl:hidden" />
                <td className="text-right text-gray-700">Closing balance</td>
                <td className="hidden md:table-cell" />
                <td className="hidden xl:table-cell" />
                <td className="hidden md:table-cell" />
                <td className="text-right" style={{ color: "#047857" }}>{num(book.cashIn)}</td>
                <td className="text-right" style={{ color: "#B91C1C" }}>{num(book.cashOut)}</td>
                <td className="text-right whitespace-nowrap" style={{ color: balanceColor(book.closing) }}>{npr(book.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {book.rows.length === 0 && <p className="px-1 text-[13px] text-gray-500">{singleDay ? "No entries on this day." : "No entries in this period."}</p>}
      <p className="px-1 text-xs leading-[17px] text-gray-500">
        Tap any entry to open it. Sale and purchase bills show what was billed; only money that moved (received, paid, expenses, walk-in sales)
        changes the balance. Opening {num(book.opening)} + In {num(book.cashIn)} − Out {num(book.cashOut)} = Closing {num(book.closing)}.
      </p>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
