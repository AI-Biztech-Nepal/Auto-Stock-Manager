import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Undo2, ExternalLink, Lock, Store, User } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, formatOwnership } from "../utils/helpers";
import { ReturnModal } from "./VehicleModals";
import HoverADDate from "../components/HoverADDate";
import { useAuth } from "../context/AuthContext";

const daysToSell = (v) => {
  if (!v.purchase_date || !v.sold_date) return null;
  const diff = Math.round((new Date(v.sold_date) - new Date(v.purchase_date)) / 86400000);
  return diff >= 0 ? diff : null;
};

const Row = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-2 border-b border-slate-50 last:border-0">
    <span className="text-sm text-slate-500 shrink-0">{label}</span>
    {children}
  </div>
);

export default function SoldStockDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isFrontDesk = user?.role === "stock_supervisor";
  const isPartsOnly = user?.role === "parts_supervisor";
  const hideFinancials = isFrontDesk || isPartsOnly;

  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnForm, setReturnForm] = useState({ refund_amount: "", new_status: "available", notes: "" });
  const [returning, setReturning] = useState(false);
  const [activeSale, setActiveSale] = useState(null);

  const fetchVehicle = useCallback(async () => {
    try {
      const r = await api.get(`/vehicles/${id}`);
      setVehicle(r.data);
    } catch { toast.error("Vehicle not found"); navigate("/sold-stock"); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchVehicle(); }, [fetchVehicle]);

  const openReturnModal = async () => {
    try {
      const r = await api.get(`/vehicles/${id}/active-sale`);
      setActiveSale(r.data);
      setReturnForm({ refund_amount: "", new_status: "available", notes: "" });
      setShowReturnModal(true);
    } catch (err) { toast.error(err.response?.data?.detail || "No active sale found for this vehicle"); }
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    const amt = Number(returnForm.refund_amount);
    if (returnForm.refund_amount === "" || Number.isNaN(amt) || amt < 0 || amt > (activeSale?.total_amount ?? Infinity)) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setReturning(true);
    try {
      await api.post(`/vehicles/${id}/return`, {
        refund_amount: amt,
        new_status: returnForm.new_status,
        notes: returnForm.notes || null,
      });
      toast.success("Return recorded — vehicle back in stock");
      setShowReturnModal(false);
      navigate("/sold-stock");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to record return"); }
    finally { setReturning(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!vehicle) return null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/sold-stock")} className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-lg transition-colors text-slate-500"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{vehicle.brand} {vehicle.model}</h1>
            <p className="text-sm text-slate-500">{vehicle.year} · {vehicle.engine_cc}cc · {vehicle.fuel_type}{vehicle.registration_number ? ` · ${vehicle.registration_number}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-green-100 text-green-800" data-testid="sold-status-badge">Sold</span>
          {isAdmin && vehicle.status === "sold" && (
            <button onClick={openReturnModal} className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors" data-testid="record-return-btn"><Undo2 size={14} /> Record Return</button>
          )}
        </div>
      </div>

      {/* Amount Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {[
          !hideFinancials && { label: "Purchase Price", value: formatNPR(vehicle.purchase_price) },
          { label: "Total Expenses", value: formatNPR(vehicle.total_expenses), clickable: true },
          !isPartsOnly && { label: "Selling Price", value: formatNPR(vehicle.selling_price), bold: true },
          !hideFinancials && { label: "Realized Profit", value: vehicle.expected_profit !== null ? formatNPR(vehicle.expected_profit) : "N/A", highlight: vehicle.profit_margin !== null },
        ].filter(Boolean).map(c => (
          <div
            key={c.label}
            onClick={c.clickable ? () => navigate(`/inventory/${id}`, { state: { openTab: "expenses" } }) : undefined}
            data-testid={c.clickable ? "total-expenses-card" : undefined}
            className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-w-0 ${c.clickable ? "cursor-pointer hover:border-blue-300 hover:shadow-md transition-all" : ""}`}
          >
            <div className="text-xs text-slate-500 mb-1 truncate">{c.label}</div>
            <div className={`text-lg font-bold truncate ${c.highlight ? (vehicle.low_margin ? "text-red-600" : "text-green-600") : "text-slate-900"}`} style={{ fontFamily: "Manrope" }}>{c.value}</div>
            {c.label === "Realized Profit" && vehicle.profit_margin !== null && (
              <div className={`text-xs mt-0.5 ${vehicle.low_margin ? "text-red-500" : "text-green-600"}`}>
                {vehicle.profit_margin}% margin {vehicle.low_margin ? "⚠ Low!" : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">
            <Lock size={12} /> Super Admin Only
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Total Investment</div>
              <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{formatNPR(vehicle.total_investment)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Vehicle</h3>
          <Row label="Registration"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.registration_number || "Not entered"}</span></Row>
          <Row label="Color"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.color || "—"}</span></Row>
          <Row label="Condition"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.condition || "—"}</span></Row>
          <Row label="Ownership"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatOwnership(vehicle.ownership_number)}</span></Row>
          <Row label="Purchase Source"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.purchase_source || "—"}</span></Row>
          <Row label="Name of Source">
            {vehicle.linked_contact_name ? (
              <span className="text-sm font-medium text-slate-900 sm:text-right flex items-center gap-1.5 sm:justify-end">
                {vehicle.linked_contact_type === "customer" ? <User size={13} className="text-slate-400 shrink-0" /> : <Store size={13} className="text-slate-400 shrink-0" />}
                {vehicle.linked_contact_name}
              </span>
            ) : <span className="text-sm font-medium text-slate-900 sm:text-right">—</span>}
          </Row>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Sale</h3>
          <Row label="Purchase Date"><span className="text-sm font-medium text-slate-900 sm:text-right"><HoverADDate date={vehicle.purchase_date} /></span></Row>
          <Row label="Sold Date"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.sold_date ? <HoverADDate date={vehicle.sold_date} /> : "—"}</span></Row>
          <Row label="Days to Sell"><span className="text-sm font-medium text-slate-900 sm:text-right">{daysToSell(vehicle) ?? "—"}</span></Row>
        </div>
      </div>

      {vehicle.notes && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Notes</h3>
          <p className="text-sm text-slate-600">{vehicle.notes}</p>
        </div>
      )}

      <Link to={`/inventory/${id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        Open full vehicle record (photos, documents, expenses) <ExternalLink size={13} />
      </Link>

      {showReturnModal && (
        <ReturnModal
          onClose={() => setShowReturnModal(false)}
          onSubmit={submitReturn}
          form={returnForm}
          setForm={setReturnForm}
          saving={returning}
          activeSale={activeSale}
        />
      )}
    </div>
  );
}
