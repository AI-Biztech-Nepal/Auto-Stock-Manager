import { useState } from "react";
import { Plus } from "lucide-react";
import { btnPrimary } from "./ui";

// One button with a menu (spec section 3.1): Received, Payment Out, Sale, Purchase, Expense, then FINANCE-NEPAL's
// Journal Voucher and Contra. Each opens its own entry form. Used by the Day Book and the Statement.
const NEW_ENTRY = [["received", "Received"], ["paid", "Payment Out"], ["sales", "Sale"], ["purchases", "Purchase"], ["expenses", "Expense"], ["voucher", "Journal Voucher"], ["contra", "Contra"]];

export default function NewEntryMenu({ goTab }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={btnPrimary} data-testid="new-entry"><Plus size={16} /> New entry</button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
          {NEW_ENTRY.map(([k, l]) => <button key={k} onClick={() => { setOpen(false); goTab(k); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50">{l}</button>)}
        </div>
      )}
    </div>
  );
}
