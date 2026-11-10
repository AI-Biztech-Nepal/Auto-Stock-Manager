/**
 * SaleVehicleModal.jsx — the Sale Vehicle form (opened from the Sales page, or from a booking).
 *
 * Built like Purchase Vehicle: one scrolling page of sections (Sale, Payment, Exchange, Extra expenses, Notes), chips for
 * phones to jump between them, and a footer that keeps the grand total, what has been paid and what is still due in view.
 * The fields are SaleFormBody's, their state is useSaleForm's; this window adds the header, footer and the posting.
 * onSaved lets the Sales page reload.
 */
import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { digits } from "../components/formKit";
import useSaleForm from "../hooks/useSaleForm";
import SaleFormBody from "./SaleFormBody";

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

const focusField = (id) => document.getElementById(id)?.focus();

// booking: the open booking this sale completes, if any. onClose: leave the form. onSaved: the sale was recorded.
export default function SaleVehicleModal({ booking = null, onClose, onSaved }) {
  const f = useSaleForm({ booking });
  const { form, loadLists } = f;
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [active, setActive] = useState("sale");

  useEffect(() => { loadLists(); }, [loadLists]);

  const submit = async (e) => {
    e.preventDefault();
    if (f.missing.length) {
      setAttempted(true);
      focusField(f.missing[0][0]);
      return;
    }
    setSaving(true);
    try {
      const customerId = await f.ensureCustomer();
      await api.post("/sales", f.payload(customerId));
      toast.success(booking ? "Booking converted to a sale!" : "Sale recorded successfully!");
      onSaved();
      onClose();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); }
    finally { setSaving(false); }
  };

  const sections = [
    { id: "sale", label: "Sale", done: !!(form.vehicle_id && form.sale_price && form.customer_id) },
    { id: "payment", label: "Payment", done: f.amountPaid > 0 },
    { id: "exchange", label: "Exchange", done: f.exchangeValuation > 0 },
    { id: "extras", label: "Extra expenses", done: f.extraExpenses.length > 0 },
    { id: "notes", label: "Notes", done: !!form.notes },
  ];
  const go = (id) => document.getElementById(`sv-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const onScroll = (e) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    let cur = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById(`sv-section-${s.id}`);
      if (el && el.getBoundingClientRect().top - top <= 80) cur = s.id;
    }
    if (cur !== active) setActive(cur);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl lg:max-w-6xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 pl-4 sm:pl-7 pr-2 sm:pr-4 py-3 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{booking ? "Sale Vehicle from Booking" : "Sale Vehicle"}</h2>
            <p className="hidden sm:block text-[13px] text-slate-500">Sell a vehicle from your stock <span className="text-slate-400">· <span className="text-red-600">*</span> needed to save</span></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-[10px] text-slate-600 hover:bg-slate-100 shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col flex-1 min-h-0">

          {/* Section chips (phones and tablets) */}
          <nav aria-label="Form sections" className="lg:hidden flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-slate-200 bg-slate-50 shrink-0">
            {sections.map(s => (
              <button
                key={s.id} type="button" onClick={() => go(s.id)}
                className={`shrink-0 flex items-center gap-1.5 h-11 px-4 rounded-full text-[13px] font-semibold ${active === s.id ? "bg-blue-600 text-white" : s.done ? "bg-emerald-100 text-emerald-800" : "bg-white border border-slate-300 text-slate-700"}`}
              >
                {s.done && active !== s.id && <Check size={13} strokeWidth={3} />}{s.label}
              </button>
            ))}
          </nav>

          <div onScroll={onScroll} className="flex-1 min-h-0 min-w-0 overflow-y-auto">
            {booking && (
              <div className="mx-4 sm:mx-7 mt-5 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-[13px] leading-relaxed text-yellow-900" data-testid="booking-banner">
                Booking deposit of <strong>{formatNPR(booking.booking_amount)}</strong> is filled in as the advance payment. Enter what the customer pays now as cash / bank below.
              </div>
            )}
            <SaleFormBody f={f} booking={booking} attempted={attempted} />
          </div>

          {/* Footer: what this sale adds up to, and the actions */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-7 gap-y-3 px-4 sm:px-7 py-3 border-t border-slate-200 bg-slate-50" data-testid="grand-total-section">
            <div className="hidden sm:block">
              <div className="text-[11px] font-semibold text-slate-500">Sale price</div>
              <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{digits(form.sale_price) ? formatNPR(digits(form.sale_price)) : "Not set"}</div>
            </div>
            {f.expensesTotal > 0 && (
              <div className="hidden sm:block">
                <div className="text-[11px] font-semibold text-slate-500">Extra expenses</div>
                <div className="text-lg font-extrabold text-orange-700" style={{ fontFamily: "Manrope, sans-serif" }}>{formatNPR(f.expensesTotal)}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Grand total</div>
              <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="grand-total-value">{formatNPR(f.grandTotal)}</div>
            </div>
            <div title="Cash + bank + advance + exchange valuation">
              <div className="text-[11px] font-semibold text-slate-500">Paid</div>
              <div className={`text-lg font-extrabold ${f.amountPaid > 0 ? "text-emerald-700" : "text-slate-400"}`} style={{ fontFamily: "Manrope, sans-serif" }} data-testid="paid-total-value">{formatNPR(f.amountPaid)}</div>
            </div>
            {f.amountDue > 0 ? (
              <span className="text-xs font-semibold text-red-700 bg-red-100 rounded-full px-3 py-1.5" data-testid="due-amount-bubble">Due: {formatNPR(f.amountDue)}</span>
            ) : f.grandTotal > 0 && (
              <span className="hidden md:inline-block text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-full px-3 py-1.5" data-testid="paid-in-full-bubble">Paid in full</span>
            )}
            <div className="flex-1" />
            <div className="flex gap-3 w-full sm:w-auto">
              <button type="button" onClick={onClose} className="flex-1 sm:flex-none h-12 px-6 border border-slate-300 rounded-[10px] bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                type="submit" disabled={saving} data-testid="save-sale-btn"
                className="flex-1 sm:flex-none h-12 px-7 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Sale Vehicle"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
