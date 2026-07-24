import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Eye, Trash2, Filter, X, UploadCloud, EyeOff, Package, Wallet, DollarSign, Lock, Moon, Archive } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, getAgingStyle, getStatusStyle, BRANDS, VEHICLE_STATUS_OPTIONS, formatOwnership } from "../utils/helpers";
import { AddVehicleModal } from "./AddVehicleModal";
import HoverADDate from "../components/HoverADDate";
import BSDatePicker from "../components/BSDatePicker";
import { formatBSDate } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";
import { hasFullVehicleAccess } from "../utils/permissions";

// Sold vehicles get their own archive (Sold Stock page) rather than sitting in the active
// pipeline grid, so "sold" is left out of this page's status filter entirely.
const STATUSES = ["all", ...VEHICLE_STATUS_OPTIONS.filter(o => o.value !== "sold").map(o => o.value)];
const AGING_CATEGORIES = ["all", "fresh", "normal", "slow", "dead"];
const AGING_RANGES = { fresh: "0–30 days", normal: "31–45 days", slow: "46–60 days", dead: "60+ days" };

// Orders active stock newest first (most recently added). Scrap is a "do not disturb" stage —
// it's excluded from that ordering and always pinned to the bottom, regardless of how many days
// it has sat there.
const sortStock = (a, b) => {
  const aScrap = a.status === "scrap";
  const bScrap = b.status === "scrap";
  if (aScrap !== bScrap) return aScrap ? 1 : -1;
  return (a.aging?.days ?? 0) - (b.aging?.days ?? 0);
};

const EMPTY = {
  brand: "", model: "", year: new Date().getFullYear(), engine_cc: 125, fuel_type: "Petrol", vehicle_type: "bike",
  ownership_number: 1, purchase_price: "", purchase_date: "", purchase_source: "", purchase_from: "",
  vendor_id: null, condition: "Good", color: "", registration_number: "", selling_price: "", notes: "", status: "unlisted",
  bluebook_status: "pending", insurance_status: "pending", tax_clearance_status: "pending", transfer_status: "pending"
};

