/**
 * BookingModals.jsx — the two pop-ups of a booked vehicle's row on the Sales page: Edit (its deposit, how it was paid,
 * the vehicle, notes) and Withdraw (the customer backs out: part of the deposit is refunded, the rest is kept, and the
 * vehicle goes back to Available). A booking is made from the Sale Vehicle form (the Booking tick).
 * onSaved: called after the change went through (the Sales page reloads); onClose: leave without changing anything.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import VehicleComboBox from "./VehicleComboBox";
import useBackdropClose from "../hooks/useBackdropClose";
import { financeNotice } from "../utils/financeNotice";

const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
    {children}
  </div>
);

const errMsg = (err, fallback) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

export function EditBookingModal({ booking, onClose, onSaved }) {
  const [form, setForm] = useState({
    vehicle_id: booking.vehicle_id,
    booking_amount: String(booking.booking_amount ?? ""),
    payment_method: booking.payment_method || "Cash",
    notes: booking.notes || "",
  });
  const [vehicles, setVehicles] = useState([]);
  const [saving, setSaving] = useState(false);
  const backdrop = useBackdropClose(() => { if (!saving) onClose(); }); // clicking outside the form closes it

  // The booked vehicle is "reserved", so it isn't in the available list: add it so it stays selectable.
  useEffect(() => {
    (async () => {
      try {
        const [avail, current] = await Promise.all([api.get("/vehicles?status=available"), api.get(`/vehicles/${booking.vehicle_id}`)]);
        setVehicles([current.data, ...avail.data.filter(v => v.id !== current.data.id)]);
      } catch { toast.error("Failed to load vehicles"); }
    })();
  }, [booking.vehicle_id]);

  const save = async (e) => {
    e.preventDefault();
    const amount = Number(form.booking_amount || 0); // a booking made from the Sale Vehicle form starts with no deposit (0)
    if (!form.vehicle_id) { toast.error("Select a vehicle"); return; }
    if (!(amount >= 0)) { toast.error("Enter a valid booking amount"); return; }
    setSaving(true);
    try {
      const r = await api.put(`/bookings/${booking.id}`, { vehicle_id: form.vehicle_id, booking_amount: amount, payment_method: form.payment_method, notes: form.notes });
      toast.success("Booking updated");
      financeNotice(r.data);
      onSaved();
      onClose();
    } catch (err) { toast.error(errMsg(err, "Failed to save booking")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4" {...backdrop}>
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] overflow-y-auto" data-testid="booking-modal">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">Edit Booking</h2>
            <p className="text-xs text-slate-500 truncate">{booking.customer_name}{booking.customer_contact ? ` · ${booking.customer_contact}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
        </div>
        <form onSubmit={save} className="p-4 sm:p-5 space-y-4">
          <Field label="Vehicle" required>
            <VehicleComboBox vehicles={vehicles} value={form.vehicle_id} onChange={id => setForm(f => ({ ...f, vehicle_id: id }))} placeholder="Search or select available vehicle..." testId="booking-vehicle" showPrice />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Booking Amount (NPR)">
              <input type="text" inputMode="numeric" value={form.booking_amount} onChange={e => setForm({ ...form, booking_amount: e.target.value })} placeholder="e.g. 20000" className={inp} data-testid="booking-amount-input" />
            </Field>
            <Field label="Paid By">
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className={`${inp} bg-white`}>
                <option>Cash</option>
                <option>Bank Transfer</option>
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this booking..." className={inp} />
          </Field>
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 sm:pt-1 sticky bottom-0 sm:static -mx-4 sm:mx-0 px-4 sm:px-0 pb-4 sm:pb-0 bg-white border-t sm:border-t-0 border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 h-14 sm:h-11 border border-slate-200 text-slate-700 rounded-lg text-base sm:text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} data-testid="save-booking-btn" className="flex-1 h-14 sm:h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base sm:text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function WithdrawBookingModal({ booking, onClose, onSaved }) {
  const [refund, setRefund] = useState(String(booking.booking_amount ?? 0));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const retained = Math.max((booking.booking_amount || 0) - (Number(refund) || 0), 0);

  const confirm = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/bookings/${booking.id}/cancel`, { refund_amount: Number(refund) || 0, notes: notes || undefined });
      toast.success("Booking withdrawn — vehicle is available again");
      financeNotice(r.data);
      onSaved();
      onClose();
    } catch (err) { toast.error(errMsg(err, "Failed to withdraw booking")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()} data-testid="withdraw-modal">
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Customer Withdraws</h2>
          <p className="text-xs text-slate-500 mt-0.5">{booking.vehicle_info} · {booking.customer_name}</p>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="text-sm text-slate-600">Deposit held: <span className="font-bold text-slate-900">{formatNPR(booking.booking_amount)}</span></div>
          <Field label="Refund to customer (NPR)">
            <input type="text" inputMode="numeric" value={refund} onChange={e => setRefund(e.target.value)} className={inp} data-testid="withdraw-refund-input" />
            <p className="text-xs text-slate-400 mt-1">Whatever isn't refunded is kept by the shop: <span className="font-semibold text-slate-600">{formatNPR(retained)}</span></p>
          </Field>
          <Field label="Reason / notes">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why they withdrew..." className={inp} />
          </Field>
          <p className="text-xs text-slate-500">The vehicle goes back to Available.</p>
        </div>
        <div className="flex gap-3 p-4 sm:p-5 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50">Keep Booking</button>
          <button type="button" onClick={confirm} disabled={saving || Number(refund) > booking.booking_amount || Number(refund) < 0} data-testid="confirm-withdraw-btn" className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving..." : "Confirm Withdrawal"}
          </button>
        </div>
      </div>
    </div>
  );
}
