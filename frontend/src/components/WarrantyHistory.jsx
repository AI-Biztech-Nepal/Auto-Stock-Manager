import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatWarrantyLength } from "../utils/helpers";
import HoverADDate from "./HoverADDate";
import WarrantyBadge, { serviceLabel } from "./WarrantyBadge";
import { useAuth } from "../context/AuthContext";
import { canVoidWarranty, canManageWarranty } from "../utils/permissions";

const Row = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-2 border-b border-slate-50 last:border-0">
    <span className="text-sm text-slate-500 shrink-0">{label}</span>
    {children}
  </div>
);

// A sold vehicle's warranty and its full job card (service / sanakhat) history, with the same actions as the Warranty
// tracker (void, restore, change length), so a warranty can be handled from the vehicle's own record.
// vehicle: as GET /vehicles/:id returns it (warranty, service_history). sanakhat: { sanakhat, resanakhat } entered on the
// sale. extraRows: more rows for the right-hand column (the sold-vehicle page adds the Transfer status there).
// onChanged: the warranty was voided or restored, so the caller should reload the vehicle.
export default function WarrantyHistory({ vehicle, sanakhat = { sanakhat: 0, resanakhat: 0 }, extraRows = null, onChanged }) {
  const { user } = useAuth();
  const canVoid = canVoidWarranty(user?.role);
  const canManage = canManageWarranty(user?.role);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  const submitVoid = async (e) => {
    e.preventDefault();
    if (!voidReason.trim()) { toast.error("Enter where / when the vehicle was serviced"); return; }
    setVoidBusy(true);
    try {
      await api.post(`/warranties/${vehicle.id}/void`, { reason: voidReason.trim() });
      toast.success("Warranty voided");
      setVoiding(false);
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to void warranty"); }
    finally { setVoidBusy(false); }
  };

  const restoreWarranty = async () => {
    if (!window.confirm(`Restore the warranty on ${vehicle.brand} ${vehicle.model}?`)) return;
    try {
      await api.post(`/warranties/${vehicle.id}/restore`);
      toast.success("Warranty restored");
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to restore warranty"); }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="sold-warranty-history">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><ShieldCheck size={15} className="text-teal-600" /> Warranty &amp; Service History</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <WarrantyBadge warranty={vehicle.warranty} />
            {canVoid && ["active", "awaiting"].includes(vehicle.warranty?.status) && (
              <button onClick={() => { setVoidReason(""); setVoiding(true); }} data-testid="void-warranty-btn" className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors">
                <ShieldOff size={13} /> Void warranty
              </button>
            )}
            {canManage && vehicle.warranty?.status === "void" && (
              <button onClick={restoreWarranty} data-testid="restore-warranty-btn" className="flex items-center gap-1.5 px-2.5 py-1 bg-white text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
                <RotateCcw size={13} /> Restore warranty
              </button>
            )}
            {canManage && (
              <Link to="/warranty" className="text-xs text-blue-600 hover:underline">Change length</Link>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {vehicle.warranty && <div>
            <Row label="Warranty Length"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatWarrantyLength(vehicle.warranty.days)}{vehicle.warranty.custom_length ? " (custom)" : ""}</span></Row>
            <Row label="Starts"><span className="text-sm font-medium text-slate-900 sm:text-right"><HoverADDate date={vehicle.warranty.start} /></span></Row>
            <Row label="Ends"><span className="text-sm font-medium text-slate-900 sm:text-right"><HoverADDate date={vehicle.warranty.end} /></span></Row>
          </div>}
          <div>
            <Row label="Services Since Sale"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.warranty?.services ?? 0}</span></Row>
            <Row label="Total Job Cards"><span className="text-sm font-medium text-slate-900 sm:text-right">{(vehicle.service_history || []).length}</span></Row>
            {extraRows}
            <Row label="Sanakhat"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sanakhat.sanakhat)}</span></Row>
            <Row label="Re-Sanakhat"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(sanakhat.resanakhat)}</span></Row>
          </div>
        </div>
        {vehicle.warranty?.status === "void" && (
          <div className="mt-3 text-xs bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2">
            <span className="font-semibold">Voided (serviced elsewhere):</span> {vehicle.warranty.void_reason}
            <span className="text-red-400"> · by {vehicle.warranty.voided_by} on <HoverADDate date={vehicle.warranty.voided_at?.slice(0, 10)} /></span>
          </div>
        )}
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Job Cards</div>
          {(vehicle.service_history || []).length === 0 ? (
            <p className="text-xs text-slate-400">No job cards on this vehicle.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {(vehicle.service_history || []).map(j => (
                <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs" data-testid="sold-service-row">
                  <span className="font-mono text-slate-400 shrink-0">{j.job_number}</span>
                  <span className="shrink-0 text-slate-600"><HoverADDate date={j.job_date} /></span>
                  {j.service_no
                    ? <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700">{serviceLabel(j.service_no)}</span>
                    : <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">Before sale</span>}
                  {j.is_warranty && <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-teal-100 text-teal-700">Warranty</span>}
                  <span className="text-slate-700 flex-1 min-w-[8rem] truncate">{j.work_description}</span>
                  <span className="shrink-0 capitalize text-slate-400 w-20 text-right">{j.status?.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {voiding && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setVoiding(false)}>
          <form onSubmit={submitVoid} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Void warranty</h2>
              <p className="text-xs text-slate-500">{vehicle.brand} {vehicle.model}{vehicle.registration_number ? ` · ${vehicle.registration_number}` : ""}</p>
            </div>
            <label className="block text-xs font-medium text-slate-600">
              Where / when was it serviced outside the shop?
              <textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                rows={3}
                autoFocus
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="void-reason-input"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVoiding(false)} className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={voidBusy} data-testid="confirm-void-btn" className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                {voidBusy ? "Voiding..." : "Void warranty"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
