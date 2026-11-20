import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import useMediaQuery from "../../hooks/useMediaQuery";
import { ArrowDownCircle, ArrowUpCircle, ShoppingBag, ShoppingCart, Receipt, FileText, ArrowLeftRight } from "lucide-react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import EntryViewer from "./EntryViewer";
import PeriodStepper, { periodAt } from "./PeriodStepper";
import { Card, Pill, ExportBar, exportXlsx, btnGhost } from "./ui";
import { cashBook, accountChoices, balances, todayStr, num } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// The Day Book as Jageer Nepal draws it: the New entry buttons up top and the period stepper in the app's top bar, then one bordered
// table - SN, Date, Invoice no., Transaction details, Type, Discount, Bill amount, Cash in, Cash out, Balance -
// opening with the opening balance and closing on the closing balance. Only cash rows move the balance; a sale or
// purchase bill shows what was billed. A day by default, or any run of days. Tap a row to open it.

// The Type pill of each row, in Jageer's words and colours.
export const KIND = {
  received: { label: "Received", color: "#047857", bg: "#ECFDF5" },
  paid: { label: "Payment", color: "#B91C1C", bg: "#FEF2F2" },
  expense: { label: "Expenses", color: "#B91C1C", bg: "#FEF2F2" },
  sale: { label: "Sale bill", color: "#047857", bg: "#ECFDF5" },
  purchase: { label: "Purchase bill", color: "#B91C1C", bg: "#FEF2F2" },
  transfer: { label: "Contra", color: "#4338CA", bg: "#EEF2FF" },
  journal: { label: "Journal", color: "#B45309", bg: "#FFFBEB" },
};

