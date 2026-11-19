/**
 * BookedRows.jsx — a booked vehicle as a row of the Sales page's table (BookedTableRow, sm and up) or as a card on phones
 * (BookedCard). It sits in the same list as the sales, with a "Booked" status, and is clickable like a sale: it opens the
 * booking's details (components/BookingDetailModal.jsx), which is also where its actions are. A booking the customer cancelled
 * is a row too (CancelledTableRow / CancelledCard), with the status "Cancelled" and the amount the shop kept as its Profit.
 *
 * b: the booking as GET /bookings returns it. index: its SN. cost: the vehicle's overall cost price, or null. onOpen: called
 * with the booking when the row is clicked.
 */
import { formatNPR } from "../utils/helpers";
import HoverADDate from "./HoverADDate";

// What the vehicle is to be sold for: the price agreed with the customer, else the vehicle's own selling price.
export const agreedOf = (b) => b.agreed_price ?? b.vehicle_selling_price ?? null;
// What the customer still owes on it: that price less the deposit (null when no price is known).
export const duesOf = (b) => {
  const agreed = agreedOf(b);
  return agreed != null ? Math.max(agreed - (b.booking_amount || 0), 0) : null;
};

export const BookedStatus = () => (
  <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap bg-yellow-100 text-yellow-800" data-testid="booking-status-tag">Booked</span>
);

export const CancelledStatus = () => (
  <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap bg-slate-200 text-slate-700" data-testid="cancelled-status-tag">Cancelled</span>
);

const Dash = () => <span className="text-gray-300">—</span>;

// A booking the customer cancelled: it stays in the list with what the shop kept of the deposit (its profit) and what was
// refunded. The date is the day it was cancelled.
export const cancelledOn = (b) => (b.cancelled_at || "").slice(0, 10);
const keptOf = (b) => b.retained_amount || 0;

// The cells line up with the Sales table's columns: SN, Date, Vehicle, Customer, Transfer, Sale Price, Cost Price, Profit,
// Dues (the price less the deposit, with the deposit under it), Status ("Booked").
export function BookedTableRow({ b, index, cost, onOpen }) {
  const agreed = agreedOf(b);
  const dues = duesOf(b);
  return (
    <tr data-testid="booking-row" onClick={() => onOpen(b)} className="cursor-pointer">
      <td className="text-gray-500">{index}</td>
      <td className="text-gray-500 whitespace-nowrap"><HoverADDate date={b.booking_date} /></td>
      <td className="min-w-[12rem]">
        <div className="font-semibold text-gray-900">{b.vehicle_info || "—"}</div>
        {b.notes && <div className="text-xs text-gray-400 truncate max-w-[16rem] mt-1">{b.notes}</div>}
      </td>
      <td>
        <div className="text-gray-700">{b.customer_name}</div>
        {b.customer_contact && <div className="text-xs text-gray-400">{b.customer_contact}</div>}
      </td>
      <td><Dash /></td>
      <td className="text-right font-medium text-gray-800 whitespace-nowrap">{agreed != null ? formatNPR(agreed) : <Dash />}</td>
      <td className="text-right font-medium text-gray-800 whitespace-nowrap" data-testid="booking-cost-price">{cost != null ? formatNPR(cost) : <Dash />}</td>
      <td className="text-right"><Dash /></td>
      <td className="text-right whitespace-nowrap" data-testid="booking-dues">
        {dues > 0 ? <span className="font-semibold text-red-600">{formatNPR(dues)}</span> : <Dash />}
        <div className="mt-1 text-xs font-semibold text-amber-700">Deposit: {formatNPR(b.booking_amount)}</div>
      </td>
      <td><BookedStatus /></td>
    </tr>
  );
}

// A cancelled booking as a row of the table (same cells as above): the day it was cancelled, the amount kept as the Profit, and
// no dues (what was refunded, and the deposit, are under it).
export function CancelledTableRow({ b, index, onOpen }) {
  const kept = keptOf(b);
  return (
    <tr data-testid="cancelled-row" onClick={() => onOpen(b)} className="cursor-pointer">
      <td className="text-gray-500">{index}</td>
      <td className="text-gray-500 whitespace-nowrap"><HoverADDate date={cancelledOn(b)} /></td>
      <td className="min-w-[12rem]">
        <div className="font-semibold text-gray-900">{b.vehicle_info || "—"}</div>
        {b.cancel_notes && <div className="text-xs text-gray-400 truncate max-w-[16rem] mt-1">{b.cancel_notes}</div>}
      </td>
      <td>
        <div className="text-gray-700">{b.customer_name}</div>
        {b.customer_contact && <div className="text-xs text-gray-400">{b.customer_contact}</div>}
      </td>
      <td><Dash /></td>
      <td className="text-right"><Dash /></td>
      <td className="text-right"><Dash /></td>
      <td className="text-right font-bold whitespace-nowrap" data-testid="cancelled-kept">
        <span className={kept > 0 ? "text-green-700" : "text-gray-400"}>{formatNPR(kept)}</span>
      </td>
      <td className="text-right whitespace-nowrap" data-testid="cancelled-dues">
        <Dash />
        <div className="text-xs text-amber-700">Refunded {formatNPR(b.refund_amount || 0)}</div>
        <div className="mt-1 text-xs text-gray-400">Deposit: {formatNPR(b.booking_amount)}</div>
      </td>
      <td><CancelledStatus /></td>
    </tr>
  );
}

export function CancelledCard({ b, onOpen }) {
  const kept = keptOf(b);
  return (
    <div data-testid="cancelled-row-mobile" onClick={() => onOpen(b)} className="p-4 space-y-2 cursor-pointer active:bg-slate-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate">{b.vehicle_info || "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{b.customer_name}{b.customer_contact ? ` · ${b.customer_contact}` : ""}</div>
        </div>
        <CancelledStatus />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={`font-bold ${kept > 0 ? "text-green-700" : "text-slate-400"}`}><span className="text-xs font-medium text-slate-400">Kept </span>{formatNPR(kept)}</span>
        <span className="text-xs text-amber-700">Refunded {formatNPR(b.refund_amount || 0)}</span>
      </div>
      <div className="text-xs text-slate-400"><HoverADDate date={cancelledOn(b)} /></div>
    </div>
  );
}

export function BookedCard({ b, cost, onOpen }) {
  const dues = duesOf(b);
  return (
    <div data-testid="booking-row-mobile" onClick={() => onOpen(b)} className="p-4 space-y-2 cursor-pointer active:bg-slate-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate">{b.vehicle_info || "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{b.customer_name}{b.customer_contact ? ` · ${b.customer_contact}` : ""}</div>
        </div>
        <BookedStatus />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-green-700">{formatNPR(b.booking_amount)} <span className="text-xs font-normal text-slate-400">{b.payment_method} deposit</span></span>
        {dues > 0 && <span className="text-xs font-semibold text-red-600" data-testid="booking-dues-mobile">Dues {formatNPR(dues)}</span>}
      </div>
      {cost != null && <div className="text-xs text-slate-500">Cost price <span className="font-semibold text-slate-700">{formatNPR(cost)}</span></div>}
      <div className="text-xs text-slate-400"><HoverADDate date={b.booking_date} /></div>
    </div>
  );
}
