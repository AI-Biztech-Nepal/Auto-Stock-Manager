import { Fragment, useMemo, useState } from "react";
import { CloudUpload, Trash2, Banknote } from "lucide-react";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import { Card, Stat, Pill, FilterTabs, DateRangeButton, ExportBar, exportXlsx, btnPrimary } from "./ui";
import { statementRows, dayGroupLabel, num } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// The Statement, as Jageer Nepal's TransactionsBook: every entry in the Day Book's cash-book layout - the type
// tabs, the date filter (All time by default), Print, Excel and Import up top; tiles for Sales, Purchases,
// Expenses and Entries; one bordered table grouped by day (Today, Yesterday, N days ago) with SN, Date,
// Invoice no., Transaction details, Type, Discount, Bill amount, Cash in, Cash out and a delete button; the
// totals in its footer. A bill row opens the bill; a payment opens that party's ledger.

const FILTERS = [["all", "All"], ["sale", "Sales"], ["purchase", "Purchase"], ["expense", "Expenses"]];

export default function Statement({ goTab, openParty }) {
  const { books, del } = useBooks();
  const [filter, setFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState(null);

  const all = useMemo(() => statementRows(books), [books]);
  const rows = useMemo(() => all.filter((r) => (filter === "all" || (r.table === "tx" && r.kind === filter)) && (!from || r.date >= from) && (!to || r.date <= to)), [all, filter, from, to]);
  const stats = useMemo(() => {
    const sums = { sale: 0, purchase: 0, expense: 0 };
    for (const r of all) if (r.table === "tx" && (!from || r.date >= from) && (!to || r.date <= to)) sums[r.kind] += r.data.amount;
    return sums;
  }, [all, from, to]);
  const totals = useMemo(() => ({
    // A voucher's amount is not billed or paid - it is on the line for the record only.
    amount: rows.reduce((s, r) => s + (r.journal ? 0 : r.amount || 0), 0),
    cashIn: rows.reduce((s, r) => s + (r.cashIn || 0), 0),
    cashOut: rows.reduce((s, r) => s + (r.cashOut || 0), 0),
  }), [rows]);

  // A bill or transfer opens right here; a payment opens that party's ledger (as Jageer does).
  const open = (r) => ((r.table === "cl" || r.table === "vl") && !r.journal && openParty ? openParty(r.party) : setEditing({ table: r.table, data: r.data }));
  const remove = (r) => {
    if (!window.confirm(`Delete this ${r.pill.label.toLowerCase()}? This cannot be undone.`)) return;
    del(r.table === "tx" ? `/fin/transactions/${r.data.id}` : `/fin/transfers/${r.data.id}`, "Deleted");
  };

  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const fig = (v, color, bold) => (v == null ? <span className="text-gray-400">—</span> : <span className={bold ? "font-bold" : "font-medium"} style={{ color }}>{num(v)}</span>);
  const cols = [
    { header: "SN", value: (r) => rows.indexOf(r) + 1 },
    { header: "Date", value: (r) => r.date },
    { header: "Invoice no.", value: (r) => r.invoice || "" },
    { header: "Transaction details", value: (r) => [r.details, r.sub].filter(Boolean).join(" · ") },
    { header: "Type", value: (r) => r.pill.label },
    { header: "Discount", value: (r) => r.discount ?? "" },
    { header: "Bill amount", value: (r) => r.amount ?? "" },
    { header: "Cash in", value: (r) => r.cashIn ?? "" },
    { header: "Cash out", value: (r) => r.cashOut ?? "" },
  ];
  const period = from || to ? `${from || "start"}-to-${to || "today"}` : "all";

  return (
    <div className="space-y-3.5">
      <div className="fin-no-print flex flex-wrap items-center justify-end gap-2">
        <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />
        <DateRangeButton from={from} to={to} onApply={(f, t) => { setFrom(f); setTo(t); }} shortcuts={[{ label: "All time", on: !from && !to, onSelect: () => { setFrom(""); setTo(""); } }]} />
        <ExportBar onXlsx={() => exportXlsx(`statement-${period}`, cols, rows)} />
        <button onClick={() => goTab("import")} className={btnPrimary} data-testid="statement-import"><CloudUpload size={16} /> Import</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Sales" value={stats.sale} color="#111827" />
        <Stat label="Purchases" value={stats.purchase} color="#111827" />
        <Stat label="Expenses" value={stats.expense} color="#B91C1C" />
        <Stat label="Entries" value={String(rows.length)} color="#374151" />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-gray-300 bg-white py-10">
          <Banknote size={28} className="text-gray-300" />
          <p className="mt-2 text-gray-500">{from || to ? "Nothing in this date range." : "Nothing in the statement yet."}</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="text-left">
                  <th className="w-12">SN</th>
                  <th className="hidden sm:table-cell">Date</th>
                  <th className="hidden xl:table-cell">Invoice no.</th>
                  <th>Transaction details</th>
                  <th className="hidden md:table-cell">Type</th>
                  <th className="text-right hidden xl:table-cell">Discount</th>
                  <th className="text-right">Bill amount</th>
                  <th className="text-right hidden md:table-cell">Cash in</th>
                  <th className="text-right hidden md:table-cell">Cash out</th>
                  <th className="fin-no-print w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const group = dayGroupLabel(r.date, formatBSDate(r.date));
                  const showGroup = i === 0 || rows[i - 1].date !== r.date;
                  return (
                    <Fragment key={r.key}>
                      {showGroup && <tr className="!bg-gray-50"><td colSpan={10} className="!py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 bg-gray-50">{group}</td></tr>}
                      <tr onClick={() => open(r)} className="cursor-pointer">
                        <td className="text-gray-500">{i + 1}</td>
                        <td className="hidden sm:table-cell text-gray-600 whitespace-nowrap">{formatBSDate(r.date)}<div className="text-[11px] text-gray-400">{time(r)}</div></td>
                        <td className="hidden xl:table-cell text-gray-600">{r.invoice || <span className="text-gray-400">—</span>}</td>
                        <td className="min-w-[12rem]">
                          <div className="font-medium text-gray-900">{r.details}</div>
                          {r.sub && <div className="text-xs text-gray-500">{r.sub}</div>}
                          <div className="md:hidden mt-0.5"><Pill text={r.pill.label} color={r.pill.color} bg={r.pill.bg} /></div>
                        </td>
                        <td className="hidden md:table-cell"><Pill text={r.pill.label} color={r.pill.color} bg={r.pill.bg} /></td>
                        <td className="text-right hidden xl:table-cell">{fig(r.discount || null, "#4B5563")}</td>
                        <td className="text-right">
                          {r.amount != null ? fig(r.amount, r.kind === "sale" || r.kind === "purchase" || r.kind === "creditSale" || r.kind === "creditPurchase" ? "#111827" : r.pill.color)
                            : <span className="md:hidden">{r.cashIn != null ? fig(r.cashIn, "#047857", true) : fig(r.cashOut, "#B91C1C", true)}</span>}
                          {r.amount == null && <span className="hidden md:inline text-gray-400">—</span>}
                        </td>
                        <td className="text-right hidden md:table-cell">{fig(r.cashIn, "#047857", true)}</td>
                        <td className="text-right hidden md:table-cell">{fig(r.cashOut, "#B91C1C", true)}</td>
                        <td className="fin-no-print text-right" onClick={(e) => e.stopPropagation()}>
                          {r.deletable && <button onClick={() => remove(r)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete entry"><Trash2 size={15} /></button>}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sm:hidden" />
                  <td colSpan={2} className="text-right text-gray-700 hidden sm:table-cell" />
                  <td className="hidden xl:table-cell" />
                  <td className="text-right text-gray-700" colSpan={1}>{rows.length} {rows.length === 1 ? "entry" : "entries"} · Totals</td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden xl:table-cell" />
                  <td className="text-right text-gray-900">
                    <span className="hidden md:inline">{num(totals.amount)}</span>
                    <span className="md:hidden">{num(totals.amount + totals.cashIn - totals.cashOut)}</span>
                  </td>
                  <td className="text-right hidden md:table-cell" style={{ color: "#047857" }}>{num(totals.cashIn)}</td>
                  <td className="text-right hidden md:table-cell" style={{ color: "#B91C1C" }}>{num(totals.cashOut)}</td>
                  <td className="fin-no-print" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className="px-1 text-[11.5px] leading-[17px] text-gray-400">
        Tap an entry to open it. Sale and purchase bills show what was billed - they don't change the balance until the money is received or paid, which appears as its own Received or Paid row.
      </p>
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
