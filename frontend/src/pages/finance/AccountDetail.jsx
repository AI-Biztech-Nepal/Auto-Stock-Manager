import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { ChevronLeft, Pencil } from "lucide-react";
import useMediaQuery from "../../hooks/useMediaQuery";
import { useBooks } from "./BooksContext";
import EntryEditor from "./EntryEditor";
import EntryViewer from "./EntryViewer";
import { KIND } from "./DayBook";
import { Card, Pill, Empty, ExportBar, exportXlsx, btnGhost } from "./ui";
import { accountBook, accountChoices, num, CASH, COLORS } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// One account's own page (cash in hand or a bank account), opened from its card on Bank Accounts: every entry that moved money
// through it, newest first, with the money in and out and the account's balance after each, and the opening balance as the last
// row. Tap an entry to open it, as in the Day Book. The back arrow and the name are in the app's top bar, and on wide screens so
// are Print and Excel (as on a person's ledger page).
// bucket: CASH or the bank account's id. onBack: back to the list of accounts. onEdit: opens the account's details form.

const OPENING_BG = { background: "#EEF3FB" };
const dash = <span className="text-gray-300">—</span>;
const fig = (v, color) => (v ? <span className="font-bold" style={{ color }}>{num(v)}</span> : dash);
const tone = (n) => (n < 0 ? COLORS.out : COLORS.balance);

