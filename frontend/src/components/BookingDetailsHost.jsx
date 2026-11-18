/**
 * BookingDetailsHost.jsx — a booking's details popup (components/BookingDetailModal.jsx) together with everything its buttons
 * open, for a page that has no booking handling of its own (the Dashboard): Edit opens the Sale Vehicle form filled in from the
 * booking, Receipt the printable receipt, Cancel the cancel dialog, Delete asks first. The Sales page wires the same pieces
 * itself.
 *
 * booking: as GET /bookings returns it (null shows nothing). isAdmin: Cancel and Delete are for admins. onClose: leave it
 * all. onChanged: the booking was sold, cancelled or deleted, so the page behind should reload.
 */
import { useState } from "react";
import { toast } from "sonner";
import api from "../utils/api";
import BookingDetailModal from "./BookingDetailModal";
import BookingReceipt from "./BookingReceipt";
import { WithdrawBookingModal } from "./BookingModals";
import SaleVehicleModal from "../pages/SaleVehicleModal";

export default function BookingDetailsHost({ booking, isAdmin, onClose, onChanged }) {
  const [view, setView] = useState("details"); // "details" | "sale" | "cancel"
  const [receipt, setReceipt] = useState(null);
  if (!booking) return null;

  const deleteBooking = async (b) => {
    const warning = b.status === "cancelled"
      ? "Delete this cancelled booking? The amount the shop kept from it will no longer be on record."
      : "Delete this booking record? Use Cancel instead if the customer is cancelling.";
    if (!window.confirm(warning)) return;
    try {
      await api.delete(`/bookings/${b.id}`);
      toast.success("Booking deleted");
      onChanged?.();
      onClose();
    } catch (err) { toast.error(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Failed to delete booking"); }
  };

  if (view === "sale") return <SaleVehicleModal booking={booking} onClose={onClose} onSaved={() => onChanged?.()} />;
  if (view === "cancel") return <WithdrawBookingModal booking={booking} onClose={onClose} onSaved={() => onChanged?.()} />;
  return (
    <>
      <BookingDetailModal
        booking={booking}
        isAdmin={isAdmin}
        actions={{ onSell: () => setView("sale"), onReceipt: setReceipt, onEdit: () => {}, onWithdraw: () => setView("cancel"), onDelete: deleteBooking }}
        onClose={onClose}
      />
      <BookingReceipt booking={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