export default function Inventory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !user?.role || user.role === "admin";
  const isFrontDesk = user?.role === "stock_supervisor";
  const isPartsOnly = user?.role === "parts_supervisor";
  const hideFinancials = isFrontDesk || isPartsOnly;
  const canManageStock = hasFullVehicleAccess(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("aging") ? "available" : "all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState(searchParams.get("aging") || "all");
  const [dateFilter, setDateFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [hidingUnpriced, setHidingUnpriced] = useState(false);

  const unpricedVisible = vehicles.filter(v => !v.selling_price && !["sold", "unlisted", "hidden", "scrap", "in_repair"].includes(v.status));
  const totalInvestment = filtered.reduce((sum, v) => sum + (v.total_investment || 0), 0);
  const totalSellingPrice = filtered.reduce((sum, v) => sum + (v.selling_price || 0), 0);
  const lockedCapital = filtered.filter(v => v.status === "available").reduce((sum, v) => sum + (v.total_investment || 0), 0);

  const hideUnpriced = async () => {
    if (unpricedVisible.length === 0) return;
    if (!window.confirm(`Move ${unpricedVisible.length} vehicle(s) with no selling price to Unlisted?`)) return;
    setHidingUnpriced(true);
    try {
      const results = await Promise.allSettled(unpricedVisible.map(v => api.put(`/vehicles/${v.id}`, { status: "unlisted" })));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) toast.error(`Moved ${results.length - failed} vehicle(s), ${failed} failed`);
      else toast.success(`Moved ${results.length} vehicle(s) to Unlisted`);
      fetchVehicles();
    } finally { setHidingUnpriced(false); }
  };

  const clearStagedPhotos = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  const fetchVehicles = useCallback(async () => {
    try {
      const r = await api.get("/vehicles");
      setVehicles(r.data);
      // One-time migration: "hidden" was renamed to "unlisted" — silently carry over any leftover legacy records.
      const legacyHidden = r.data.filter(v => v.status === "hidden");
      if (legacyHidden.length > 0) {
        await Promise.allSettled(legacyHidden.map(v => api.put(`/vehicles/${v.id}`, { status: "unlisted" })));
        const r2 = await api.get("/vehicles");
        setVehicles(r2.data);
      }
    } catch { toast.error("Failed to load vehicles"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  useEffect(() => {
    // Sold vehicles live in the Sold Stock archive, not the active inventory grid.
    let result = vehicles.filter(v => v.status !== "sold");

    if (statusFilter !== "all") result = result.filter(v => v.status === statusFilter);
    if (agingFilter !== "all") result = result.filter(v => v.aging?.category === agingFilter);
    if (brandFilter !== "all") result = result.filter(v => v.brand === brandFilter);
    if (dateFilter) result = result.filter(v => v.created_at?.slice(0, 10) === dateFilter);
    if (search) {
      const q = search.toLowerCase();
      const qNoSlash = q.replace(/\//g, "");
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash) ||
        v.purchase_source?.toLowerCase().includes(q)
      );
    }

    result.sort(sortStock);

    setFiltered(result);
  }, [vehicles, search, statusFilter, brandFilter, agingFilter, dateFilter]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.brand || !form.model || !form.purchase_price || !form.purchase_date || !form.purchase_source || !form.registration_number) {
      toast.error("Please fill all required fields"); return;
    }
    setSaving(true);
    try {
      const r = await api.post("/vehicles", {
        ...form,
        purchase_price: Number(form.purchase_price),
        selling_price: form.selling_price ? Number(form.selling_price) : null,
        year: Number(form.year),
        engine_cc: Number(form.engine_cc),
        ownership_number: Number(form.ownership_number)
      });
      if (photos.length > 0) {
        const results = await Promise.allSettled(photos.map(p => {
          const fd = new FormData(); fd.append("file", p.file);
          return api.post(`/vehicles/${r.data.id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }));
        if (results.some(res => res.status === "rejected")) toast.error("Vehicle saved, but some photos failed to upload");
      }
      toast.success("Vehicle added successfully!");
      setShowModal(false);
      setForm(EMPTY);
      clearStagedPhotos();
      fetchVehicles();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this vehicle and all related data?")) return;
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success("Vehicle deleted");
      fetchVehicles();
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">{filtered.length} vehicles found</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageStock && (
            <button
              onClick={() => navigate("/sold-stock")}
              data-testid="sold-stock-link"
              className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-all active:scale-95"
            >
              <Archive size={16} /> Sold Stock
            </button>
          )}
          {canManageStock && unpricedVisible.length > 0 && (
            <button
              onClick={hideUnpriced}
              disabled={hidingUnpriced}
              data-testid="hide-unpriced-button"
              className="flex items-center gap-2 border border-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-60"
            >
              <EyeOff size={16} /> {hidingUnpriced ? "Moving..." : `Move ${unpricedVisible.length} With No Price To Unlisted`}
            </button>
          )}
          {canManageStock && (
            <button
              onClick={() => { setForm(EMPTY); setShowModal(true); }}
              data-testid="add-vehicle-button"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm"
            >
              <Plus size={16} /> Add Vehicle
            </button>
          )}
        </div>
      </div>

      {/* Active Aging Filter Banner */}
      {agingFilter !== "all" && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border ${getAgingStyle(agingFilter).bg} ${getAgingStyle(agingFilter).border} ${getAgingStyle(agingFilter).text}`} data-testid="aging-filter-banner">
          <span>
            Showing: <strong>{getAgingStyle(agingFilter).label} ({AGING_RANGES[agingFilter]})</strong>
          </span>
          <button
            data-testid="clear-aging-filter"
            onClick={() => { setAgingFilter("all"); setSearchParams({}); }}
            className="flex items-center gap-1 ml-3 hover:opacity-70 transition-opacity"
          >
            <X size={14} /> Clear filter
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand, model, reg#..."
            className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            data-testid="status-filter-select"
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s === "all" ? "All Status" : getStatusStyle(s).label}</option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Brands</option>
            {BRANDS.map(b => <option key={b}>{b}</option>)}
          </select>
          <select
            value={agingFilter}
            onChange={e => {
              const val = e.target.value;
              setAgingFilter(val);
              if (val === "all") setSearchParams({});
              else setSearchParams({ aging: val });
            }}
            data-testid="aging-filter-select"
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {AGING_CATEGORIES.map(a => (
              <option key={a} value={a}>{a === "all" ? "All Stock Age" : `${getAgingStyle(a).label} (${AGING_RANGES[a]})`}</option>
            ))}
          </select>
          <div className="w-44" data-testid="date-filter-input">
            <BSDatePicker value={dateFilter} onChange={setDateFilter} />
          </div>
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              data-testid="clear-date-filter"
              className="flex items-center gap-1 h-9 px-2.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Clear date filter"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Vehicles", value: filtered.length, icon: Package, color: "bg-blue-500" },
            !hideFinancials && { label: "Total Investment", value: formatNPR(totalInvestment), icon: Wallet, color: "bg-indigo-500" },
            !hideFinancials && { label: "Locked Capital", value: formatNPR(lockedCapital), icon: Lock, color: "bg-purple-500" },
            !isPartsOnly && { label: "Total Selling Price", value: formatNPR(totalSellingPrice), icon: DollarSign, color: "bg-green-500" },
          ].filter(Boolean).map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center shrink-0`}>
                <c.icon size={16} className="text-white" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vehicle Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-48 text-slate-500" data-testid="empty-state">
          <p className="font-medium">
            {agingFilter !== "all"
              ? `No ${getAgingStyle(agingFilter).label.toLowerCase()} (${AGING_RANGES[agingFilter]}) vehicles found`
              : dateFilter
                ? `No stock entered on ${formatBSDate(dateFilter)} BS`
                : "No vehicles found"}
          </p>
          <p className="text-sm mt-1">
            {agingFilter !== "all"
              ? "No vehicles fall into this stock age range right now."
              : search || statusFilter !== "all" || brandFilter !== "all" || dateFilter
                ? "Try adjusting your filters"
                : "Add your first vehicle to get started"}
          </p>
          {agingFilter !== "all" && (
            <button
              onClick={() => { setAgingFilter("all"); setSearchParams({}); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
              data-testid="empty-clear-filter"
            >
              View all vehicles
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => {
            const ag = getAgingStyle(v.aging?.category);
            const st = getStatusStyle(v.status);
            const showFinRow = !hideFinancials || !isPartsOnly;
            const isDND = v.status === "scrap";
            return (
              <div
                key={v.id}
                data-testid="vehicle-row"
                onClick={() => navigate(`/inventory/${v.id}`)}
                className={`${st.cardBg} rounded-xl border ${st.cardBorder} shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer ${isDND ? "opacity-60 saturate-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>{v.brand} {v.model}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{v.year} · {v.engine_cc}cc · {v.fuel_type} · {formatOwnership(v.ownership_number)}</div>
                    {v.registration_number && <div className="text-xs font-mono text-slate-500 mt-0.5">{v.registration_number}</div>}
                  </div>
                  <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${st.bg} ${st.text}`}>
                    {isDND && <Moon size={11} title="Do Not Disturb — snoozed" />}
                    {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  <span className="truncate">Source: <span className="font-medium text-slate-700">{v.purchase_source || "—"}</span></span>
                  <span className={`shrink-0 ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${ag.bg} ${ag.text}`}>
                    {v.aging?.days}d · {ag.label}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mb-3">Purchased: <span className="font-medium text-slate-700"><HoverADDate date={v.purchase_date} /></span></div>

                {showFinRow && (
                  <div className="flex gap-4 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 mb-3 text-xs">
                    {!hideFinancials && (
                      <div>
                        <div className="text-slate-400">Investment</div>
                        <div className="font-semibold text-slate-800">{formatNPR(v.total_investment)}</div>
                      </div>
                    )}
                    {!isPartsOnly && (
                      <div>
                        <div className="text-slate-400">Selling</div>
                        <div className="font-semibold text-slate-800">{v.selling_price ? formatNPR(v.selling_price) : "—"}</div>
                      </div>
                    )}
                    {!isPartsOnly && (
                      <div>
                        <div className="text-slate-400">Min. Selling</div>
                        <div className="font-semibold text-slate-800">{v.minimum_selling_price ? formatNPR(v.minimum_selling_price) : "—"}</div>
                      </div>
                    )}
                    {!hideFinancials && (
                      <div>
                        <div className="text-slate-400">Margin</div>
                        <div className={`font-semibold ${v.low_margin ? "text-red-600" : "text-green-600"}`}>
                          {v.profit_margin !== null && v.profit_margin !== undefined ? `${v.profit_margin}%` : "—"}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-50">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/inventory/${v.id}`); }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    data-testid="view-vehicle-btn"
                  >
                    <Eye size={15} className="text-slate-500" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={e => handleDelete(v.id, e)}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      data-testid="delete-vehicle-btn"
                    >
                      <Trash2 size={15} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import Stock */}
      {isAdmin && (
        <div className="flex justify-center">
          <button
            onClick={() => navigate("/import-stock")}
            data-testid="import-stock-btn"
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <UploadCloud size={16} /> Import Stock
          </button>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showModal && (
        <AddVehicleModal
          form={form}
          setForm={setForm}
          onClose={() => { setShowModal(false); setForm(EMPTY); clearStagedPhotos(); }}
          onSubmit={handleSave}
          saving={saving}
          photos={photos}
          setPhotos={setPhotos}
        />
      )}
    </div>
  );
}
