/**
 * BookingDetailModal.jsx — a booked vehicle's details as a pop-up over the Sales list, the way a sale's open
 * (pages/SaleDetailModal.jsx). The booking comes first (the deposit, how it was paid, when, the receipt, the price agreed),
 * then the vehicle and the customer. The booking's actions are here: Edit (the green button: it opens the Sale Vehicle form
 * filled in from the booking, and saving that makes it a sale; actions.onSell), Receipt and,
 * for admins, Cancel (the customer withdraws) and Delete. A booking the customer already cancelled opens with a Cancellation
 * section first (the amount the shop kept, what was refunded, when and why) and keeps only Receipt and Delete.
 *
 * booking: as GET /bookings returns it. actions: { onSell, onReceipt, onEdit, onWithdraw, onDelete }, each called with the
 * booking. onClose: leave the pop-up.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Printer, Trash2, Undo2, ExternalLink } from "lucide-react";
import api from "../utils/api";
import { formatNPR, formatOwnership } from "../utils/helpers";
import HoverADDate from "./HoverADDate";
import useBackdropClose from "../hooks/useBackdropClose";
import { agreedOf, BookedStatus, CancelledStatus, cancelledOn } from "./BookedRows";

const actionBtn = "flex items-center gap-1.5 px-3 py-3 rounded-lg text-sm font-medium transition-colors";

const Row = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
    <span className="text-xs text-slate-500 shrink-0">{label}</span>
    <span className="text-sm font-medium text-slate-900 sm:text-right min-w-0 break-words">{children}</span>
  </div>
);

const Card = ({ title, testid, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 min-w-0" data-testid={testid}>
    <h3 className="text-sm font-bold text-slate-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>{title}</h3>
    {children}
  </div>
);

export default function BookingDetailModal({ booking: b, isAdmin, actions, onClose }) {
  const [vehicle, setVehicle] = useState(null); // the vehicle's own record (colour, ownership, selling and cost price); the popup opens without it
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    let alive = true;
    api.get(`/vehicles/${b.vehicle_id}`).then(r => { if (alive) setVehicle(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [b.vehicle_id]);

  const agreed = agreedOf(b);
  const cancelled = b.status === "cancelled"; // the customer cancelled: what was kept is shown first, and there is nothing left to sell or edit
  const kept = b.retained_amount || 0;
  const dash = <span className="text-slate-400">—</span>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4" data-testid="booking-detail-modal" {...backdrop}>
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] overflow-y-auto">
        {/* Header + status and actions: sticky as one block, so the buttons stay reachable. */}
        <div className="sticky top-0 bg-white z-10 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3 p-4 sm:p-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{vehicle?.brand ? `${vehicle.brand} ${vehicle.model}` : b.vehicle_info || "Vehicle removed"}</h2>
              {vehicle?.registration_number && <p className="text-base font-mono font-bold text-slate-900">{vehicle.registration_number}</p>}
              <p className="text-xs text-slate-500">{vehicle ? [vehicle.year, vehicle.engine_cc && `${vehicle.engine_cc}cc`, vehicle.fuel_type].filter(Boolean).join(" · ") : ""}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
          </div>

          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-5 pb-4 sm:pb-5">
            {cancelled ? <CancelledStatus /> : <BookedStatus />}
            <div className="flex-1" />
            {!cancelled && <button onClick={() => actions.onSell(b)} data-testid="booking-record-sale-btn" className={`${actionBtn} bg-green-600 hover:bg-green-700 text-white font-semibold active:scale-95`}>Edit</button>}
            <button onClick={() => actions.onReceipt(b)} data-testid="booking-receipt-btn" className={`${actionBtn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><Printer size={14} /> Receipt</button>
            {isAdmin && !cancelled && <button onClick={() => actions.onWithdraw(b)} data-testid="booking-withdraw-btn" className={`${actionBtn} border border-amber-200 text-amber-700 hover:bg-amber-50`}><Undo2 size={14} /> Cancel</button>}
            {isAdmin && <button onClick={() => actions.onDelete(b)} data-testid="booking-delete-btn" className={`${actionBtn} border border-red-200 text-red-600 hover:bg-red-50`}><Trash2 size={14} /> Delete</button>}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* A cancelled booking: what the shop kept (its profit) and what was refunded come first */}
          {cancelled && (
            <Card title="Cancellation" testid="cancellation-details">
              <Row label="Amount Kept (profit)"><span className={`text-base font-bold ${kept > 0 ? "text-green-700" : "text-slate-500"}`} style={{ fontFamily: "Manrope, sans-serif" }}>{formatNPR(kept)}</span></Row>
              <Row label="Refunded to Customer">{formatNPR(b.refund_amount || 0)}</Row>
              <Row label="Cancelled On">{b.cancelled_at ? <HoverADDate date={cancelledOn(b)} /> : dash}</Row>
              {b.cancel_notes && <Row label="Reason">{b.cancel_notes}</Row>}
            </Card>
          )}

          {/* The booking first */}
          <Card title="Booking" testid="booking-details">
            <Row label="Booking Amount (deposit)"><span className="text-base font-bold text-green-700" style={{ fontFamily: "Manrope, sans-serif" }}>{formatNPR(b.booking_amount)}</span></Row>
            <Row label="Paid By">{b.payment_method || dash}</Row>
            <Row label="Booking Date">{b.booking_date ? <HoverADDate date={b.booking_date} /> : dash}</Row>
            {b.receipt_no != null && <Row label="Receipt No.">{b.receipt_no}</Row>}
            <Row label="Agreed Sale Price">{agreed != null ? formatNPR(agreed) : dash}</Row>
            {b.expected_sale_date && <Row label="Expected Sale Date"><HoverADDate date={b.expected_sale_date} /></Row>}
            {b.created_by && <Row label="Booked By">{b.created_by}</Row>}
            {b.notes && <Row label="Notes">{b.notes}</Row>}
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card title="Vehicle" testid="booking-vehicle-details">
              <Row label="Vehicle">{b.vehicle_info || dash}</Row>
              <Row label="Registration">{vehicle?.registration_number || dash}</Row>
              <Row label="Color">{vehicle?.color || dash}</Row>
              <Row label="Ownership">{vehicle ? formatOwnership(vehicle.ownership_number) : dash}</Row>
              <Row label="Selling Price">{vehicle?.selling_price ? formatNPR(vehicle.selling_price) : dash}</Row>
              {vehicle?.total_investment != null && <Row label="Cost Price">{formatNPR(vehicle.total_investment)}</Row>}
            </Card>
            <Card title="Customer" testid="booking-customer-details">
              <Row label="Name">{b.customer_name || dash}</Row>
              <Row label="Phone">{b.customer_contact || dash}</Row>
            </Card>
          </div>

          {b.vehicle_id && (
            <Link to={`/inventory/${b.vehicle_id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              Open full vehicle record (photos, documents, expenses) <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