// Every entry form, one button each, with its own coloured icon.
const NEW_ENTRY = [
  ["received", "Received", ArrowDownCircle, "#059669"],
  ["paid", "Payment", ArrowUpCircle, "#DC2626"],
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

// The opening row's tint, set on its cells (the table's row hover would otherwise paint over it).
const OPENING_BG = { background: "#EEF3FB" };

export default function DayBook({ date, setDate, goTab, openParty, editBill }) {
  const { books } = useBooks();
  const { topbarSlot } = useOutletContext() || {}; // the app's top bar
  const roomy = useMediaQuery("(min-width: 1280px)"); // wide enough for the date stepper, account picker and Print / Excel beside the title
  const inTopbar = roomy && !!topbarSlot;
  const [viewing, setViewing] = useState(null); // the entry tapped: opened to look at (EntryViewer), as Jageer Nepal does
  const [editing, setEditing] = useState(null); // the entry being changed (EntryEditor), from the viewer's Edit button
  // A journal voucher opens straight to its own viewer (inside EntryEditor); every other entry opens the bill view first.
  const open = (r) => (r.table === "jv" ? setEditing(r) : setViewing(r));
  const today = todayStr();
  // The days shown: a day to begin with (the one Finance last had open), or a month, a year or a range of your own.
  const [period, setPeriodState] = useState(() => periodAt("day", date || today));
  const setPeriod = (p) => { setPeriodState(p); if (p.from && p.from === p.to) setDate?.(p.from); };
  const range = { from: period.from, to: period.to };
  // The book is always of every account together (cash and each bank).
  const choices = useMemo(() => accountChoices(books), [books]);
  const book = useMemo(() => cashBook(books, range.from, range.to), [books, range.from, range.to]);
  // What each account held when the first day shown began (the opening balance of that day, account by account).
  const openings = useMemo(() => {
    const buckets = balances(books, { before: range.from }).buckets;
    return choices.map((c) => ({ ...c, total: buckets[c.id]?.total || 0 }));
  }, [books, choices, range.from]);
  const hasBanks = books.accounts.length > 0;
  const singleDay = range.from === range.to;

  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  // The amount of an entry under the column of its kind: what a purchase bill / a sale bill was billed for, and what a contra (a
  // transfer between your own accounts) moved. Anything else has no amount here (its money is in Cash in / Cash out).
  const purchaseOf = (r) => (r.kind === "purchase" ? r.bill : null);
  const saleOf = (r) => (r.kind === "sale" ? r.bill : null);
  const contraOf = (r) => (r.kind === "transfer" ? r.transferAmount : null);
  const totals = useMemo(() => ({
    purchase: book.rows.reduce((s, r) => s + (purchaseOf(r) || 0), 0),
    sale: book.rows.reduce((s, r) => s + (saleOf(r) || 0), 0),
    contra: book.rows.reduce((s, r) => s + (contraOf(r) || 0), 0),
  }), [book]);
  const cols = [
    { header: "SN", value: (r) => book.rows.indexOf(r) + 1 },
    { header: "Date", value: (r) => r.date },
    { header: "Invoice no.", value: (r) => r.invoice || "" },
    { header: "Transaction details", value: (r) => [r.label, r.note].filter(Boolean).join(" · ") },
    { header: "Type", value: (r) => KIND[r.kind]?.label || "" },
    { header: "Purchase", value: (r) => purchaseOf(r) ?? "" },
    { header: "Sale", value: (r) => saleOf(r) ?? "" },
    { header: "Contra", value: (r) => contraOf(r) ?? "" },
    { header: "Cash in", value: (r) => r.in ?? "" },
    { header: "Cash out", value: (r) => r.out ?? "" },
    { header: "Balance", value: (r) => r.balance ?? "" },
  ];
  // The opening row's second line: what each account held (Cash −41,830 + Esewa −52,656 + JBBL 740,472 = 645,985). Only when there
  // is more than cash to add up.
  const split = hasBanks ? `${openings.map((o) => `${o.name} ${num(o.total)}`).join(" + ")} = ${num(book.opening)}` : "";
  const dash = <span className="text-gray-300">—</span>;
  const formula = <b>Opening {num(book.opening)} + In {num(book.cashIn)} − Out {num(book.cashOut)} = Closing Balance</b>;
  const fig = (v, color, strong) => (v ? <span className={strong ? "font-bold" : "font-medium"} style={{ color }}>{num(v)}</span> : <span className="text-gray-300">—</span>);
  const balanceColor = (b) => (b < 0 ? "#B91C1C" : "#1D4ED8");

  const controls = (
    <>
      <PeriodStepper value={period} onChange={setPeriod} units={["day", "month", "year", "custom"]} />
      <ExportBar onXlsx={() => exportXlsx(`daybook-${range.from}${singleDay ? "" : `-to-${range.to}`}`, cols, book.rows)} />
    </>
  );

  return (
    <div className="space-y-3.5">
      {/* The date stepper and Print / Excel are in the app's top bar on wide screens; on narrower ones they are here. */}
      {inTopbar
        ? createPortal(controls, topbarSlot)
        : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <NewEntryButtons goTab={goTab} />
            <div className="flex flex-wrap items-center gap-2">{controls}</div>
          </div>
        )}
      {inTopbar && <NewEntryButtons goTab={goTab} />}

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
                <th className="text-right hidden md:table-cell">Purchase</th>
                <th className="text-right hidden md:table-cell">Sale</th>
                <th className="text-right hidden md:table-cell">Contra</th>
                <th className="text-right">Cash in</th>
                <th className="text-right">Cash out</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* The first row: what the book held when the first day shown began, tinted, with what each account held under it */}
              <tr data-testid="daybook-opening-row">
                <td style={OPENING_BG} />
                <td style={OPENING_BG} className="hidden sm:table-cell" />
                <td style={OPENING_BG} className="hidden xl:table-cell">{dash}</td>
                <td style={OPENING_BG}>
                  <div className="font-semibold text-gray-900">Opening balance</div>
                  {split && <div className="text-xs text-gray-400" data-testid="daybook-openings">{split}</div>}
                </td>
                <td style={OPENING_BG} className="hidden md:table-cell"><Pill text="Opening" color="#374151" bg="#F3F4F6" /></td>
                <td style={OPENING_BG} className="text-right hidden md:table-cell">{dash}</td>
                <td style={OPENING_BG} className="text-right hidden md:table-cell">{dash}</td>
                <td style={OPENING_BG} className="text-right hidden md:table-cell">{dash}</td>
                <td style={OPENING_BG} className="text-right">{dash}</td>
                <td style={OPENING_BG} className="text-right">{dash}</td>
                <td className="text-right font-bold whitespace-nowrap" style={{ ...OPENING_BG, color: book.opening < 0 ? "#B91C1C" : "#111827" }} data-testid="daybook-opening-balance">{num(book.opening)}</td>
              </tr>
              {book.rows.map((r, i) => {
                const k = KIND[r.kind];
                return (
                  <tr key={r.key} onClick={() => open(r)} className="cursor-pointer" data-testid="daybook-row">
                    <td className="text-gray-500">{i + 1}</td>
                    <td className="hidden sm:table-cell text-gray-600 whitespace-nowrap">{formatBSDate(r.date)}<div className="text-[11px] text-gray-400">{time(r)}</div></td>
                    <td className="hidden xl:table-cell text-gray-600">{r.invoice || <span className="text-gray-300">—</span>}</td>
                    <td className="min-w-[12rem]">
                      <div className="font-medium text-gray-900">{r.label}</div>
                      {r.note && <div className="text-xs text-gray-400">{r.note}</div>}
                      <div className="md:hidden mt-0.5 flex items-center gap-1.5"><Pill text={k.label} color={k.color} bg={k.bg} />{!singleDay && <span className="sm:hidden text-[11px] text-gray-400">{formatBSDate(r.date)}</span>}</div>
                    </td>
                    <td className="hidden md:table-cell"><Pill text={k.label} color={k.color} bg={k.bg} /></td>
                    <td className="text-right hidden md:table-cell" data-testid="daybook-purchase">{fig(purchaseOf(r), "#111827")}</td>
                    <td className="text-right hidden md:table-cell" data-testid="daybook-sale">{fig(saleOf(r), "#111827")}</td>
                    <td className="text-right hidden md:table-cell" data-testid="daybook-contra">{fig(contraOf(r), k.color)}</td>
                    <td className="text-right">{fig(r.in, "#047857", true)}</td>
                    <td className="text-right">{fig(r.out, "#B91C1C", true)}</td>
                    <td className="text-right font-bold whitespace-nowrap" style={{ color: r.balance != null ? balanceColor(r.balance) : undefined }}>{r.balance != null ? num(r.balance) : <span className="text-gray-300 font-normal">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                {/* "Opening + In − Out = Closing balance", right-aligned over every column before the totals. One cell for each
                    width, since the Date, Invoice no. and Type columns come and go with the screen size. */}
                <td colSpan={2} className="text-right text-gray-900 sm:hidden" data-testid="daybook-formula">{formula}</td>
                <td colSpan={3} className="text-right text-gray-900 hidden sm:table-cell md:hidden">{formula}</td>
                <td colSpan={4} className="text-right text-gray-900 hidden md:table-cell xl:hidden">{formula}</td>
                <td colSpan={5} className="text-right text-gray-900 hidden xl:table-cell">{formula}</td>
                <td className="text-right hidden md:table-cell font-semibold" style={{ color: "#111827" }} data-testid="daybook-total-purchase">{num(totals.purchase)}</td>
                <td className="text-right hidden md:table-cell font-semibold" style={{ color: "#111827" }} data-testid="daybook-total-sale">{num(totals.sale)}</td>
                <td className="text-right hidden md:table-cell font-semibold" style={{ color: KIND.transfer.color }} data-testid="daybook-total-contra">{num(totals.contra)}</td>
                <td className="text-right" style={{ color: "#047857" }}>{num(book.cashIn)}</td>
                <td className="text-right" style={{ color: "#B91C1C" }}>{num(book.cashOut)}</td>
                <td className="text-right whitespace-nowrap" style={{ color: balanceColor(book.closing) }} data-testid="daybook-closing">{num(book.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {book.rows.length === 0 && <p className="px-1 text-[13px] text-gray-500">{singleDay ? "No entries on this day." : "No entries in this period."}</p>}
      <p className="px-1 text-xs leading-[17px] text-gray-500">
        Tap an entry to open it; the person's name in it opens their ledger.{" "}
        Purchase and Sale show what a bill was billed for and Contra what moved between your own accounts; only money that moved (received, payment, expenses, walk-in sales) changes the balance.
      </p>
      {viewing && (
        <EntryViewer row={viewing} kind={KIND[viewing.kind]} openParty={openParty} onClose={() => setViewing(null)}
          onEdit={() => {
            const r = viewing;
            setViewing(null);
            // A sale or purchase bill against a person is changed in its own form (the Sales / Purchase page, opened filled in
            // with it); every other entry in the small editor.
            if (editBill && r.table === "tx" && (r.data.type === "sale" || r.data.type === "purchase") && r.data.customer_id) editBill(r.data.type, r.data.id);
            else setEditing(r);
          }} />
      )}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
