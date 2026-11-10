import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Search, Trash2, Eye, TrendingUp, DollarSign, Calendar, ShoppingBag, AlertTriangle, UploadCloud, FileSpreadsheet, CheckCircle2, Undo2, BookmarkCheck, ArrowRight, Tags } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, splitSanakhatExpenses, deleteSaleConfirm, TRANSFER_STATUS_OPTIONS, getTransferStatusStyle } from "../utils/helpers";
import { getCurrentBSMonthRange } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";
import HoverADDate from "../components/HoverADDate";
import { BOOK_CARD, BookTableStyle } from "../components/BookTable";
import WarrantyBadge from "../components/WarrantyBadge";
import Bookings from "./Bookings";
import SaleVehicleModal from "./SaleVehicleModal";
import SaleDetailModal from "./SaleDetailModal";
import DateRangeFilter, { resolveDateFilter } from "../components/DateRangeFilter";
import { SOURCE_LABEL } from "../utils/crm";

function getErrMsg(err, fallback) {
  if (!err.response) return "Network error - could not reach the server";
  const detail = err.response.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  return fallback || `Server error (${err.response.status})`;
}

// Status tags from the sold vehicle's own record (what the old Sold Stock tab showed):
// returned marker, name-transfer status and warranty. Sanakhat cost has its own column.
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
  const transfer = getTransferStatusStyle(vehicle.ownership_transfer_status);
  return (
    <>
      {fromBooking}
      <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${transfer.bg} ${transfer.text}`} title="Transfer status" data-testid="sale-transfer-tag">Transfer {transfer.label}</span>
      <WarrantyBadge warranty={vehicle.warranty} />
    </>
  );
}

// Sanakhat cost = sanakhat + re-sanakhat entered on the sale. Both are extra expenses, so
// they're also inside the Extra Expenses column's total.
function sanakhatOf(sale) {
  const { sanakhat, resanakhat } = splitSanakhatExpenses(sale.extra_expenses);
  return { total: sanakhat + resanakhat, resanakhat };
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

// Profit on the sale: the vehicle's realized margin, or — once returned — what was kept.
function marginOf(sale, vehicle) {
  if (sale.returned) return sale.retained_amount ?? null;
  return vehicle?.expected_profit ?? null;
}

export default function Sales() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [sales, setSales] = useState([]);
  // Sold vehicles, keyed by id below — adds the old Sold Stock details (transfer, warranty,
  // margin, sanakhat) onto each sale row.
  const [soldVehicles, setSoldVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  // Bookings are fetched here so open ones can be converted from this page and converted ones
  // can be tagged on their sale row.
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Set via the Today/This Week/This Month toggle in the header — "all" (default) shows
  // every sale; otherwise restricts the list below to sale_date falling in that range.
  const [dateRange, setDateRange] = useState({ key: "all", custom: null }); // key "all" = off
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "sold" | "returned"
  const [showModal, setShowModal] = useState(false);

  // "Sale Vehicle" on a booking (strip below or Bookings page) opens this same sale form
  // pre-filled, with the booking kept in activeBooking.
  const [activeBooking, setActiveBooking] = useState(null);

  // Spreadsheet import ("Sales Record 20XX" workbook)
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importBusy, setImportBusy] = useState(false);

  // Admin tool: read the lead type / referrer out of existing sales' notes, review, then save the ticked ones.
  const [showNoteLeads, setShowNoteLeads] = useState(false);
  const [noteLeads, setNoteLeads] = useState(null);       // null while loading, else the sales the notes say something about
  const [noteLeadPicks, setNoteLeadPicks] = useState({}); // sale id -> ticked
  const [noteLeadsBusy, setNoteLeadsBusy] = useState(false);

  // Admin-only diagnostic: sales whose linked vehicle no longer has status "sold", or a
  // vehicle marked sold with no sale behind it.
  const [mismatches, setMismatches] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [s, sm, v] = await Promise.all([api.get("/sales"), api.get("/sales/summary"), api.get("/vehicles?status=sold")]);
      setSales(s.data); setSummary(sm.data); setSoldVehicles(v.data);
      api.get("/bookings").then(r => setBookings(r.data)).catch(() => {});
    } catch { toast.error("Failed to load sales"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/sales/reconcile").then(r => setMismatches(r.data.mismatches)).catch(() => {});
  }, [isAdmin, sales]);

  const openBookings = useMemo(() => bookings.filter(b => b.status === "active"), [bookings]);
  const bookingBySaleId = useMemo(() => Object.fromEntries(bookings.filter(b => b.sale_id).map(b => [b.sale_id, b])), [bookings]);
  const vehicleById = useMemo(() => Object.fromEntries(soldVehicles.map(v => [v.id, v])), [soldVehicles]);

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

  const openModal = (booking = null) => { setActiveBooking(booking); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setActiveBooking(null); };

  // Arrived from the Bookings page (/sales?booking=ID): open the sale form for that booking
  // once bookings have loaded, then drop the param so a refresh doesn't reopen it.
  const tabParam = new URLSearchParams(location.search).get("tab");
  const tab = tabParam === "bookings" ? "bookings" : "sales";
  const setTab = (t) => navigate(t === "sales" ? "/sales" : `/sales?tab=${t}`, { replace: true });
  const bookingParam = new URLSearchParams(location.search).get("booking");
  useEffect(() => {
    if (!bookingParam || loading) return;
    navigate(location.pathname, { replace: true });
    api.get("/bookings").then(r => {
      const b = r.data.find(x => x.id === bookingParam && x.status === "active");
      if (b) openModal(b); else toast.error("That booking is no longer open");
    }).catch(() => toast.error("Failed to load booking"));
  }, [bookingParam, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const openNoteLeads = async () => {
    setShowNoteLeads(true); setNoteLeads(null);
    try {
      const rows = (await api.get("/crm/sale-notes-leads")).data.rows;
      setNoteLeads(rows);
      setNoteLeadPicks(Object.fromEntries(rows.map(r => [r.id, true])));
    } catch (err) { toast.error(getErrMsg(err, "Couldn't read the sale notes")); setShowNoteLeads(false); }
  };

  const applyNoteLeads = async () => {
    const ids = noteLeads.filter(r => noteLeadPicks[r.id]).map(r => r.id);
    if (!ids.length) return;
    setNoteLeadsBusy(true);
    try {
      const r = await api.post("/crm/sale-notes-leads", { ids });
      toast.success(`Lead details saved on ${r.data.updated} sale${r.data.updated === 1 ? "" : "s"}`);
      setShowNoteLeads(false);
      fetchAll();
    } catch (err) { toast.error(getErrMsg(err, "Couldn't save the lead details")); }
    finally { setNoteLeadsBusy(false); }
  };

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

  const filtered = sales.filter(s => {
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-1 border-b border-slate-200" data-testid="sales-tabs">
        {[{ key: "sales", label: "Sales" }, { key: "bookings", label: `Bookings${openBookings.length ? ` (${openBookings.length})` : ""}` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`sales-tab-${t.key}`}
            className={`px-4 h-10 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <Bookings key={`${sales.length}-${openBookings.length}`} embedded onRecordSale={openModal} />
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500">
            {periodRange ? `${filtered.length} sales · ${periodRange.label}` : `${sales.length} sales recorded`}
            {returnedCount > 0 && ` · ${returnedCount} returned`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={dateRange.key} custom={dateRange.custom} onChange={(key, custom) => setDateRange({ key, custom })} testid="sales-date-filter" />
          {isAdmin && (
            <button onClick={openNoteLeads} data-testid="note-leads-btn" title="Read the lead type and referrer from what was typed in each sale's notes" className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-4 py-3 rounded-lg hover:bg-slate-50 transition-all active:scale-95">
              <Tags size={16} /> Leads from Notes
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowImport(true)} data-testid="import-sales-btn" className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-4 py-3 rounded-lg hover:bg-slate-50 transition-all active:scale-95">
              <UploadCloud size={16} /> Import Sheet
            </button>
          )}
          <button onClick={() => openModal()} data-testid="new-sale-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-all active:scale-95 shadow-sm">
            <Plus size={16} /> Sale Vehicle
          </button>
        </div>
      </div>

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
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="sales-status-filter" aria-label="Show sold or returned">
          <option value="all">All sales</option>
          <option value="sold">Sold only</option>
          <option value="returned">Returned only{returnedCount ? ` (${returnedCount})` : ""}</option>
        </select>
      </div>

      {/* Open bookings — deposits waiting on the balance; Sale Vehicle opens the normal sale form pre-filled */}
      {openBookings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4" data-testid="open-bookings-strip">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-yellow-900">
              <BookmarkCheck size={16} /> {openBookings.length} open booking{openBookings.length > 1 ? "s" : ""} awaiting sale
            </div>
            <button onClick={() => setTab("bookings")} className="text-xs font-medium text-yellow-800 hover:underline">Manage bookings</button>
          </div>
          <div className="divide-y divide-yellow-100">
            {openBookings.map(b => {
              const agreed = b.agreed_price ?? b.vehicle_selling_price;
              const balance = agreed != null ? Math.max(agreed - (b.booking_amount || 0), 0) : null;
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 py-2" data-testid="open-booking-row">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{b.vehicle_info || "—"}</div>
                    <div className="text-xs text-slate-600 truncate">
                      {b.customer_name} · Deposit {formatNPR(b.booking_amount)}{balance != null && ` · Balance ${formatNPR(balance)}`}
                    </div>
                  </div>
                  <button onClick={() => openModal(b)} className="shrink-0 flex items-center gap-1.5 h-9 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium active:scale-95 transition-all">
                    Sale Vehicle <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className={BOOK_CARD}>
        <BookTableStyle />
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <ShoppingBag size={32} className="mb-2 opacity-30" />
            <p className="font-medium">{anyFilter ? "No sales match this filter" : "No sales recorded yet"}</p>
            <p className="text-xs mt-1 text-slate-400">{anyFilter ? "Try clearing the search or filters" : 'Click "Sale Vehicle" to add one'}</p>
          </div>
        ) : (
          <>
            {/* Card list — phones only, avoids squeezing a wide table into a narrow viewport */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map(s => {
                const v = vehicleById[s.vehicle_id];
                const margin = marginOf(s, v);
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
                        <div className="flex items-center gap-1 flex-wrap mt-1.5"><SaleTags sale={s} vehicle={v} booking={bookingBySaleId[s.id]} /></div>
                      </div>
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="w-11 h-11 -mr-2.5 -mt-2.5 shrink-0 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-sale-btn-mobile">
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold text-green-700">{formatNPR(s.total_amount)}</span>
                      {s.returned
                        ? <span className="text-xs text-amber-700">Refunded {formatNPR(s.refund_amount || 0)}</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.payment_method}</span>}
                    </div>
                    {((s.expenses_total || 0) + (s.job_card_cost || 0)) > 0 && (
                      <div className="mt-1 text-xs text-orange-600 font-medium">+{formatNPR((s.expenses_total || 0) + (s.job_card_cost || 0))} extra expenses{s.extra_expenses?.length > 0 ? ` (${s.extra_expenses.length})` : ""}</div>
                    )}
                    {!s.returned && v && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500" data-testid="sale-transfer-mobile">
                        Transfer <TransferStatus vehicle={v} editable={isAdmin} onChange={updateTransfer} />
                        {sanakhatOf(s).total > 0 && <span className="text-orange-600 font-medium">Sanakhat {formatNPR(sanakhatOf(s).total)}</span>}
                      </div>
                    )}
                    {!s.returned && (s.due_amount > 0 ? (
                      <div className="mt-1 text-xs font-semibold text-red-600" data-testid="due-badge">Due: {formatNPR(s.due_amount)}{s.due_date && <> (by <HoverADDate date={s.due_date} />)</>}</div>
                    ) : (
                      <div className="mt-1 text-xs text-green-600">Fully Paid</div>
                    ))}
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                      <HoverADDate date={s.sale_date} />
                      {margin != null && <span className={margin < 0 || v?.low_margin ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>{s.returned ? "Kept" : "Margin"} {formatNPR(margin)}</span>}
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
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th className="text-right">Sale Price</th>
                    <th className="text-right">Extra Expenses</th>
                    <th className="text-right">Sanakhat Cost</th>
                    <th>Transfer</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Due</th>
                    <th>Payment</th>
                    <th>Date</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const v = vehicleById[s.vehicle_id];
                    const margin = marginOf(s, v);
                    const sanakhat = sanakhatOf(s);
                    return (
                      <tr
                        key={s.id}
                        data-testid="sale-row"
                        onClick={() => openSale(s)}
                        className="cursor-pointer"
                      >
                        <td className="text-gray-500">{i + 1}</td>
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
                        <td className="text-right font-medium text-gray-800 whitespace-nowrap">{formatNPR(s.sale_price)}</td>
                        <td className="text-right whitespace-nowrap">
                          {((s.expenses_total || 0) + (s.job_card_cost || 0)) > 0 ? (
                            <span className="text-orange-600 font-medium">
                              {formatNPR((s.expenses_total || 0) + (s.job_card_cost || 0))}
                              {s.extra_expenses?.length > 0 ? ` (${s.extra_expenses.length} items)` : ""}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="text-right whitespace-nowrap" title="Sanakhat + re-sanakhat entered on this sale — part of its extra expenses">
                          {sanakhat.total > 0 ? (
                            <>
                              <div className="text-orange-600 font-medium">{formatNPR(sanakhat.total)}</div>
                              {sanakhat.resanakhat > 0 && <div className="text-xs text-gray-400">incl. re-sanakhat {formatNPR(sanakhat.resanakhat)}</div>}
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap">
                          {s.returned ? <span className="text-gray-300">—</span> : <TransferStatus vehicle={v} editable={isAdmin} onChange={updateTransfer} />}
                        </td>
                        <td className="text-right font-bold text-green-700 whitespace-nowrap">{formatNPR(s.total_amount)}</td>
                        <td className="text-right font-semibold whitespace-nowrap">
                          {!s.returned && s.due_amount > 0
                            ? <span className="text-red-600">{formatNPR(s.due_amount)}</span>
                            : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td>
                          {s.returned ? (
                            <div className="text-xs text-amber-700 whitespace-nowrap">Refunded {formatNPR(s.refund_amount || 0)}</div>
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{s.payment_method}</span>
                              {s.due_amount > 0 ? (
                                <div className="mt-1 text-xs font-semibold text-red-600 whitespace-nowrap" data-testid="due-badge">Due: {formatNPR(s.due_amount)}{s.due_date && <> (by <HoverADDate date={s.due_date} />)</>}</div>
                              ) : (
                                <div className="mt-1 text-xs text-green-600">Fully Paid</div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="text-gray-500 whitespace-nowrap"><HoverADDate date={s.sale_date} /></td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={e => { e.stopPropagation(); openSale(s); }} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="View / edit sale" data-testid="view-sale-btn">
                              <Eye size={14} className="text-slate-500" />
                            </button>
                            {isAdmin && (
                              <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Delete sale" data-testid="delete-sale-btn">
                                <Trash2 size={14} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      </>
      )}

      {/* Sale Vehicle form */}
      {showModal && <SaleVehicleModal booking={activeBooking} onClose={closeModal} onSaved={fetchAll} />}

      {/* A sale's details */}
      {detailId && <SaleDetailModal saleId={detailId} onClose={() => setDetailId(null)} onChanged={fetchAll} />}

      {/* Leads from Notes modal: what the notes say, for review before anything is saved */}
      {showNoteLeads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNoteLeads(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="note-leads-modal">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Leads from Notes</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sales whose notes mention a lead type or who referred the buyer, where the sale doesn't have it yet. Untick anything that's wrong.</p>
              </div>
              <button onClick={() => setShowNoteLeads(false)} aria-label="Close" className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>

            <div className="p-4 sm:p-5 space-y-2 overflow-y-auto">
              {noteLeads === null && <div className="flex justify-center py-10"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}
              {noteLeads && noteLeads.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-10" data-testid="note-leads-empty">No sale notes mention a lead type or a referrer that isn't already filled in.</p>
              )}
              {noteLeads && noteLeads.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                    <span>{noteLeads.filter(r => noteLeadPicks[r.id]).length} of {noteLeads.length} selected</span>
                    <button type="button" onClick={() => setNoteLeadPicks(Object.fromEntries(noteLeads.map(r => [r.id, !noteLeads.every(x => noteLeadPicks[x.id])])))} className="font-semibold text-blue-600 hover:underline">
                      {noteLeads.every(r => noteLeadPicks[r.id]) ? "Untick all" : "Tick all"}
                    </button>
                  </div>
                  {noteLeads.map(r => (
                    <label key={r.id} className={`flex items-start gap-3 border rounded-xl p-3 cursor-pointer transition-colors ${noteLeadPicks[r.id] ? "border-blue-200 bg-blue-50/40" : "border-slate-200 hover:bg-slate-50"}`} data-testid="note-leads-row">
                      <input type="checkbox" checked={!!noteLeadPicks[r.id]} onChange={e => setNoteLeadPicks(p => ({ ...p, [r.id]: e.target.checked }))} className="mt-1 w-4 h-4 accent-blue-600 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {r.vehicle || "Vehicle"}{r.customer_name ? ` · ${r.customer_name}` : ""} <span className="font-normal text-slate-500">· <HoverADDate date={r.sale_date} /></span>
                        </div>
                        <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 whitespace-pre-line break-words line-clamp-3">&ldquo;{r.notes}&rdquo;</p>
                        <div className="flex flex-wrap gap-1.5">
                          {r.lead_source && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">Lead: {SOURCE_LABEL[r.lead_source] || r.lead_source}</span>}
                          {r.referred_by_name && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Referred by: {r.referred_by_name}{r.referred_by_id ? " (customer)" : ""}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </>
              )}
            </div>

            <div className="flex gap-3 p-4 sm:p-5 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowNoteLeads(false)} className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50">Close</button>
              {noteLeads && noteLeads.length > 0 && (
                <button onClick={applyNoteLeads} disabled={noteLeadsBusy || !noteLeads.some(r => noteLeadPicks[r.id])} data-testid="note-leads-save" className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                  {noteLeadsBusy ? "Saving..." : `Save (${noteLeads.filter(r => noteLeadPicks[r.id]).length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