export default function AccountDetail({ bucket, onBack, onEdit, openParty }) {
  const { books } = useBooks();
  const { titleSlot, topbarSlot } = useOutletContext() || {};
  const wide = useMediaQuery("(min-width: 1024px)");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  const name = accountChoices(books, "Cash in hand").find((c) => c.id === bucket)?.name || "Account";
  const acct = bucket === CASH ? books.cash_account || {} : books.accounts.find((a) => a.id === bucket) || {};
  const details = [acct.bank_name, acct.account_number, acct.account_holder_name, acct.address].filter(Boolean).join(" · ");
  const book = useMemo(() => accountBook(books, bucket), [books, bucket]);
  const rows = useMemo(() => [...book.rows].reverse(), [book]); // newest first
  const word = rows.length === 1 ? "Entry" : "Entries";
  const time = (r) => (r.at ? new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

  const cols = [
    { header: "SN", value: (r) => rows.indexOf(r) + 1 },
    { header: "Date", value: (r) => r.date },
    { header: "Invoice no.", value: (r) => r.invoice || "" },
    { header: "Transaction details", value: (r) => [r.label, r.note].filter(Boolean).join(" · ") },
    { header: "Type", value: (r) => KIND[r.kind]?.label || "" },
    { header: "Money in", value: (r) => r.in ?? "" },
    { header: "Money out", value: (r) => r.out ?? "" },
    { header: "Balance", value: (r) => r.balance ?? "" },
  ];

  const heading = (
    <>
      <button type="button" onClick={onBack} aria-label="Back to all accounts" data-testid="account-back"
        className="fin-no-print h-10 w-10 shrink-0 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-800"><ChevronLeft size={20} /></button>
      <h1 className="min-w-0 truncate text-2xl font-bold text-slate-900" data-testid="account-title">{name}</h1>
    </>
  );
  const buttons = <ExportBar onXlsx={() => exportXlsx(`account-${name}`, cols, rows)} />;
  const label = <b>{rows.length} {word} · Total</b>;

  return (
    <div className="space-y-4" data-testid="account-detail">
      {titleSlot ? createPortal(heading, titleSlot) : <div className="flex items-center gap-3 min-w-0">{heading}</div>}
      {wide && topbarSlot
        ? createPortal(<div className="fin-no-print flex items-center gap-2">{buttons}</div>, topbarSlot)
        : <div className="fin-no-print flex flex-wrap items-center justify-end gap-2">{buttons}</div>}

      <Card className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900" data-testid="account-name">{name}</h2>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{details || "No details yet"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right pr-1">
            <div className="text-[11px] font-semibold text-gray-400">Balance</div>
            <div className="text-lg font-extrabold leading-tight" style={{ color: tone(book.closing) }} data-testid="account-balance">NPR {num(book.closing)}</div>
          </div>
          <button type="button" onClick={onEdit} className={`${btnGhost} fin-no-print`} data-testid="account-edit"><Pencil size={14} className="text-blue-600" /> Edit</button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 && !book.opening ? <Empty>Nothing has moved through here yet.</Empty> : (
          <div className="overflow-x-auto">
            <table data-testid="account-table">
              <thead>
                <tr className="text-left">
                  <th className="w-12">SN</th>
                  <th className="hidden sm:table-cell">Date</th>
                  <th>Transaction details</th>
                  <th className="hidden md:table-cell">Type</th>
                  <th className="text-right">Money in</th>
                  <th className="text-right">Money out</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const k = KIND[r.kind];
                  return (
                    <tr key={r.key} onClick={() => setViewing(r)} className="cursor-pointer" data-testid="account-row">
                      <td className="text-gray-500">{i + 1}</td>
                      <td className="hidden sm:table-cell text-gray-600 whitespace-nowrap">{formatBSDate(r.date)}<div className="text-[11px] text-gray-400">{time(r)}</div></td>
                      <td className="min-w-[12rem]">
                        <div className="font-medium text-gray-900">{r.label}</div>
                        {(r.invoice || r.note) && <div className="text-xs text-gray-400">{[r.invoice ? `No. ${r.invoice}` : null, r.note].filter(Boolean).join(" · ")}</div>}
                        <div className="md:hidden mt-0.5 flex items-center gap-1.5"><Pill text={k.label} color={k.color} bg={k.bg} /><span className="sm:hidden text-[11px] text-gray-400">{formatBSDate(r.date)}</span></div>
                      </td>
                      <td className="hidden md:table-cell"><Pill text={k.label} color={k.color} bg={k.bg} /></td>
                      <td className="text-right" data-testid="account-in">{fig(r.in, "#047857")}</td>
                      <td className="text-right" data-testid="account-out">{fig(r.out, "#B91C1C")}</td>
                      <td className="text-right font-bold whitespace-nowrap" style={{ color: tone(r.balance) }} data-testid="account-row-balance">{num(r.balance)}</td>
                    </tr>
                  );
                })}
                <tr data-testid="account-opening-row">
                  <td style={OPENING_BG} />
                  <td style={OPENING_BG} className="hidden sm:table-cell">{dash}</td>
                  <td style={OPENING_BG} className="font-semibold text-gray-900">Opening balance</td>
                  <td style={OPENING_BG} className="hidden md:table-cell"><Pill text="Opening" color="#374151" bg="#F3F4F6" /></td>
                  <td style={OPENING_BG} className="text-right">{dash}</td>
                  <td style={OPENING_BG} className="text-right">{dash}</td>
                  <td className="text-right font-bold whitespace-nowrap" style={{ ...OPENING_BG, color: tone(book.opening) }} data-testid="account-opening-balance">{num(book.opening)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr data-testid="account-total">
                  <td colSpan={2} className="text-right text-gray-900 sm:hidden">{label}</td>
                  <td colSpan={3} className="text-right text-gray-900 hidden sm:table-cell md:hidden">{label}</td>
                  <td colSpan={4} className="text-right text-gray-900 hidden md:table-cell">{label}</td>
                  <td className="text-right" style={{ color: "#047857" }} data-testid="account-total-in">{num(book.cashIn)}</td>
                  <td className="text-right" style={{ color: "#B91C1C" }} data-testid="account-total-out">{num(book.cashOut)}</td>
                  <td className="text-right whitespace-nowrap" style={{ color: tone(book.closing) }} data-testid="account-closing">{num(book.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-400">
        Every entry that moved money through {name}, newest first. A transfer shows as money out of one account and money in to the other. Tap an entry to open it.
      </p>

      {viewing && (
        <EntryViewer row={viewing} kind={KIND[viewing.kind]} openParty={openParty} onClose={() => setViewing(null)}
          onEdit={() => { const r = viewing; setViewing(null); setEditing(r); }} />
      )}
      {editing && <EntryEditor row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
