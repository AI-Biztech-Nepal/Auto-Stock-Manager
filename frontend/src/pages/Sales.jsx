import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router-dom";
import useMediaQuery from "../hooks/useMediaQuery";
import { Plus, Search, Trash2, TrendingUp, DollarSign, Calendar, ShoppingBag, AlertTriangle, UploadCloud, FileSpreadsheet, CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { peek, remember, cacheTicket } from "../utils/listCache";
import { formatNPR, deleteSaleConfirm, TRANSFER_STATUS_OPTIONS, getTransferStatusStyle } from "../utils/helpers";
import { getCurrentBSMonthRange } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";
import HoverADDate from "../components/HoverADDate";
import { BOOK_CARD, BookTableStyle } from "../components/BookTable";
import WarrantyBadge from "../components/WarrantyBadge";
import { BookedTableRow, BookedCard, CancelledTableRow, CancelledCard, cancelledOn } from "../components/BookedRows";
import BookingReceipt from "../components/BookingReceipt";
import BookingDetailModal from "../components/BookingDetailModal";
import { EditBookingModal, WithdrawBookingModal } from "../components/BookingModals";
import SaleVehicleModal from "./SaleVehicleModal";
import SaleDetailModal from "./SaleDetailModal";
import DateRangeFilter, { resolveDateFilter } from "../components/DateRangeFilter";

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

// The Status column: a sale is "Sold" (or "Returned" once the customer has given the vehicle back); a booked vehicle is
// "Booked" (see components/BookedRows.jsx).
function SaleStatus({ sale }) {
  const returned = !!sale.returned;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${returned ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`} data-testid="sale-status-tag">
      {returned ? "Returned" : "Sold"}
    </span>
  );
}

// Status tags from the sold vehicle's own record (what the old Sold Stock tab showed):
// returned marker and warranty. The name-transfer status has its own column (and line on phones).
function SaleTags({ sale, vehicle, booking }) {
  const fromBooking = booking && (
    <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-yellow-100 text-yellow-800 whitespace-nowrap" title="This sale completed a booking" data-testid="sale-booking-tag">
      Booked · {formatNPR(booking.booking_amount)}
    </span>
  );
  if (sale.returned) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-700" data-testid="sale-returned-tag">
        <Undo2 size={9} /> Returned <HoverADDate date={sale.returned_at?.slice(0, 10)} />
      </span>
    );
  }
  if (!vehicle) return fromBooking || null;
  return (
    <>
      {fromBooking}
      <WarrantyBadge warranty={vehicle.warranty} />
    </>
  );
}

// Pending / In Progress / Done name transfer. Admins flip it right in the row; everyone else just sees the pill.
function TransferStatus({ vehicle, editable, onChange }) {
  if (!vehicle) return <span className="text-slate-400">—</span>;
  const status = vehicle.ownership_transfer_status || "pending";
  const style = getTransferStatusStyle(status);
  if (!editable) {
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>;
  }
  return (
    <select
      value={status}
      onClick={e => e.stopPropagation()}
      onChange={e => onChange(vehicle, e.target.value)}
      aria-label="Transfer status"
      data-testid="transfer-status-select"
      className={`h-7 pl-2 pr-6 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${style.bg} ${style.text}`}
    >
      {TRANSFER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function Sales() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const wideScreen = useMediaQuery("(min-width: 1024px)");
  const { topbarSlot } = useOutletContext() || {}; // the app's top bar: on wide screens the page's counts and buttons sit there
  // Coming back to this page shows the last lists at once (see utils/listCache.js); fetchAll below refreshes them as always.
  const [sales, setSales] = useState(() => peek("sales:list") ?? []);
  // Sold vehicles, keyed by id below — adds the old Sold Stock details (transfer, warranty,
  // margin, sanakhat) onto each sale row.
  const [soldVehicles, setSoldVehicles] = useState(() => peek("vehicles:sold") ?? []);
  const [summary, setSummary] = useState(() => peek("sales:summary") ?? null);
  // Bookings are fetched here: the open ones are rows of the table below (status "Booked"), and the ones that became a
  // sale are tagged on their sale row.
  const [bookings, setBookings] = useState([]);
  const [reservedVehicles, setReservedVehicles] = useState([]); // the booked vehicles: their cost price shows on the booked rows
  const [viewingBookingId, setViewingBookingId] = useState(null); // the cancelled booking that was clicked: its details are open
  const [receipt, setReceipt] = useState(null);                   // the booking whose receipt is open for printing
  const [editingBooking, setEditingBooking] = useState(null);     // the booking being edited
  const [withdrawingBooking, setWithdrawingBooking] = useState(null); // the booking whose customer is backing out
  const [loading, setLoading] = useState(() => peek("sales:list") === undefined);
  const [search, setSearch] = useState("");
  // Set via the Today/This Week/This Month toggle in the header — "all" (default) shows
  // every sale; otherwise restricts the list below to sale_date falling in that range.
  const [dateRange, setDateRange] = useState({ key: "all", custom: null }); // key "all" = off
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "sold" | "returned" | "booked" | "cancelled"
  const [showModal, setShowModal] = useState(false);

  // "Sale Vehicle" on a booked row opens this same sale form pre-filled, with the booking kept in activeBooking.
  const [activeBooking, setActiveBooking] = useState(null);

  // Spreadsheet import ("Sales Record 20XX" workbook)
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importBusy, setImportBusy] = useState(false);

  // Admin-only diagnostic: sales whose linked vehicle no longer has status "sold", or a
  // vehicle marked sold with no sale behind it.
  const [mismatches, setMismatches] = useState([]);

  const fetchAll = useCallback(async () => {
    const ticket = cacheTicket();
    try {
      const [s, sm, v] = await Promise.all([api.get("/sales"), api.get("/sales/summary"), api.get("/vehicles?status=sold")]);
      remember("sales:list", s.data, ticket); remember("sales:summary", sm.data, ticket); remember("vehicles:sold", v.data, ticket);
      setSales(s.data); setSummary(sm.data); setSoldVehicles(v.data);
      api.get("/bookings").then(r => setBookings(r.data)).catch(() => {});
      api.get("/vehicles?status=reserved").then(r => setReservedVehicles(r.data)).catch(() => {});
    } catch { toast.error("Failed to load sales"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/sales/reconcile").then(r => setMismatches(r.data.mismatches)).catch(() => {});
  }, [isAdmin, sales]);

  const openBookings = useMemo(() => bookings.filter(b => b.status === "active"), [bookings]);
  // Bookings the customer cancelled: rows of the table too (the amount the shop kept is their profit).
  const cancelledBookings = useMemo(() => bookings.filter(b => b.status === "cancelled"), [bookings]);
  // Read from the live list, so the details close by themselves once the booking is sold or deleted.
  const viewingBooking = [...openBookings, ...cancelledBookings].find(b => b.id === viewingBookingId) ?? null;
  const bookingBySaleId = useMemo(() => Object.fromEntries(bookings.filter(b => b.sale_id).map(b => [b.sale_id, b])), [bookings]);
  const vehicleById = useMemo(() => Object.fromEntries(soldVehicles.map(v => [v.id, v])), [soldVehicles]);
  const reservedById = useMemo(() => Object.fromEntries(reservedVehicles.map(v => [v.id, v])), [reservedVehicles]);
  // Cost price of a row's vehicle: its overall investment (purchase price + expenses + accessories). Blank when the vehicle
  // isn't loaded (a returned sale's) or the role may not see costs.
  const costOf = (vehicleId) => (vehicleById[vehicleId] ?? reservedById[vehicleId])?.total_investment ?? null;

  // Optimistic: flip the pill straight away, roll back if the save fails.
  const updateTransfer = async (vehicle, status) => {
    const prev = vehicle.ownership_transfer_status;
    const set = (val) => setSoldVehicles(vs => vs.map(v => v.id === vehicle.id ? { ...v, ownership_transfer_status: val } : v));
    set(status);
    try {
      await api.put(`/vehicles/${vehicle.id}`, { ownership_transfer_status: status });
      toast.success(`Transfer marked ${getTransferStatusStyle(status).label}`);
    } catch {
      set(prev);
      toast.error("Couldn't update transfer status");
    }
  };

  // A sale opens as a pop-up over this list: its details as the Sale Vehicle form, with the warranty and service history of a
  // sold vehicle, and Edit, Return and Delete.
  const [detailId, setDetailId] = useState(null);
  const openSale = (s) => setDetailId(s.id);
  // A booked row opens its vehicle's details page, the same page a sold vehicle opens (/sales/vehicle/:id, SoldStockDetail). A
  // cancelled one (its vehicle is for sale again) opens the cancellation popup.
  const openBooking = (b) => (b.status === "cancelled" ? setViewingBookingId(b.id) : navigate(`/sales/vehicle/${b.vehicle_id}`));

  const openModal = (booking = null) => { setActiveBooking(booking); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setActiveBooking(null); };

  const deleteBooking = async (b) => {
    const warning = b.status === "cancelled"
      ? "Delete this cancelled booking? The amount the shop kept from it will no longer be on record."
      : "Delete this booking record? Use Cancel instead if the customer is cancelling.";
    if (!window.confirm(warning)) return;
    try {
      await api.delete(`/bookings/${b.id}`);
      toast.success("Booking deleted");
      setViewingBookingId(null);
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete booking")); }
  };

  // What the buttons in a booking's details do (components/BookingDetailModal.jsx): Sale Vehicle, Edit and Withdraw leave the
  // details and open their own form; Receipt opens over them.
  const bookingActions = {
    onSell: (b) => { setViewingBookingId(null); openModal(b); },
    onReceipt: setReceipt,
    onEdit: (b) => { setViewingBookingId(null); setEditingBooking(b); },
    onWithdraw: (b) => { setViewingBookingId(null); setWithdrawingBooking(b); },
    onDelete: deleteBooking,
  };

  const runImport = async (confirm) => {
    if (!importFile) { toast.error("Choose the spreadsheet first"); return; }
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const r = await api.post(`/sales/import?confirm=${confirm}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(r.data);
      if (r.data.committed) { toast.success(r.data.message); fetchAll(); }
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { setImportBusy(false); }
  };

  const closeImport = () => { setShowImport(false); setImportFile(null); setImportResult(null); };

  const handleDelete = async (id) => {
    if (!window.confirm(deleteSaleConfirm(sales.find(s => s.id === id)))) return;
    try {
      const r = await api.delete(`/sales/${id}`);
      toast.success(r.data?.message || "Sale deleted, vehicle restored");
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Failed to delete")); }
  };

  // The backend's this_month_sales counts by Gregorian month (sale_date.startswith AD
  // year-month), but BS months don't line up with AD month boundaries — most of a BS
  // month's sales fall in the *previous* AD month, so that count reads as far lower
  // than what the business considers "this month". Recomputed here against the actual
  // BS month's AD range instead, and generalized to the other two period tabs too.
  const periodRange = dateRange.key === "all" ? null : resolveDateFilter(dateRange.key, dateRange.custom);
  const bsMonthRange = getCurrentBSMonthRange();
  const thisMonthSalesCount = bsMonthRange
    ? sales.filter(s => s.sale_date >= bsMonthRange.start && s.sale_date <= bsMonthRange.end).length
    : summary?.this_month_sales;
  const periodSalesCount = periodRange
    ? sales.filter(s => s.sale_date >= periodRange.start && s.sale_date <= periodRange.end).length
    : thisMonthSalesCount;

  const returnedCount = sales.filter(s => s.returned).length;

  // The open bookings ("Booked") are rows above the sales, filtered the same way: the date, the search, and the status filter.
  const filteredBookings = (statusFilter === "all" || statusFilter === "booked") ? openBookings.filter(b => {
    const d = (b.booking_date || b.created_at || "").slice(0, 10);
    if (periodRange && !(d >= periodRange.start && d <= periodRange.end)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.vehicle_info || "").toLowerCase().includes(q) ||
      (b.customer_name || "").toLowerCase().includes(q) ||
      (b.customer_contact || "").toLowerCase().includes(q) ||
      (b.payment_method || "").toLowerCase().includes(q);
  }) : [];

  // The cancelled bookings, dated by the day they were cancelled, filtered the same way.
  const filteredCancelled = (statusFilter === "all" || statusFilter === "cancelled") ? cancelledBookings.filter(b => {
    const d = cancelledOn(b);
    if (periodRange && !(d >= periodRange.start && d <= periodRange.end)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.vehicle_info || "").toLowerCase().includes(q) ||
      (b.customer_name || "").toLowerCase().includes(q) ||
      (b.customer_contact || "").toLowerCase().includes(q) ||
      (b.cancel_notes || "").toLowerCase().includes(q);
  }) : [];

  const filtered = sales.filter(s => {
    if (statusFilter === "booked" || statusFilter === "cancelled") return false;
    if (statusFilter === "sold" && s.returned) return false;
    if (statusFilter === "returned" && !s.returned) return false;
    if (periodRange && !(s.sale_date >= periodRange.start && s.sale_date <= periodRange.end)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.vehicle_info || "").toLowerCase().includes(q) ||
      (s.customer_name || "").toLowerCase().includes(q) ||
      (s.registration_number || "").toLowerCase().includes(q) ||
      (s.payment_method || "").toLowerCase().includes(q);
  });
  const anyFilter = dateRange.key !== "all" || search || statusFilter !== "all";

  // The rows under the booked ones: the sales and the cancelled bookings together, newest first (a sale by when it was recorded,
  // a cancelled booking by when it was cancelled).
  const stamp = (r) => (r.type === "sale" ? r.s.created_at || r.s.sale_date || "" : r.b.cancelled_at || "");
  const tableRows = [...filtered.map(s => ({ type: "sale", s })), ...filteredCancelled.map(b => ({ type: "cancelled", b }))]
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));

  // The line under the title: how many sales, returned, booked and cancelled.
  const countsText = `${periodRange ? `${filtered.length} sales · ${periodRange.label}` : `${sales.length} sales recorded`}${returnedCount > 0 ? ` · ${returnedCount} returned` : ""}${openBookings.length > 0 ? ` · ${openBookings.length} booked` : ""}${cancelledBookings.length > 0 ? ` · ${cancelledBookings.length} cancelled` : ""}`;
  const headerButtons = (
    <>
      <DateRangeFilter value={dateRange.key} custom={dateRange.custom} onChange={(key, custom) => setDateRange({ key, custom })} testid="sales-date-filter" />
      {isAdmin && (
        <button onClick={() => setShowImport(true)} data-testid="import-sales-btn" className="flex items-center gap-1.5 h-9 px-3 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-all active:scale-95 whitespace-nowrap">
          <UploadCloud size={15} /> Import Sheet
        </button>
      )}
    </>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* The title "Sales" is in the app's top bar. On wide screens the counts, date filter and buttons are up there too (the
          counts only where there is room for them); on narrower ones they are here. */}
      {wideScreen && topbarSlot
        ? createPortal(
          <>
            <span className="hidden xl:block min-w-0 truncate text-xs text-slate-500 mr-1" data-testid="sales-counts">{countsText}</span>
            {headerButtons}
          </>,
          topbarSlot,
        )
        : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500" data-testid="sales-counts">{countsText}</p>
            <div className="flex items-center gap-2 flex-wrap">{headerButtons}</div>
          </div>
        )}

      {/* Summary Cards — the 3rd card follows the period toggle above (defaults to "This
          Month" when nothing's selected, same figure it always showed). */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {[
            { label: "Total Sales", value: summary.total_sales, icon: ShoppingBag, color: "bg-blue-500" },
            { label: "Total Revenue", value: formatNPR(summary.total_revenue), icon: TrendingUp, color: "bg-green-500" },
            { label: periodRange ? periodRange.label : "This Month", value: periodSalesCount + " sales", icon: Calendar, color: "bg-indigo-500" },
            { label: "Avg Sale Price", value: formatNPR(summary.avg_sale_price), icon: DollarSign, color: "bg-purple-500" },
          ].map(c => (
            <div
              key={c.label}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-2.5 sm:p-4 flex items-center gap-3 text-left"
            >
              <div className={`hidden sm:flex w-9 h-9 rounded-lg ${c.color} items-center justify-center shrink-0`}>
                <c.icon size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                <div className="text-sm sm:text-lg font-bold text-slate-900 leading-tight" style={{ fontFamily: "Manrope" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sales.filter(s => s.needs_review).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800" data-testid="review-alert-banner">
          <AlertTriangle size={15} className="shrink-0" />
          <span><strong>{sales.filter(s => s.needs_review).length}</strong> imported sale{sales.filter(s => s.needs_review).length !== 1 ? "s" : ""} might need attention — look for the amber “Review” tag below, check each, then mark it reviewed.</span>
        </div>
      )}

      {isAdmin && mismatches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4" data-testid="mismatch-alert-banner">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-2">
            <AlertTriangle size={16} />
            Sale Records Out of Sync ({mismatches.length})
          </div>
          <p className="text-xs text-amber-700 mb-2">
            Either a sale's vehicle no longer has status "Sold" (edited or deleted directly from Inventory), or a vehicle is marked "Sold" with no sale record behind it. Open each and reconcile: restore the vehicle's status, delete the stray sale, or record the missing sale.
          </p>
          <div className="space-y-1.5">
            {mismatches.map(m => (
              <div key={m.sale_id || m.vehicle_id} onClick={() => (m.sale_id ? openSale({ id: m.sale_id }) : navigate(`/inventory/${m.vehicle_id}`))} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white hover:bg-amber-100 cursor-pointer transition-colors">
                <div className="text-slate-700">
                  {m.issue === "orphan_sold_vehicle"
                    ? `${m.vehicle_info || "Vehicle"} — marked Sold on ${m.sale_date}, no sale record`
                    : `${m.vehicle_info || "Vehicle deleted"} — ${formatNPR(m.total_amount)} on ${m.sale_date}`}
                </div>
                <div className="flex items-center gap-3 font-semibold text-amber-700">
                  {m.issue === "vehicle_deleted" ? "Vehicle deleted"
                    : m.issue === "orphan_sold_vehicle" ? "Missing sale record"
                    : `Vehicle is now "${m.vehicle_status}"`}
                  {m.issue === "vehicle_status_mismatch" && (
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        try {
                          await api.post(`/sales/${m.sale_id}/resync-vehicle`);
                          setMismatches(prev => prev.filter(x => x.sale_id !== m.sale_id));
                        } catch (err) { alert(err?.response?.data?.detail || "Could not fix"); }
                      }}
                      className="text-xs px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
                      data-testid="mismatch-fix-btn"
                    >Mark vehicle Sold</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters — sticky so they stay reachable while scrolling a long list */}
      <div className="sm:sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 flex flex-wrap items-start gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[14rem] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, reg#, customer..." className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sales-search" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sales-status-filter" aria-label="Filter by status">
          <option value="all">All</option>
          <option value="sold">Sold only</option>
          <option value="returned">Returned only{returnedCount ? ` (${returnedCount})` : ""}</option>
          <option value="booked">Booked only{openBookings.length ? ` (${openBookings.length})` : ""}</option>
          <option value="cancelled">Cancelled only{cancelledBookings.length ? ` (${cancelledBookings.length})` : ""}</option>
        </select>
        <button onClick={() => openModal()} data-testid="new-sale-btn" className="ml-auto flex items-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all active:scale-95 shadow-sm whitespace-nowrap">
          <Plus size={16} /> Sale Vehicle
        </button>
      </div>

      {/* Sales Table: the open bookings come first, each with the status "Booked"; a sale has no status here */}
      <div className={BOOK_CARD}>
        <BookTableStyle />
        {tableRows.length === 0 && filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <ShoppingBag size={32} className="mb-2 opacity-30" />
            <p className="font-medium">{anyFilter ? "No sales match this filter" : "No sales recorded yet"}</p>
            <p className="text-xs mt-1 text-slate-400">{anyFilter ? "Try clearing the search or filters" : 'Click "Sale Vehicle" to add one'}</p>
          </div>
        ) : (
          <>
            {/* Card list — phones only, avoids squeezing a wide table into a narrow viewport */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filteredBookings.map(b => <BookedCard key={b.id} b={b} cost={costOf(b.vehicle_id)} onOpen={openBooking} />)}
              {tableRows.map(row => {
                if (row.type === "cancelled") return <CancelledCard key={row.b.id} b={row.b} onOpen={openBooking} />;
                const s = row.s;
                const v = vehicleById[s.vehicle_id];
                const cost = costOf(s.vehicle_id);
                return (
                  <div
                    key={s.id}
                    data-testid="sale-row-mobile"
                    onClick={() => openSale(s)}
                    className="p-4 active:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate">{s.vehicle_info || "—"}
                          {s.needs_review && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><AlertTriangle size={9} /> Review</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{s.customer_name}{s.customer_contact ? ` · ${s.customer_contact}` : ""}</div>
                        <div className="flex items-center gap-1 flex-wrap mt-1.5"><SaleStatus sale={s} /><SaleTags sale={s} vehicle={v} booking={bookingBySaleId[s.id]} /></div>
                      </div>
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="w-11 h-11 -mr-2.5 -mt-2.5 shrink-0 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-sale-btn-mobile">
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {s.profit != null
                        ? <span className={`text-sm font-bold ${s.profit < 0 ? "text-red-600" : "text-green-700"}`} data-testid="sale-profit-mobile"><span className="text-xs font-medium text-slate-400">Profit </span>{formatNPR(s.profit)}</span>
                        : <span className="text-sm font-bold text-green-700"><span className="text-xs font-medium text-slate-400">Sale price </span>{formatNPR(s.sale_price)}</span>}
                      {s.returned
                        ? <span className="text-xs text-amber-700">Refunded {formatNPR(s.refund_amount || 0)}</span>
                        : s.due_amount > 0
                          ? <span className="text-xs font-semibold text-red-600" data-testid="sale-dues-mobile">Dues {formatNPR(s.due_amount)}</span>
                          : <span className="text-xs font-medium text-green-600">No dues</span>}
                    </div>
                    {cost != null && <div className="mt-1 text-xs text-slate-500" data-testid="sale-cost-mobile">Cost price <span className="font-semibold text-slate-700">{formatNPR(cost)}</span></div>}
                    {!s.returned && v && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500" data-testid="sale-transfer-mobile">
                        Transfer <TransferStatus vehicle={v} editable={isAdmin} onChange={updateTransfer} />
                      </div>
                    )}
                    <div className="mt-1.5 text-xs text-slate-400">
                      <HoverADDate date={s.sale_date} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table — sm and up */}
            {/* Bounded height so the sideways scrollbar sits at the bottom of the screen, not the end of a long list */}
            <div className="hidden sm:block overflow-auto max-h-[calc(100vh-16rem)]">
              <table className="sticky-head">
                <thead>
                  <tr>
                    <th className="w-10">SN</th>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>Transfer</th>
                    <th className="text-right">Sale Price</th>
                    <th className="text-right" title="The vehicle's overall cost: purchase price + expenses + accessories">Cost Price</th>
                    <th className="text-right" title="What the sale earned: the sale price less the vehicle's overall cost (what was kept, for a returned sale)">Profit</th>
                    <th className="text-right" title="What the customer still owes on the sale (for a booked vehicle: the agreed price less the deposit)">Dues</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b, i) => <BookedTableRow key={b.id} b={b} index={i + 1} cost={costOf(b.vehicle_id)} onOpen={openBooking} />)}
                  {tableRows.map((row, i) => {
                    if (row.type === "cancelled") return <CancelledTableRow key={row.b.id} b={row.b} index={filteredBookings.length + i + 1} onOpen={openBooking} />;
                    const s = row.s;
                    const v = vehicleById[s.vehicle_id];
                    const cost = costOf(s.vehicle_id);
                    return (
                      <tr
                        key={s.id}
                        data-testid="sale-row"
                        onClick={() => openSale(s)}
                        className="cursor-pointer"
                      >
                        <td className="text-gray-500">{filteredBookings.length + i + 1}</td>
                        <td className="text-gray-500 whitespace-nowrap"><HoverADDate date={s.sale_date} /></td>
                        <td className="min-w-[12rem]">
                          <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                            {s.vehicle_info || "—"}
                            {s.needs_review && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full" title={s.review_note || "Imported — might need attention"}><AlertTriangle size={9} /> Review</span>}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap mt-1"><SaleTags sale={s} vehicle={v} booking={bookingBySaleId[s.id]} /></div>
                        </td>
                        <td>
                          <div className="text-gray-700">{s.customer_name}</div>
                          {s.customer_contact && <div className="text-xs text-gray-400">{s.customer_contact}</div>}
                        </td>
                        <td className="whitespace-nowrap">
                          {s.returned ? <span className="text-gray-300">—</span> : <TransferStatus vehicle={v} editable={isAdmin} onChange={updateTransfer} />}
                        </td>
                        <td className="text-right font-medium text-gray-800 whitespace-nowrap">{formatNPR(s.sale_price)}</td>
                        <td className="text-right font-medium text-gray-800 whitespace-nowrap" data-testid="sale-cost-price">{cost != null ? formatNPR(cost) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-right font-bold whitespace-nowrap" data-testid="sale-profit">
                          {s.profit != null ? <span className={s.profit < 0 ? "text-red-600" : "text-green-700"}>{formatNPR(s.profit)}</span> : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="text-right whitespace-nowrap" data-testid="sale-dues">
                          {s.returned ? (
                            <>
                              <span className="text-gray-300">—</span>
                              <div className="text-xs text-amber-700">Refunded {formatNPR(s.refund_amount || 0)}</div>
                            </>
                          ) : s.due_amount > 0 ? (
                            <>
                              <span className="font-semibold text-red-600">{formatNPR(s.due_amount)}</span>
                              {s.due_date && <div className="text-xs text-gray-400">by <HoverADDate date={s.due_date} /></div>}
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td><SaleStatus sale={s} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Sale Vehicle form */}
      {showModal && <SaleVehicleModal booking={activeBooking} onClose={closeModal} onSaved={fetchAll} />}

      {/* A booked row's details, and its receipt, edit and withdraw (these open over the details or in place of them) */}
      {viewingBooking && <BookingDetailModal booking={viewingBooking} isAdmin={isAdmin} actions={bookingActions} onClose={() => setViewingBookingId(null)} />}
      <BookingReceipt booking={receipt} onClose={() => setReceipt(null)} />
      {editingBooking && <EditBookingModal booking={editingBooking} onClose={() => setEditingBooking(null)} onSaved={fetchAll} />}
      {withdrawingBooking && <WithdrawBookingModal booking={withdrawingBooking} onClose={() => setWithdrawingBooking(null)} onSaved={fetchAll} />}

      {/* A sale's details */}
      {detailId && <SaleDetailModal saleId={detailId} onClose={() => setDetailId(null)} onChanged={fetchAll} />}

      {/* Import Sheet modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeImport}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="import-sales-modal">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Import Sales Sheet</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your "Sales Record" workbook — .xlsx or .csv</p>
              </div>
              <button onClick={closeImport} className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl h-32 cursor-pointer transition-colors">
                {importFile ? (
                  <>
                    <FileSpreadsheet size={24} className="text-blue-600" />
                    <span className="text-sm font-medium text-slate-800">{importFile.name}</span>
                    <span className="text-xs text-slate-400">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={24} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">Choose the spreadsheet</span>
                  </>
                )}
                <input type="file" accept=".xlsx,.csv" className="hidden" data-testid="import-sales-file"
                  onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); }} />
              </label>

              <p className="text-xs text-slate-400">
                Each row is matched to a vehicle already in Inventory by registration number. Rows with no match, or whose vehicle already has a sale, are skipped — so you can re-upload the same file any time.
              </p>

              {importResult && (
                <div className="space-y-3" data-testid="import-sales-result">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Will import", value: importResult.to_import, cls: "bg-green-50 text-green-700 border-green-100" },
                      { label: "Need attention", value: importResult.flagged_for_review || 0, cls: (importResult.flagged_for_review || 0) > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Not in Inventory", value: importResult.skipped_not_in_inventory, cls: "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Already recorded", value: importResult.skipped_already_recorded, cls: "bg-slate-50 text-slate-600 border-slate-100" },
                      { label: "Unreadable", value: importResult.errors, cls: importResult.errors > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-slate-50 text-slate-600 border-slate-100" },
                    ].map(s => (
                      <div key={s.label} className={`border rounded-lg p-2.5 text-center ${s.cls}`}>
                        <div className="text-xl font-bold" style={{ fontFamily: "Manrope" }}>{s.value}</div>
                        <div className="text-xs mt-0.5 leading-tight">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {importResult.committed ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <CheckCircle2 size={15} /> {importResult.message}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">{importResult.message}</p>
                  )}

                  {importResult.row_errors?.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unreadable rows — skipped</p>
                      {importResult.row_errors.map((e, i) => (
                        <div key={i} className="text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1 text-amber-700">
                          <span className="font-semibold">{e.sheet} row {e.row}</span> ({e.sale}): {e.reason}
                        </div>
                      ))}
                    </div>
                  )}

                  {!importResult.committed && importResult.sample_import?.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Preview ({importResult.sample_import.length} of {importResult.to_import})</p>
                      {importResult.sample_import.map((r, i) => (
                        <div key={i} className={`text-xs border rounded px-2 py-1 flex justify-between gap-2 ${r.review_note ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
                          <span className="truncate">{r.sale} · {r.customer}{r.returned ? " · returned" : ""}{r.review_note ? ` · ⚠ ${r.review_note}` : ""}</span>
                          <span className="text-slate-500 shrink-0">{formatNPR(r.price)}{r.due > 0 ? ` (due ${formatNPR(r.due)})` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 sm:p-5 border-t border-slate-100 shrink-0">
              <button onClick={closeImport} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50">Close</button>
              {importResult && !importResult.committed && importResult.to_import > 0 ? (
                <button onClick={() => runImport(true)} disabled={importBusy} data-testid="import-sales-confirm" className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {importBusy ? "Importing..." : `Confirm Import (${importResult.to_import})`}
                </button>
              ) : (
                <button onClick={() => runImport(false)} disabled={!importFile || importBusy} data-testid="import-sales-check" className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {importBusy ? "Checking..." : "Check File"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
