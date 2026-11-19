import { useEffect, useMemo } from "react";
import { X, Printer, FileSpreadsheet, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useBooks } from "./BooksContext";
import useBackdropClose from "../../hooks/useBackdropClose";
import { Empty, exportXlsx } from "./ui";
import { partyStatement, num } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// One person's ledger opened as a pop-up over the Ledger list, laid out like Jageer Nepal's: their name on a blue bar with
// Print, Excel and Open Ledger (the full page, with their details and reports), then SN, Date, Details, Debit, Credit and
// Balance for every entry, and a total row. Debit = they owe you more, Credit = they owe you less (money received, a purchase
// on credit); Dr / Cr after a balance says which way it stands. Nothing here changes: the entries are edited on the full page.
// party: the party to show. onClose: closes the pop-up. onOpen: opens their full ledger page.

const GREEN = "#047857"; // debit and Dr
const RED = "#B91C1C"; // credit and Cr

const sideWord = (b) => (b > 0 ? " Dr" : b < 0 ? " Cr" : "");
const balanceText = (b) => (b ? `${num(Math.abs(b))}${sideWord(b)}` : "—");
const balanceColor = (b) => (b > 0 ? GREEN : b < 0 ? RED : "#64748B");
const fig = (n, color) => (n ? <span className="font-bold" style={{ color }}>{num(n)}</span> : <span className="text-slate-300">—</span>);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The person's ledger as a page of its own, printed from a new window so that only this ledger prints, not the page behind the pop-up.
function printHtml(party, st) {
  const cell = "border:1px solid #999;padding:6px;";
  const rows = st.lines.map((l, i) => `<tr>
    <td style="${cell}">${i + 1}</td>
    <td style="${cell}white-space:nowrap;">${esc(formatBSDate(l.date))}</td>
    <td style="${cell}"><b>${esc(l.label)}</b>${l.sub ? `<br/><span style="font-size:11px;color:#555;">${esc(l.sub)}</span>` : ""}</td>
    <td style="${cell}text-align:right;">${l.debit ? num(l.debit) : ""}</td>
    <td style="${cell}text-align:right;">${l.credit ? num(l.credit) : ""}</td>
    <td style="${cell}text-align:right;">${esc(l.balance ? balanceText(l.balance) : "")}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Ledger - ${esc(party.name)}</title><style>
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { border: 1px solid #999; padding: 6px; background: #f2f2f2; font-size: 12px; text-align: left; }
  </style></head><body>
    <h2 style="margin:0;">${esc(party.name)}</h2>
    ${party.phone ? `<div style="font-size:12px;color:#555;">${esc(party.phone)}</div>` : ""}
    <table>
      <tr><th>SN</th><th>Date</th><th>Details</th><th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr>
      ${rows}
      <tr><td colspan="3" style="${cell}text-align:right;"><b>${st.lines.length} ${st.lines.length === 1 ? "Entry" : "Entries"} · Total</b></td>
        <td style="${cell}text-align:right;"><b>${num(st.debit)}</b></td><td style="${cell}text-align:right;"><b>${num(st.credit)}</b></td>
        <td style="${cell}text-align:right;"><b>${esc(balanceText(st.closing))}</b></td></tr>
    </table>
    <script>window.onload = function () { window.focus(); window.print(); };</script>
  </body></html>`;
}

const barBtn = "inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100";

export default function PartyLedgerPopup({ party, onClose, onOpen }) {
  const { books } = useBooks();
  const backdrop = useBackdropClose(onClose);
  const st = useMemo(() => partyStatement(books, party.id), [books, party.id]);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const cols = [
    { header: "SN", value: (l) => st.lines.indexOf(l) + 1 },
    { header: "Date", value: (l) => l.date },
    { header: "Details", value: (l) => [l.label, l.sub].filter(Boolean).join(" · ") },
    { header: "Debit", value: (l) => l.debit || "" },
    { header: "Credit", value: (l) => l.credit || "" },
    { header: "Balance", value: (l) => balanceText(l.balance) },
  ];
  // Opened before anything else happens, so a pop-up blocker treats the window as part of the button press.
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return toast.error("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    w.document.open(); w.document.write(printHtml(party, st)); w.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 sm:p-4" data-testid="party-popup" {...backdrop}>
      <div className="bg-white w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[92vh] overflow-y-auto sm:rounded-2xl shadow-xl" role="dialog" aria-modal="true" aria-label={`${party.name} ledger`}>
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-5 bg-blue-700 text-white">
          <h3 className="text-xl font-bold min-w-0 truncate" data-testid="party-popup-name">{party.name}</h3>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={print} className={barBtn} data-testid="party-popup-print"><Printer size={17} className="text-slate-600" /> Print</button>
            <button type="button" onClick={() => exportXlsx(`ledger-${party.name}`, cols, st.lines)} className={barBtn} data-testid="party-popup-excel"><FileSpreadsheet size={17} className="text-emerald-600" /> Excel</button>
            <button type="button" onClick={onOpen} className={barBtn} data-testid="party-popup-open"><ExternalLink size={17} className="text-blue-600" /> Open Ledger</button>
            <button type="button" onClick={onClose} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1 rounded-lg hover:bg-white/15" aria-label="Close" data-testid="party-popup-close"><X size={24} /></button>
          </div>
        </div>

        <div className="p-6">
          {st.lines.length === 0 ? <Empty>No entries yet.</Empty> : (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-[13px]" data-testid="party-popup-table">
                <thead>
                  <tr className="bg-slate-50 text-left text-sm font-semibold text-slate-700">
                    <th className="px-4 py-3 w-16">SN</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {st.lines.map((l, i) => (
                    <tr key={`${l.table}${l.e.id}`} className="border-t border-slate-200" data-testid="party-popup-row">
                      <td className="px-4 py-3 text-slate-600">{i + 1}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatBSDate(l.date)}</td>
                      <td className="px-4 py-3 min-w-[12rem]">
                        <div className="font-semibold text-slate-900">{l.label}</div>
                        {l.sub && <div className="text-xs text-slate-500">{l.sub}</div>}
                      </td>
                      <td className="px-4 py-3 text-right" data-testid="party-popup-debit">{fig(l.debit, GREEN)}</td>
                      <td className="px-4 py-3 text-right" data-testid="party-popup-credit">{fig(l.credit, RED)}</td>
                      <td className="px-4 py-3 text-right font-bold whitespace-nowrap" style={{ color: balanceColor(l.balance) }} data-testid="party-popup-balance">{balanceText(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-bold" data-testid="party-popup-total">
                    <td className="px-4 py-3 text-right" colSpan={3}>{st.lines.length} {st.lines.length === 1 ? "Entry" : "Entries"} · Total</td>
                    <td className="px-4 py-3 text-right" style={{ color: GREEN }}>{num(st.debit)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: RED }}>{num(st.credit)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: balanceColor(st.closing) }}>{balanceText(st.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">Debit = they owe you more, Credit = they owe you less. Dr = they owe you, Cr = you owe them.</p>
        </div>
      </div>
    </div>
  );
}
