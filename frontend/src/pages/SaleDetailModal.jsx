/**
 * SaleDetailModal.jsx — a sale's details as a pop-up over the Sales list, the way a vehicle's details open over Inventory.
 *
 * The Overview tab is the Sale Vehicle form (SaleFormBody) filled in and read-only; Edit makes the same fields editable in
 * place, with Save Changes and Cancel at the top. A sold vehicle also gets a Warranty & service tab. Return, Undo Return
 * and Delete are here too. onChanged lets the Sales page reload after any change.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Trash2, Undo2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, getTransferStatusStyle, splitSanakhatExpenses, deleteSaleConfirm } from "../utils/helpers";
import { ReturnModal } from "./VehicleModals";
import SaleFormBody from "./SaleFormBody";
import useSaleForm from "../hooks/useSaleForm";
import WarrantyHistory from "../components/WarrantyHistory";
import WarrantyBadge from "../components/WarrantyBadge";
import { useAuth } from "../context/AuthContext";

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

const paymentStatusStyle = (status) => {
  if (status === "Paid") return { bg: "bg-green-100", text: "text-green-800" };
  if (status === "Partial") return { bg: "bg-yellow-100", text: "text-yellow-800" };
  return { bg: "bg-red-100", text: "text-red-800" };
};

const pill = "px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide";
const actionBtn = "flex items-center gap-1.5 px-3 py-3 rounded-lg text-sm font-medium transition-colors";

function Loaded({ sale, vehicle, booking, reload, onClose, onChanged }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const f = useSaleForm({ sale });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [tab, setTab] = useState("overview");
  const [showReturn, setShowReturn] = useState(false);
  const [returnForm, setReturnForm] = useState({ refund_amount: "", new_status: "available", notes: "" });
  const [returning, setReturning] = useState(false);

  const returned = !!sale.returned;
  const live = !returned && vehicle?.status === "sold"; // still sold: it has a warranty and can be returned
  const ps = paymentStatusStyle(sale.payment_status);

  const startEdit = () => { f.reset(sale); setAttempted(false); setIsEditing(true); setTab("overview"); f.loadLists(); };
  const cancelEdit = () => { f.reset(sale); setAttempted(false); setIsEditing(false); };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    if (f.missing.length) {
      setAttempted(true);
      document.getElementById(f.missing[0][0])?.focus();
      return;
    }
    setSaving(true);
    try {
      const customerId = await f.ensureCustomer();
      await api.put(`/sales/${sale.id}`, f.payload(customerId));
      toast.success("Sale updated successfully!");
      await reload(); // shows the saved sale, read-only again
      onChanged?.();
    } catch (err) { toast.error(getErrMsg(err, "Failed to save sale")); setSaving(false); }
  };

  const deleteSale = async () => {
    if (!window.confirm(deleteSaleConfirm(sale))) return;
    try {
      const r = await api.delete(`/sales/${sale.id}`);
      toast.success(r.data?.message || "Sale deleted, vehicle restored");
      onChanged?.();
      onClose();
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete")); }
  };

  const markReviewed = async () => {
    try {
      await api.patch(`/sales/${sale.id}/review`, { needs_review: false });
      toast.success("Marked as reviewed");
      await reload();
    } catch (err) { toast.error(getErrMsg(err, "Failed to update")); }
  };

  const undoReturn = async () => {
    if (!window.confirm("Undo this return? The sale goes back to a normal sale and the vehicle back to Sold.")) return;
    try {
      await api.post(`/sales/${sale.id}/undo-return`);
      toast.success("Return reversed — vehicle back to Sold");
      await reload();
      onChanged?.();
    } catch (err) { toast.error(getErrMsg(err, "Failed to undo return")); }
  };

  const openReturn = () => { setReturnForm({ refund_amount: "", new_status: "available", notes: "" }); setShowReturn(true); };
  const submitReturn = async (e) => {
    e.preventDefault();
    const amt = Number(returnForm.refund_amount);
    if (returnForm.refund_amount === "" || Number.isNaN(amt) || amt < 0 || amt > sale.total_amount) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setReturning(true);
    try {
      await api.post(`/vehicles/${sale.vehicle_id}/return`, { refund_amount: amt, new_status: returnForm.new_status, notes: returnForm.notes || null });
      toast.success("Return recorded — vehicle back in stock");
      setShowReturn(false);
      await reload();
      onChanged?.();
    } catch (err) { toast.error(getErrMsg(err, "Failed to record return")); setReturning(false); }
  };

  const transfer = vehicle ? getTransferStatusStyle(vehicle.ownership_transfer_status) : null;
  const cards = [
    { label: "Grand Total", value: formatNPR(sale.total_amount) },
    { label: "Amount Due", value: formatNPR(sale.due_amount || 0), red: sale.due_amount > 0 },
    ...(sale.profit !== undefined ? [
      { label: "Total Investment", value: formatNPR(sale.total_investment) },
      { label: sale.returned ? "Profit (as sold)" : "Profit", value: formatNPR(sale.profit), margin: sale.profit_margin, loss: sale.profit < 0 },
    ] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4" data-testid="sale-detail-modal">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[90vh] overflow-y-auto">
        {/* Header + status and actions: sticky as one block, so Save Changes and the other buttons stay reachable. */}
        <div className="sticky top-0 bg-white z-10 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3 p-4 sm:p-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{sale.vehicle_brand ? `${sale.vehicle_brand} ${sale.vehicle_model}` : sale.vehicle_info || "Vehicle removed"}</h2>
              {sale.registration_number && <p className="text-base font-mono font-bold text-slate-900">{sale.registration_number}</p>}
              <p className="text-xs text-slate-500">{[sale.vehicle_year, sale.engine_cc && `${sale.engine_cc}cc`, sale.fuel_type].filter(Boolean).join(" · ")}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
          </div>

          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-5 pb-4 sm:pb-5">
            <span className={`${pill} ${ps.bg} ${ps.text}`} data-testid="payment-status-badge">{returned ? "Returned" : sale.payment_status}</span>
            {transfer && !returned && <span className={`${pill} ${transfer.bg} ${transfer.text}`} data-testid="sale-transfer-tag">Transfer {transfer.label}</span>}
            {live && <WarrantyBadge warranty={vehicle.warranty} />}
            {booking && <span className={`${pill} bg-yellow-100 text-yellow-800`} data-testid="sale-booking-info" title="This sale completed a booking">Booked · {formatNPR(booking.booking_amount)}</span>}
            <div className="flex-1" />
            {isAdmin && (isEditing ? (
              <>
                <button type="button" onClick={cancelEdit} data-testid="cancel-edit-btn" className={`${actionBtn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Cancel</button>
                <button type="button" onClick={saveEdit} disabled={saving} data-testid="save-sale-edit-btn" className={`${actionBtn} bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60`}>{saving ? "Saving..." : "Save Changes"}</button>
              </>
            ) : (
              <>
                <button onClick={startEdit} data-testid="edit-sale-btn" className={`${actionBtn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><Pencil size={14} /> Edit</button>
                {live && <button onClick={openReturn} data-testid="record-return-btn" className={`${actionBtn} border border-amber-200 text-amber-700 hover:bg-amber-50`}><Undo2 size={14} /> Record Return</button>}
                {returned && <button onClick={undoReturn} data-testid="undo-return-btn" className={`${actionBtn} border border-amber-200 text-amber-700 hover:bg-amber-50`}><Undo2 size={14} /> Undo Return</button>}
                <button onClick={deleteSale} data-testid="delete-sale-btn" className={`${actionBtn} border border-red-200 text-red-600 hover:bg-red-50`}><Trash2 size={14} /> Delete Sale</button>
              </>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {sale.needs_review && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="sale-review-banner">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800"><AlertTriangle size={15} /> Might need attention</div>
                <p className="text-xs text-amber-700 mt-0.5">Imported from the spreadsheet{sale.review_note ? ` — ${sale.review_note}` : ""}. Check the details{isAdmin ? ", fix anything off with Edit," : ""} then mark it reviewed.</p>
              </div>
              {isAdmin && (
                <button onClick={markReviewed} data-testid="mark-reviewed-btn" className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold"><CheckCircle2 size={14} /> Mark reviewed</button>
              )}
            </div>
          )}

          {/* Figures */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {cards.map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-w-0">
                <div className="text-xs text-slate-500 mb-1 truncate">{c.label}</div>
                <div className={`text-lg font-bold truncate ${c.red || c.loss ? "text-red-600" : c.margin !== undefined ? "text-green-600" : "text-slate-900"}`} style={{ fontFamily: "Manrope" }}>{c.value}</div>
                {c.margin !== undefined && <div className={`text-xs mt-0.5 ${c.loss ? "text-red-500" : "text-green-600"}`}>{c.margin != null ? `${c.margin}% margin` : "—"}</div>}
              </div>
            ))}
          </div>

          {returned && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5" data-testid="return-details">
              <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-1.5"><Undo2 size={15} /> Return Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-sm">
                <div className="flex justify-between py-1.5 border-b border-amber-100"><span className="text-slate-500">Refunded to customer</span><span className="font-medium text-slate-900">{formatNPR(sale.refund_amount || 0)}</span></div>
                <div className="flex justify-between py-1.5 border-b border-amber-100"><span className="text-slate-500">Retained (kept)</span><span className="font-medium text-slate-900">{formatNPR(sale.retained_amount || 0)}</span></div>
                <div className="flex justify-between py-1.5 border-b border-amber-100"><span className="text-slate-500">Vehicle restocked as</span><span className="font-medium text-slate-900 capitalize">{sale.returned_status}</span></div>
                {sale.return_notes && <div className="flex justify-between py-1.5 border-b border-amber-100 gap-3"><span className="text-slate-500 shrink-0">Condition notes</span><span className="font-medium text-slate-900 text-right">{sale.return_notes}</span></div>}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              {[["overview", "Overview"], ...(live ? [["warranty", "Warranty & service"]] : [])].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} data-testid={`tab-${key}`}
                  className={`px-5 py-3.5 text-sm font-medium transition-colors ${tab === key ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-5">
              {/* Both tabs stay mounted (hidden via CSS) so a half-made edit survives a look at the other one. The Overview is
                  the Sale Vehicle form; -m-5 lets its sections run edge to edge, as they do there. */}
              <div className={tab === "overview" ? "-m-5" : "hidden"}>
                <SaleFormBody f={f} sale={sale} readOnly={!isEditing} attempted={attempted} />
              </div>
              {live && (
                <div className={tab === "warranty" ? "" : "hidden"}>
                  <WarrantyHistory vehicle={vehicle} sanakhat={splitSanakhatExpenses(sale.extra_expenses || [])} onChanged={reload} />
                </div>
              )}
            </div>
          </div>

          {sale.vehicle_id && (
            <Link to={`/inventory/${sale.vehicle_id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              Open full vehicle record (photos, documents, expenses) <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>

      {showReturn && (
        <ReturnModal onClose={() => setShowReturn(false)} onSubmit={submitReturn} form={returnForm} setForm={setReturnForm} saving={returning} activeSale={sale} />
      )}
    </div>
  );
}

// saleId: which sale. onClose: leave the pop-up. onChanged: the sale was edited, returned or deleted, so the list behind
// should reload.
export default function SaleDetailModal({ saleId, onClose, onChanged }) {
  const [data, setData] = useState(null); // { sale, vehicle, booking, version }
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    try {
      const { data: sale } = await api.get(`/sales/${saleId}`);
      // The vehicle (for its warranty and job cards) and the booking this sale completed are extras: the pop-up opens without them.
      const [vehicle, booking] = await Promise.all([
        sale.vehicle_id ? api.get(`/vehicles/${sale.vehicle_id}`).then(r => r.data).catch(() => null) : null,
        api.get("/bookings?status=converted").then(r => r.data.find(b => b.sale_id === saleId) || null).catch(() => null),
      ]);
      setData(d => ({ sale, vehicle, booking, version: (d?.version || 0) + 1 }));
    } catch { toast.error("Sale not found"); closeRef.current(); }
  }, [saleId]);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  return (
    <Loaded key={data.version} sale={data.sale} vehicle={data.vehicle} booking={data.booking} reload={load} onClose={onClose} onChanged={onChanged} />
  );
}
