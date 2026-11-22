import { useEffect } from "react";
import { X, User, Trash2 } from "lucide-react";
import { useBooks } from "./BooksContext";
import useBackdropClose from "../../hooks/useBackdropClose";
import { partyName, accountName, num } from "./money";
import { formatBSDate } from "../../utils/nepali-date";

// A Day Book entry opened to look at, laid out like Jageer Nepal's: the type, the person, the date and time, the bill number,
// the amount, the remarks, and for a bill its items with the total, then Remove / Cancel / Edit. Nothing here can be changed:
// Edit opens the entry's form (EntryEditor), Remove deletes it, and the person's name opens their ledger.
// row: a Day Book row (cashBook in money.js). kind: its { label, color, bg } pill. openParty: opens a person's ledger.

const TITLES = { sale: "Sale Bill", purchase: "Purchase Bill", expense: "Expense" };

// Entries a vehicle sale or a booking on the Sales page posted: they come back the next time that sale / booking is saved.
const POSTED_FROM = { vehicle_sale: "a vehicle sale", booking_kept: "a cancelled booking", booking_deposit: "a booking", booking_refund: "a cancelled booking" };

// The person an entry belongs to (a party that is still in the books), or null: expenses, walk-in sales, transfers and journal
// vouchers belong to no one's ledger.
export const partyOfRow = (books, r) => {
  if (r.kind === "expense") return null;
  const id = r.table === "tx" || r.table === "cl" ? r.data.customer_id : r.table === "vl" ? r.data.vendor_id : null;
  return id && books.parties.some((p) => p.id === id) ? id : null;
};

const Box = ({ label, children, className = "" }) => (
  <div className={className}>
    <div className="text-sm font-medium text-slate-600 mb-1.5">{label}</div>
    <div className="min-h-[3rem] px-4 py-2.5 flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-900">{children}</div>
  </div>
);

