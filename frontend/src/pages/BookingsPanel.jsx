import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Undo2, Trash2, BookmarkCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";
import HoverADDate from "../components/HoverADDate";

const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = `${inp} bg-white`;

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

const STATUS_STYLE = {
  active: { label: "Active", cls: "bg-yellow-100 text-yellow-800" },
  converted: { label: "Sold", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Withdrawn", cls: "bg-slate-100 text-slate-600" },
};

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "converted", label: "Sold" },
  { key: "cancelled", label: "Withdrawn" },
  { key: "all", label: "All" },
];

const EMPTY_BOOKING = {
  vehicle_id: "", customer_id: "", booking_amount: "", payment_method: "Cash",
  booking_date: "", expected_sale_date: "", agreed_price: "", notes: "",
};

// Bookings: deposits taken before a sale. Not sales — they only become one when the customer
// pays the balance ("Record Sale", which opens the normal sale form via onRecordSale).
export default function BookingsPanel({ bookings, isAdmin, onRecordSale, onChanged }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("active");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);      // booking being edited, or null for new
  const [form, setForm] = useState(EMPTY_BOOKING);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [newCust, setNewCust] = useState(null);      // {name, contact_number} while adding a customer inline
  const [saving, setSaving] = useState(false);

  const [withdrawing, setWithdrawing] = useState(null);
  const [refund, setRefund] = useState("");
  const [withdrawNotes, setWithdrawNotes] = useState("");

  const active = bookings.filter(b => b.status === "active");
  const depositsHeld = active.reduce((s, b) => s + (b.booking_amount || 0), 0);
  const shown = filter === "all" ? bookings : bookings.filter(b => b.status === filter);

  const openForm = async (booking = null) => {
    setEditing(booking);
    setNewCust(null);
    setForm(booking ? {
      vehicle_id: booking.vehicle_id, customer_id: booking.customer_id || "",
      booking_amount: String(booking.booking_amount ?? ""), payment_method: booking.payment_method || "Cash",
      booking_date: booking.booking_date || "", expected_sale_date: booking.expected_sale_date || "",
      agreed_price: booking.agreed_price != null ? String(booking.agreed_price) : "", notes: booking.notes || "",
    } : EMPTY_BOOKING);
    setShowForm(true);
    try {
      const [v, c] = await Promise.all([booking ? Promise.resolve({ data: [] }) : api.get("/vehicles?status=available"), api.get("/customers")]);
      setVehicles(v.data); setCustomers(c.data);
    } catch { toast.error("Failed to load vehicles/customers"); }
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const saveForm = async (e) => {
    e.preventDefault();
    const amount = Number(form.booking_amount);
    if (!form.vehicle_id) { toast.error("Select a vehicle"); return; }
    if (!(amount > 0)) { toast.error("Enter the booking amount"); return; }
    if (!form.customer_id && !(newCust?.name?.trim() && newCust?.contact_number?.trim())) { toast.error("Select a customer, or add their name and phone"); return; }
    setSaving(true);
    try {
      let customerId = form.customer_id;
      if (!customerId) {
        const r = await api.post("/customers", { name: newCust.name.trim(), contact_number: newCust.contact_number.trim() });
        customerId = r.data.id;
      }
      const payload = {
        customer_id: customerId,
        booking_amount: amount,
        payment_method: form.payment_method,
        booking_date: form.booking_date || undefined,
        expected_sale_date: form.expected_sale_date || undefined,
        agreed_price: form.agreed_price === "" ? undefined : Number(form.agreed_price),
        notes: form.notes,
      };
      if (editing) await api.put(`/bookings/${editing.id}`, payload);
      else await api.post("/bookings", { ...payload, vehicle_id: form.vehicle_id });
      toast.success(editing ? "Booking updated" : "Vehicle booked");
      closeForm();
      onChanged();
    } catch (err) { toast.error(errMsg(err, "Failed to save booking")); }
    finally { setSaving(false); }
  };

  const openWithdraw = (b) => { setWithdrawing(b); setRefund(String(b.booking_amount ?? 0)); setWithdrawNotes(""); };

  const confirmWithdraw = async () => {
    setSaving(true);
    try {
      await api.post(`/bookings/${withdrawing.id}/cancel`, { refund_amount: Number(refund) || 0, notes: withdrawNotes || undefined });
      toast.success("Booking withdrawn — vehicle is available again");
      setWithdrawing(null);
      onChanged();
    } catch (err) { toast.error(errMsg(err, "Failed to withdraw booking")); }
    finally { setSaving(false); }
  };

  const deleteBooking = async (b) => {
    if (!window.confirm("Delete this booking record? Use Withdraw instead if the customer is cancelling.")) return;
    try {
      await api.delete(`/bookings/${b.id}`);
      toast.success("Booking deleted");
      onChanged();
    } catch (err) { toast.error(errMsg(err, "Failed to delete booking")); }
  };

  const retained = withdrawing ? Math.max((withdrawing.booking_amount || 0) - (Number(refund) || 0), 0) : 0;

  return (
    <div className="space-y-4" data-testid="bookings-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} data-testid={`booking-filter-${f.key}`}
              className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${filter === f.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {f.label}{f.key === "active" && active.length ? ` (${active.length})` : ""}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-slate-500 font-medium">Deposits held</div>
            <div className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatNPR(depositsHeld)}</div>
          </div>
          <button onClick={() => openForm()} data-testid="new-booking-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
            <Plus size={16} /> New Booking
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <BookmarkCheck size={32} className="mb-2 opacity-30" />
            <p className="font-medium">{filter === "active" ? "No active bookings" : "No bookings here"}</p>
            <p className="text-xs mt-1 text-slate-400">Click "New Booking" when a customer leaves a deposit on a vehicle</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map(b => {
              const st = STATUS_STYLE[b.status] || STATUS_STYLE.active;
              const agreed = b.agreed_price ?? b.vehicle_selling_price;
              const balance = agreed != null ? Math.max(agreed - (b.booking_amount || 0), 0) : null;
              return (
                <div key={b.id} data-testid="booking-row" className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{b.vehicle_info || "—"}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{b.customer_name}{b.customer_contact ? ` · ${b.customer_contact}` : ""}</div>
                    {b.notes && <div className="text-xs text-slate-400 mt-0.5 truncate">{b.notes}</div>}
                    {b.status === "cancelled" && (
                      <div className="text-xs text-amber-700 mt-1">Refunded {formatNPR(b.refund_amount || 0)} · Kept {formatNPR(b.retained_amount || 0)}{b.cancel_notes ? ` · ${b.cancel_notes}` : ""}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm lg:w-[26rem] shrink-0">
                    <div>
                      <div className="text-[11px] text-slate-400">Deposit</div>
                      <div className="font-bold text-green-700">{formatNPR(b.booking_amount)}</div>
                      <div className="text-[11px] text-slate-400">{b.payment_method}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Balance</div>
                      <div className="font-semibold text-slate-800">{balance != null ? formatNPR(balance) : "—"}</div>
                      {agreed != null && <div className="text-[11px] text-slate-400">of {formatNPR(agreed)}</div>}
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Booked</div>
                      <div className="text-slate-700"><HoverADDate date={b.booking_date} /></div>
                      {b.expected_sale_date && <div className="text-[11px] text-slate-400">Sale by <HoverADDate date={b.expected_sale_date} /></div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.status === "active" && (
                      <>
                        <button onClick={() => onRecordSale(b)} data-testid="booking-record-sale-btn" className="flex items-center gap-1.5 h-9 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium active:scale-95 transition-all">
                          Record Sale <ArrowRight size={14} />
                        </button>
                        <button onClick={() => openForm(b)} title="Edit booking" data-testid="booking-edit-btn" className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil size={14} /></button>
                        {isAdmin && <button onClick={() => openWithdraw(b)} title="Customer withdraws" data-testid="booking-withdraw-btn" className="w-9 h-9 flex items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"><Undo2 size={14} /></button>}
                      </>
                    )}
                    {b.status === "converted" && b.sale_id && (
                      <button onClick={() => navigate(`/sales/${b.sale_id}`)} className="h-9 px-3 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">View sale</button>
                    )}
                    {isAdmin && b.status !== "converted" && (
                      <button onClick={() => deleteBooking(b)} title="Delete booking" className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-50"><Trash2 size={14} className="text-red-400" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New / edit booking */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[90vh] overflow-y-auto" data-testid="booking-modal">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Booking" : "New Booking"}</h2>
              <button onClick={closeForm} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>
            <form onSubmit={saveForm} className="p-4 sm:p-5 space-y-4">
              <Field label="Vehicle" required>
                {editing ? (
                  <div className="h-9 px-3 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">{editing.vehicle_info}</div>
                ) : (
                  <VehicleComboBox vehicles={vehicles} value={form.vehicle_id} onChange={id => {
                    const v = vehicles.find(x => x.id === id);
                    setForm(f => ({ ...f, vehicle_id: id, agreed_price: f.agreed_price || (v?.selling_price ? String(v.selling_price) : "") }));
                  }} placeholder="Search or select available vehicle..." testId="booking-vehicle" showPrice />
                )}
              </Field>

              <Field label="Customer" required>
                {newCust ? (
                  <div className="space-y-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                    <input value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} placeholder="Full name" className={inp} data-testid="booking-new-cust-name" />
                    <input value={newCust.contact_number} onChange={e => setNewCust({ ...newCust, contact_number: e.target.value })} placeholder="Phone number" className={inp} data-testid="booking-new-cust-phone" />
                    <button type="button" onClick={() => setNewCust(null)} className="text-xs text-blue-600 hover:underline">Pick an existing customer instead</button>
                  </div>
                ) : (
                  <select value={form.customer_id} onChange={e => e.target.value === "__new" ? (setNewCust({ name: "", contact_number: "" }), setForm({ ...form, customer_id: "" })) : setForm({ ...form, customer_id: e.target.value })} className={sel} data-testid="booking-customer-select">
                    <option value="">Select customer...</option>
                    <option value="__new">+ New customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>)}
                  </select>
                )}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Booking Amount (NPR)" required>
                  <input type="text" inputMode="numeric" value={form.booking_amount} onChange={e => setForm({ ...form, booking_amount: e.target.value })} placeholder="e.g. 20000" className={inp} data-testid="booking-amount-input" />
                </Field>
                <Field label="Paid By">
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className={sel}>
                    <option>Cash</option>
                    <option>Bank Transfer</option>
                  </select>
                </Field>
                <Field label="Agreed Sale Price (NPR)">
                  <input type="text" inputMode="numeric" value={form.agreed_price} onChange={e => setForm({ ...form, agreed_price: e.target.value })} placeholder="Optional" className={inp} data-testid="booking-agreed-price-input" />
                </Field>
                <Field label="Booking Date">
                  <BSDatePicker value={form.booking_date} onChange={val => setForm({ ...form, booking_date: val })} />
                </Field>
                <Field label="Expected Sale Date">
                  <BSDatePicker value={form.expected_sale_date} onChange={val => setForm({ ...form, expected_sale_date: val })} />
                </Field>
              </div>

              <Field label="Notes">
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this booking..." className={inp} />
              </Field>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 sm:pt-1 sticky bottom-0 sm:static -mx-4 sm:mx-0 px-4 sm:px-0 pb-4 sm:pb-0 bg-white border-t sm:border-t-0 border-slate-100">
                <button type="button" onClick={closeForm} className="flex-1 h-14 sm:h-11 border border-slate-200 text-slate-700 rounded-lg text-base sm:text-sm font-semibold hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} data-testid="save-booking-btn" className="flex-1 h-14 sm:h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base sm:text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Book Vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Withdraw */}
      {withdrawing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWithdrawing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()} data-testid="withdraw-modal">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Customer Withdraws</h2>
              <p className="text-xs text-slate-500 mt-0.5">{withdrawing.vehicle_info} · {withdrawing.customer_name}</p>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="text-sm text-slate-600">Deposit held: <span className="font-bold text-slate-900">{formatNPR(withdrawing.booking_amount)}</span></div>
              <Field label="Refund to customer (NPR)">
                <input type="text" inputMode="numeric" value={refund} onChange={e => setRefund(e.target.value)} className={inp} data-testid="withdraw-refund-input" />
                <p className="text-[11px] text-slate-400 mt-1">Whatever isn't refunded is kept by the shop: <span className="font-semibold text-slate-600">{formatNPR(retained)}</span></p>
              </Field>
              <Field label="Reason / notes">
                <input value={withdrawNotes} onChange={e => setWithdrawNotes(e.target.value)} placeholder="Why they withdrew..." className={inp} />
              </Field>
              <p className="text-xs text-slate-500">The vehicle goes back to Available.</p>
            </div>
            <div className="flex gap-3 p-4 sm:p-5 border-t border-slate-100">
              <button onClick={() => setWithdrawing(null)} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50">Keep Booking</button>
              <button onClick={confirmWithdraw} disabled={saving || Number(refund) > withdrawing.booking_amount || Number(refund) < 0} data-testid="confirm-withdraw-btn" className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving..." : "Confirm Withdrawal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