export default function EntryViewer({ row, kind, openParty, onClose, onEdit }) {
  const { books, del } = useBooks();
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const d = row.data;
  const isTx = row.table === "tx";
  const isTransfer = row.table === "tr";
  const side = row.table === "cl" ? "customer" : "vendor";
  const title = isTx ? TITLES[d.type] || "Entry" : isTransfer ? "Transfer" : side === "customer" ? (d.entry_type === "credit" ? "Payment Received" : "Refund Paid") : "Payment Out";
  const partyId = partyOfRow(books, row);
  const person = isTx ? d.party_name || partyName(books, d.customer_id) : side === "customer" ? partyName(books, d.customer_id) : partyName(books, d.vendor_id);
  const number = isTx ? d.bill_no : d.receipt_no;
  const numberLabel = isTx ? "Bill No." : side === "customer" ? "Receipt No." : "Payment No.";
  const time = d.created_at ? new Date(d.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const ad = row.date ? new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const moved = row.in != null || row.out != null; // money actually moved (a bill on a party's ledger moves none)
  const lines = [
    ...(isTx ? d.items || [] : []).map((i) => ({ name: i.description, qty: i.qty, rate: i.rate, amount: i.amount })),
    ...(isTx ? d.service_charges || [] : []).map((s) => ({ name: s.name, qty: "", rate: "", amount: s.amount })),
  ];
  const removable = isTx || isTransfer || d.source === "manual"; // what a bill posted can only be changed on the bill
  const postedFrom = POSTED_FROM[d.source_type];

  const remove = async () => {
    const message = postedFrom
      ? `This entry was posted from ${postedFrom} on the Sales page. Removing it here does not change that, and it comes back the next time that sale or booking is saved. Remove it anyway?`
      : "Remove this entry? This can't be undone.";
    if (!window.confirm(message)) return;
    const url = isTx ? `/fin/transactions/${d.id}` : isTransfer ? `/fin/transfers/${d.id}` : `/fin/ledger/${side}/${d.id}`;
    if (await del(url, "Removed")) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 sm:p-4" data-testid="entry-viewer" {...backdrop}>
      <div className="bg-white w-full h-full sm:h-auto sm:max-w-[43.75rem] sm:max-h-[92vh] overflow-y-auto sm:rounded-2xl shadow-xl" role="dialog" aria-modal="true">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-5 bg-blue-700 text-white">
          <h3 className="text-xl font-bold" data-testid="entry-viewer-title">{title}</h3>
          <button onClick={onClose} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1 rounded-lg hover:bg-white/15" aria-label="Close"><X size={22} /></button>
        </div>

        <div className="p-6 space-y-4">
          <span className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold" style={{ color: kind.color, background: kind.bg, borderColor: kind.color }} data-testid="entry-viewer-kind">{kind.label}</span>

          {isTransfer ? (
            <div className="grid grid-cols-2 gap-4">
              <Box label="From">{accountName(books, d.from_account_id)}</Box>
              <Box label="To">{accountName(books, d.to_account_id)}</Box>
            </div>
          ) : (
            <Box label={row.kind === "expense" ? "Paid to" : "Person"}>
              {partyId && openParty ? (
                <button type="button" onClick={() => { onClose(); openParty(partyId); }} data-testid="entry-viewer-person" title="Open this person's ledger"
                  className="flex items-center gap-2 text-left font-medium hover:text-blue-700 hover:underline">
                  <User size={16} className="text-slate-500 shrink-0" /> {person || "—"}
                </button>
              ) : (
                <span className="flex items-center gap-2 font-medium" data-testid="entry-viewer-person"><User size={16} className="text-slate-500 shrink-0" /> {person || "—"}</span>
              )}
            </Box>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
            <Box label="Date">
              <div className="font-bold">{row.date ? formatBSDate(row.date) : "—"}</div>
              {ad && <div className="text-xs text-slate-500">{ad}</div>}
            </Box>
            <Box label="Time">{time || "—"}</Box>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isTransfer && <Box label={numberLabel}>{number || "—"}</Box>}
            <Box label="Amount (NPR)" className={isTransfer ? "sm:col-span-2" : ""}><span className="font-semibold" data-testid="entry-viewer-amount">{num(d.amount)}</span></Box>
          </div>

          {moved && !isTransfer && <Box label="Payment method">{accountName(books, d.bank_account_id)}</Box>}
          <Box label="Remarks">{d.note || "—"}</Box>

          {lines.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid="entry-viewer-items">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 w-14 font-semibold">S.N.</th>
                    <th className="px-3 py-2.5 font-semibold">Item</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2.5">{l.name || "—"}</td>
                      <td className="px-3 py-2.5 text-right">{l.qty === "" || l.qty == null ? "" : l.qty}</td>
                      <td className="px-3 py-2.5 text-right">{l.rate === "" || l.rate == null ? "" : num(l.rate)}</td>
                      <td className="px-3 py-2.5 text-right">{num(l.amount)}</td>
                    </tr>
                  ))}
                  {Number(d.discount_amount) > 0 && (
                    <tr className="border-t border-slate-100"><td colSpan={4} className="px-3 py-2.5 text-right text-slate-600">Discount</td><td className="px-3 py-2.5 text-right text-slate-600">− {num(d.discount_amount)}</td></tr>
                  )}
                  <tr className="border-t border-emerald-100 bg-emerald-50">
                    <td colSpan={4} className="px-3 py-3 text-right font-semibold">Total (NPR)</td>
                    <td className="px-3 py-3 text-right text-base font-bold text-emerald-700">{num(d.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {removable ? (
              <button type="button" onClick={remove} data-testid="entry-viewer-remove" className="inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold hover:bg-red-100">
                <Trash2 size={17} /> Remove
              </button>
            ) : <span />}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} data-testid="entry-viewer-cancel" className="h-12 px-6 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={onEdit} data-testid="entry-viewer-edit" className="h-12 px-8 rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700">Edit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
