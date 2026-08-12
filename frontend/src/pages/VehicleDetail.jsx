import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit, CheckCircle, AlertCircle, Clock, QrCode, Undo2, Store, User, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR, getAgingStyle, getStatusStyle, getDocStyle, EXPENSE_CATEGORIES, VEHICLE_STATUS_OPTIONS, CONDITIONS, SOURCES, BRANDS, FUEL_TYPES, OWNERSHIP_OPTIONS, formatOwnership } from "../utils/helpers";
import { ExpenseModal, QRLabelModal, ReturnModal, Field, inp, sel } from "./VehicleModals";
import HoverADDate from "../components/HoverADDate";
import BSDatePicker from "../components/BSDatePicker";
import CustomerVendorPicker from "../components/CustomerVendorPicker";
import { useAuth } from "../context/AuthContext";
import { hasFullVehicleAccess, PARTS_ALLOWED_VEHICLE_STATUSES } from "../utils/permissions";

const DocCard = ({ label, status }) => {
  const s = getDocStyle(status);
  const icons = { ok: CheckCircle, pending: Clock, missing: AlertCircle };
  const Icon = icons[status] || Clock;
  return (
    <div className={`flex items-center gap-2.5 p-3 rounded-lg border ${s.bg} ${s.text}`}>
      <Icon size={16} />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-xs capitalize">{s.label}</div>
      </div>
    </div>
  );
};

// A backend-rejected upload (bad file type, too large, no permission) always carries
// e.response.data.detail. No response at all means the request never reached/returned
// from the API cleanly (wrong backend URL, CORS block, cold-start timeout) — surface
// that distinction instead of a generic "Upload failed" so it's actually debuggable.
const describeUploadError = (e) => {
  if (!e) return "Upload failed";
  if (e.response?.data?.detail) return e.response.data.detail;
  if (e.code === "ECONNABORTED") return "Upload timed out — server may be waking up, try again";
  if (!e.response) return `Upload failed: could not reach server (${e.message || e.code || "network error"})`;
  return `Upload failed (${e.response.status})`;
};

const Row = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-2 border-b border-slate-50">
    <span className="text-sm text-slate-500 shrink-0">{label}</span>
    {children}
  </div>
);

// Rendered either as a routed page (/inventory/:id, via the default-exported VehicleDetail
// wrapper below) or embedded directly by Inventory.jsx with local state — the latter keeps
// the Inventory page mounted underneath instead of unmounting/refetching it on open/close.
export function VehicleDetailModal({ id, onClose }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isFrontDesk = user?.role === "stock_supervisor";
  const isPartsOnly = user?.role === "parts_supervisor";
  const hideFinancials = isFrontDesk || isPartsOnly;
  const canManageStock = hasFullVehicleAccess(user?.role);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [expForm, setExpForm] = useState({ category: "servicing", amount: "", description: "", date: "" });
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnForm, setReturnForm] = useState({ refund_amount: "", new_status: "available", notes: "" });
  const [returning, setReturning] = useState(false);
  const [activeSale, setActiveSale] = useState(null);

  const fetchVehicle = useCallback(async () => {
    try {
      const r = await api.get(`/vehicles/${id}`);
      setVehicle(r.data);
      setEditForm(r.data);
    } catch { toast.error("Vehicle not found"); onClose(); }
    finally { setLoading(false); }
  }, [id, onClose]);

  useEffect(() => {
    fetchVehicle();
  }, [fetchVehicle]);

  const addExpense = async (e) => {
    e.preventDefault();
    if (!expForm.category || !expForm.amount) { toast.error("Fill required fields"); return; }
    setSaving(true);
    try {
      await api.post("/expenses", { vehicle_id: id, ...expForm, amount: Number(expForm.amount) });
      toast.success("Expense added"); setShowExpenseModal(false);
      setExpForm({ category: "servicing", amount: "", description: "", date: "" });
      fetchVehicle();
    } catch { toast.error("Failed to add expense"); } finally { setSaving(false); }
  };

  const deleteExpense = async (eid) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await api.delete(`/expenses/${eid}`); toast.success("Deleted"); fetchVehicle(); } catch { toast.error("Failed"); }
  };

  const updateStatus = async (status) => {
    try {
      await api.patch(`/vehicles/${id}/status`, { status });
      toast.success(`Status updated to ${status}`);
      fetchVehicle();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

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
      fetchVehicle();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to record return"); }
    finally { setReturning(false); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.registration_number) { toast.error("Registration Number is required"); return; }
    if (!isFrontDesk && !editForm.purchase_price) { toast.error("Purchase Price is required"); return; }
    setSaving(true);
    try {
      const payload = { ...editForm, selling_price: editForm.selling_price ? Number(editForm.selling_price) : null, year: Number(editForm.year), engine_cc: Number(editForm.engine_cc), ownership_number: Number(editForm.ownership_number) };
      if (isFrontDesk) { delete payload.purchase_price; delete payload.minimum_selling_price; delete payload.accessories_cost; }
      else { payload.purchase_price = Number(editForm.purchase_price); payload.minimum_selling_price = editForm.minimum_selling_price ? Number(editForm.minimum_selling_price) : null; }
      await api.put(`/vehicles/${id}`, payload);
      toast.success("Vehicle updated"); setIsEditing(false); fetchVehicle();
    } catch { toast.error("Failed to update"); } finally { setSaving(false); }
  };

  const cancelEdit = () => { setEditForm(vehicle); setIsEditing(false); };

  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [legalDocs, setLegalDocs] = useState([]);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const loadPhotos = useCallback(async () => {
    try { const r = await api.get(`/vehicles/${id}/photos`); setPhotos(r.data); }
    catch (err) { console.error("Failed to load photos:", err); }
  }, [id]);

  const loadDocs = useCallback(async () => {
    try { const r = await api.get(`/vehicles/${id}/legal-documents`); setLegalDocs(r.data); }
    catch (err) { console.error("Failed to load documents:", err); }
  }, [id]);

  // Shows each picked/dropped file instantly as a local blob-URL preview (a "pending"
  // photo entry), then uploads it in the background and swaps the preview for the real
  // server copy the moment that single upload resolves — so the UI never waits on the
  // network, and a slow photo doesn't hold up the others finishing first. A pending
  // count is exposed so the close button can warn before an in-flight upload is lost.
  const uploadPhotos = (files) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;
    fileList.forEach(file => {
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      setPhotos(prev => [...prev, { id: tempId, url: previewUrl, pending: true }]);

      const fd = new FormData(); fd.append("file", file);
      api.post(`/vehicles/${id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } })
        .then(r => setPhotos(prev => prev.map(p => (p.id === tempId ? r.data : p))))
        .catch(err => {
          setPhotos(prev => prev.filter(p => p.id !== tempId));
          toast.error(describeUploadError(err));
        })
        .finally(() => URL.revokeObjectURL(previewUrl));
    });
  };

  const onPhotoDragOver = (e) => { e.preventDefault(); setIsDraggingPhoto(true); };
  const onPhotoDragLeave = () => setIsDraggingPhoto(false);
  const onPhotoDrop = (e) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    if (e.dataTransfer.files?.length) uploadPhotos(e.dataTransfer.files);
  };

  const deletePhoto = async (photoId) => {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api.delete(`/vehicles/${id}/photos/${photoId}`);
      toast.success("Photo deleted");
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch { toast.error("Failed to delete photo"); }
  };

  const uploadDoc = async (file, docType) => {
    const fd = new FormData(); fd.append("file", file); fd.append("doc_type", docType);
    setUploadingDoc(true);
    try {
      await api.post(`/vehicles/${id}/legal-documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded!"); loadDocs(); fetchVehicle();
    } catch (e) { toast.error(describeUploadError(e)); }
    finally { setUploadingDoc(false); }
  };

  const deleteDoc = async (docId) => {
    if (!window.confirm("Delete this document?")) return;
    try { await api.delete(`/vehicles/${id}/legal-documents/${docId}`); loadDocs(); fetchVehicle(); toast.success("Document deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  useEffect(() => { if (id) { loadPhotos(); loadDocs(); } }, [id, loadPhotos, loadDocs]);

  const loadQR = async () => {
    try {
      const r = await api.get(`/vehicles/${id}/qr-data`);
      setQrData(r.data);
      setShowQR(true);
    } catch { toast.error("Failed to load QR"); }
  };

  const financialCards = useMemo(() => {
    if (!vehicle) return [];
    if (hideFinancials) {
      return [{ label: "Total Expenses", value: formatNPR(vehicle.total_expenses), bold: false, highlight: false }];
    }
    return [
      { label: "Purchase Price", value: formatNPR(vehicle.purchase_price), bold: false, highlight: false },
      { label: "Total Expenses", value: formatNPR(vehicle.total_expenses), bold: false, highlight: false },
      { label: "Total Investment", value: formatNPR(vehicle.total_investment), bold: true, highlight: false },
      {
        label: vehicle.status === "sold" ? "Realized Profit" : "Expected Profit",
        value: vehicle.expected_profit !== null ? formatNPR(vehicle.expected_profit) : "N/A",
        bold: false,
        highlight: vehicle.profit_margin !== null,
      },
    ];
  }, [vehicle, hideFinancials]);

  const pendingPhotoCount = photos.filter(p => p.pending).length;
  const handleClose = () => {
    if (pendingPhotoCount > 0) {
      const noun = pendingPhotoCount > 1 ? "photos are" : "photo is";
      if (!window.confirm(`${pendingPhotoCount} ${noun} still uploading. Close anyway? ${pendingPhotoCount > 1 ? "They" : "It"} won't be saved.`)) return;
    }
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!vehicle) return null;

  const ag = getAgingStyle(vehicle.aging?.category);
  const st = getStatusStyle(vehicle.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] overflow-y-auto">
        {/* Header + Status/Actions — sticky as one block so Cancel/Save Changes
           (and the other action buttons) stay reachable without scrolling back
           up, no matter how far down the form the fields go. */}
        <div className="sticky top-0 bg-white z-10 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3 p-4 sm:p-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>{vehicle.brand} {vehicle.model}</h2>
              {vehicle.registration_number && (
                <p className="text-base font-mono font-bold text-slate-900">{vehicle.registration_number}</p>
              )}
              <p className="text-xs text-slate-500">{vehicle.year} · {vehicle.engine_cc}cc · {vehicle.fuel_type}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {pendingPhotoCount > 0 && (
                <span className="hidden sm:flex items-center gap-1.5 text-xs text-blue-600 font-medium" data-testid="photo-upload-indicator">
                  <span className="animate-spin w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full" />
                  Uploading {pendingPhotoCount} photo{pendingPhotoCount > 1 ? "s" : ""}…
                </span>
              )}
              <button onClick={handleClose} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
            </div>
          </div>

          {/* Status + Actions */}
          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-5 pb-4 sm:pb-5">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${ag.bg} ${ag.text}`}>{vehicle.aging?.days}d · {ag.label}</span>
            {!isEditing && (
              <select
                value={vehicle.status}
                onChange={e => updateStatus(e.target.value)}
                disabled={!canManageStock && !PARTS_ALLOWED_VEHICLE_STATUSES.includes(vehicle.status)}
                className={`appearance-none cursor-pointer px-2.5 py-1 pr-6 rounded-full text-xs font-semibold uppercase tracking-wide border-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 ${st.bg} ${st.text}`}
                style={{ backgroundImage: "none" }}
                data-testid="vehicle-status-select"
                title={canManageStock ? "Change vehicle status" : "Parts department can move a vehicle between Available, In Repair, and Scrap"}
              >
                {/* Always include the vehicle's actual current status as an option, even if it falls
                   outside what this role can pick — otherwise a filtered <select> with no matching
                   <option> silently mis-renders (browsers show a blank/wrong label). The select is
                   disabled in that case anyway, so this can't be used to bypass the restriction. */}
                {(canManageStock ? VEHICLE_STATUS_OPTIONS : VEHICLE_STATUS_OPTIONS.filter(o => PARTS_ALLOWED_VEHICLE_STATUSES.includes(o.value) || o.value === vehicle.status)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <div className="flex-1" />
            {canManageStock && (isEditing ? (
              <>
                <button type="button" onClick={cancelEdit} className="flex items-center gap-1.5 px-3 py-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="button" onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors" data-testid="save-vehicle-btn">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            ) : (
              <button onClick={() => { setIsEditing(true); setActiveTab("overview"); }} className="flex items-center gap-1.5 px-3 py-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors" data-testid="edit-vehicle-btn"><Edit size={14} /> Edit</button>
            ))}
            {isAdmin && vehicle.status === "sold" && !isEditing && (
              <button onClick={openReturnModal} className="flex items-center gap-1.5 px-3 py-3 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors" data-testid="record-return-btn"><Undo2 size={14} /> Record Return</button>
            )}
            {!isEditing && (
              <button onClick={loadQR} className="flex items-center gap-1.5 px-3 py-3 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors" data-testid="qr-btn"><QrCode size={14} /> QR Label</button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Financial Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {financialCards.map(({ label, value, bold, highlight }) => {
              let textClass = "text-slate-900";
              if (highlight && !bold) textClass = vehicle.low_margin ? "text-red-600" : "text-green-600";
              const isExpenses = label === "Total Expenses";
              return (
                <div
                  key={label}
                  onClick={isExpenses ? () => setActiveTab("expenses") : undefined}
                  data-testid={isExpenses ? "total-expenses-card" : undefined}
                  className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${isExpenses ? "cursor-pointer hover:border-blue-300 hover:shadow-md transition-all" : ""}`}
                >
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-lg font-bold ${bold ? "text-slate-900" : textClass}`} style={{ fontFamily: "Manrope" }}>{value}</div>
                  {label.includes("Profit") && vehicle.profit_margin !== null && (
                    <div className={`text-xs mt-0.5 ${vehicle.low_margin ? "text-red-500" : "text-green-600"}`}>
                      {vehicle.profit_margin}% margin {vehicle.low_margin ? "⚠ Low!" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              {["overview", "expenses"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} data-testid={`tab-${tab}`}
                  className={`px-5 py-3.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "expenses" && (vehicle.expenses?.length > 0 || vehicle.job_cards?.length > 0) && <span className="ml-1.5 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{(vehicle.expenses?.length || 0) + (vehicle.job_cards?.length || 0)}</span>}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Overview Tab */}
              {activeTab === "overview" && (isEditing ? (
                /* Edit form — mirrors the Add Vehicle form field-for-field so nothing entered
                   at creation time is missing from editing. */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Brand" required>
                      <select data-testid="edit-brand-select" value={editForm.brand || ""} onChange={e => setEditForm({ ...editForm, brand: e.target.value })} className={sel}>
                        <option value="">Select Brand</option>
                        {BRANDS.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </Field>
                    <Field label="Model" required>
                      <input data-testid="edit-model-input" value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} placeholder="e.g. CB Shine, FZ-S" className={inp} />
                    </Field>
                    <Field label="Year" required>
                      <input data-testid="edit-year-input" type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.year || ""} onChange={e => setEditForm({ ...editForm, year: e.target.value })} placeholder="e.g. 2020" className={inp} />
                    </Field>
                    <Field label="Engine CC">
                      <input data-testid="edit-engine-cc-input" type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.engine_cc || ""} onChange={e => setEditForm({ ...editForm, engine_cc: e.target.value })} placeholder="e.g. 125" className={inp} />
                    </Field>
                    <Field label="Fuel Type">
                      <select data-testid="edit-fuel-type-select" value={editForm.fuel_type || ""} onChange={e => setEditForm({ ...editForm, fuel_type: e.target.value })} className={sel}>
                        {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </Field>
                    <Field label="Type" required>
                      <select data-testid="edit-vehicle-type-select" value={editForm.vehicle_type || "bike"} onChange={e => setEditForm({ ...editForm, vehicle_type: e.target.value })} className={sel}>
                        <option value="bike">Bike</option>
                        <option value="scooter">Scooter</option>
                      </select>
                    </Field>
                    <Field label="Ownership Number">
                      <select value={editForm.ownership_number || 1} onChange={e => setEditForm({ ...editForm, ownership_number: Number(e.target.value) })} className={sel}>
                        {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </Field>
                    {!hideFinancials && (
                      <Field label="Purchase Price (NPR)" required>
                        <input data-testid="edit-purchase-price-input" type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.purchase_price ?? ""} onChange={e => setEditForm({ ...editForm, purchase_price: e.target.value })} placeholder="e.g. 150000" className={inp} />
                      </Field>
                    )}
                    {!isPartsOnly && (
                      <Field label="Selling Price (NPR)">
                        <input data-testid="edit-selling-price-input" type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.selling_price ?? ""} onChange={e => setEditForm({ ...editForm, selling_price: e.target.value })} placeholder="e.g. 185000" className={inp} />
                      </Field>
                    )}
                    {!hideFinancials && (
                      <Field label="Minimum Selling Price (NPR)">
                        <input data-testid="edit-minimum-selling-price-input" type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.minimum_selling_price ?? ""} onChange={e => setEditForm({ ...editForm, minimum_selling_price: e.target.value })} placeholder="e.g. 170000" className={inp} />
                      </Field>
                    )}
                    <Field label="Status">
                      <select data-testid="edit-status-select" value={editForm.status || ""} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className={sel}>
                        {VEHICLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Purchase Date (BS)" required full>
                      <BSDatePicker value={editForm.purchase_date || ""} onChange={val => setEditForm({ ...editForm, purchase_date: val })} required />
                    </Field>
                    <Field label="Purchase Source" required>
                      <select value={editForm.purchase_source || ""} onChange={e => setEditForm({ ...editForm, purchase_source: e.target.value })} className={sel}>
                        <option value="">Select Source</option>
                        {SOURCES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Name of Source (Customer/Vendor)">
                      <CustomerVendorPicker
                        value={{ type: editForm.linked_contact_type || "vendor", id: editForm.linked_contact_id || null, name: editForm.linked_contact_name || "" }}
                        onChange={next => setEditForm({ ...editForm, linked_contact_type: next.type, linked_contact_id: next.id, linked_contact_name: next.name })}
                        vendorType="vehicles"
                      />
                    </Field>
                    <Field label="Condition">
                      <select value={editForm.condition || ""} onChange={e => setEditForm({ ...editForm, condition: e.target.value })} className={sel}>
                        {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Registration Number" required>
                      <input data-testid="edit-registration-number-input" value={editForm.registration_number || ""} onChange={e => setEditForm({ ...editForm, registration_number: e.target.value })} placeholder="e.g. Ba 1 Pa 1234" className={inp} />
                    </Field>
                    <Field label="Color">
                      <input value={editForm.color || ""} onChange={e => setEditForm({ ...editForm, color: e.target.value })} placeholder="e.g. Red, Black" className={inp} />
                    </Field>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    <textarea
                      value={editForm.notes || ""}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Additional notes..."
                      rows={2}
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Document Status</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[["bluebook_status", "Bluebook"], ["insurance_status", "Insurance"], ["tax_clearance_status", "Tax Clearance"], ["transfer_status", "Transfer"]].map(([key, label]) => (
                        <Field key={key} label={label}>
                          <select value={editForm[key] || "pending"} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} className={sel}>
                            <option value="pending">Pending</option>
                            <option value="ok">OK</option>
                            <option value="missing">Missing</option>
                          </select>
                        </Field>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  <Row label="Registration"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.registration_number || "Not entered"}</span></Row>
                  <Row label="Color"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.color || "Not specified"}</span></Row>
                  <Row label="Condition"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.condition}</span></Row>
                  <Row label="Purchase Source"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.purchase_source}</span></Row>
                  <Row label="Name of Source">
                    {vehicle.linked_contact_name ? (
                      <span className="text-sm font-medium text-slate-900 sm:text-right flex items-center gap-1.5 sm:justify-end">
                        {vehicle.linked_contact_type === "customer" ? <User size={13} className="text-slate-400 shrink-0" /> : <Store size={13} className="text-slate-400 shrink-0" />}
                        {vehicle.linked_contact_name}
                      </span>
                    ) : <span className="text-sm font-medium text-slate-900 sm:text-right">—</span>}
                  </Row>
                  <Row label="Ownership"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatOwnership(vehicle.ownership_number)}</span></Row>
                  <Row label="Purchase Date"><span className="text-sm font-medium text-slate-900 sm:text-right"><HoverADDate date={vehicle.purchase_date} /></span></Row>
                  {!hideFinancials && <Row label="Purchase Price"><span className="text-sm font-medium text-slate-900 sm:text-right">{formatNPR(vehicle.purchase_price)}</span></Row>}
                  {!isPartsOnly && <Row label="Selling Price"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.selling_price ? formatNPR(vehicle.selling_price) : "Not set"}</span></Row>}
                  {!hideFinancials && <Row label="Minimum Selling Price"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.minimum_selling_price ? formatNPR(vehicle.minimum_selling_price) : "Not set"}</span></Row>}
                  <Row label="Sold Date"><span className="text-sm font-medium text-slate-900 sm:text-right">{vehicle.sold_date ? <HoverADDate date={vehicle.sold_date} /> : "—"}</span></Row>
                  {vehicle.notes && (
                    <div className="col-span-1 sm:col-span-2 mt-2">
                      <div className="text-xs text-slate-500 mb-1">Notes</div>
                      <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{vehicle.notes}</div>
                    </div>
                  )}
                </div>
              ))}

              {/* Expenses Tab */}
              {activeTab === "expenses" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Total: <strong className="text-slate-900">{formatNPR(vehicle.total_expenses)}</strong></span>
                    {canManageStock && (
                      <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all active:scale-95" data-testid="add-expense-btn">
                        <Plus size={14} /> Add Expense
                      </button>
                    )}
                  </div>
                  {vehicle.expenses?.length === 0 && vehicle.job_cards?.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">No expenses recorded yet</div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {vehicle.expenses?.map(exp => {
                        const catLabel = EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || exp.category;
                        return (
                          <div key={exp.id} data-testid="expense-row" className="flex items-center justify-between py-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{catLabel}</div>
                              <div className="text-xs text-slate-500">{exp.description || "—"} · {exp.date?.slice(0,10)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-900">{formatNPR(exp.amount)}</span>
                              {canManageStock && (
                                <button onClick={() => deleteExpense(exp.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {/* Job cards contribute to the vehicle's expense total too (actual_cost once
                         completed, otherwise the estimate) — listed read-only here since they're
                         managed from the Job Cards page, not this modal. */}
                      {vehicle.job_cards?.map(job => (
                        <div key={job.id} data-testid="job-card-expense-row" className="flex items-center justify-between py-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                              {job.work_description}
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-700">Job Card</span>
                              {job.status !== "completed" && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700">Estimate</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{job.job_number} · {job.mechanic_name}</div>
                          </div>
                          <span className="font-semibold text-slate-900">{formatNPR(job.actual_cost ?? job.estimated_cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Photos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid="photos-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Vehicle Photos</h2>
            </div>
            {photos.length === 0 ? (
              canManageStock ? (
                <label
                  onDragOver={onPhotoDragOver}
                  onDragLeave={onPhotoDragLeave}
                  onDrop={onPhotoDrop}
                  data-testid="upload-photo-btn"
                  className={`border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDraggingPhoto ? "border-blue-400 bg-blue-50 text-blue-500" : "border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-400"}`}
                >
                  <p className="text-sm font-medium">No photos yet</p>
                  <p className="text-xs mt-0.5">Click or drop photos to upload</p>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files.length) uploadPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl h-32 flex flex-col items-center justify-center text-slate-400">
                  <p className="text-sm font-medium">No photos yet</p>
                </div>
              )
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {photos.map(photo => (
                  <div key={photo.id} className="relative rounded-xl overflow-hidden aspect-square bg-slate-100" data-testid="vehicle-photo">
                    <button type="button" onClick={() => !photo.pending && setPreviewPhoto(photo.url)} className="block w-full h-full">
                      <img src={photo.url} alt="Vehicle" className={`w-full h-full object-cover transition-opacity ${photo.pending ? "opacity-50" : ""}`} />
                    </button>
                    {photo.pending && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                        <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                      </div>
                    )}
                    {canManageStock && !photo.pending && (
                      <button
                        type="button"
                        onClick={() => deletePhoto(photo.id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/50 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                        title="Delete photo"
                        data-testid="delete-photo-btn"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {canManageStock && (
                <label
                  onDragOver={onPhotoDragOver}
                  onDragLeave={onPhotoDragLeave}
                  onDrop={onPhotoDrop}
                  className={`border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors ${isDraggingPhoto ? "border-blue-400 bg-blue-50 text-blue-500" : "border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500"}`}
                >
                  <Plus size={20} />
                  <span className="text-xs mt-1">Add</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files.length) uploadPhotos(e.target.files); e.target.value = ""; }} />
                </label>
                )}
              </div>
            )}
          </div>

          {/* Document Status + Upload */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope" }}>Legal Documents</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[["bluebook", "Bluebook"], ["transfer", "Transfer"], ["tax_clearance", "Tax Clearance"], ["insurance", "Insurance"]].map(([key, label]) => {
                const status = vehicle[`${key}_status`];
                const docs = legalDocs.filter(d => d.doc_type === key);
                return (
                  <div key={key} className="border border-slate-100 rounded-xl p-3">
                    <DocCard label={label} status={status} />
                    {canManageStock && (
                      <label className={`mt-2 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors w-full ${uploadingDoc ? "bg-slate-100 text-slate-400" : "bg-blue-50 hover:bg-blue-100 text-blue-700"}`} data-testid={`upload-doc-${key}-btn`}>
                        + Upload
                        <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingDoc} onChange={e => { if (e.target.files[0]) uploadDoc(e.target.files[0], key); e.target.value = ""; }} />
                      </label>
                    )}
                    {docs.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {docs.map(doc => (
                          <div key={doc.id} className="relative rounded-md overflow-hidden aspect-square bg-slate-100" data-testid="uploaded-doc">
                            <button type="button" onClick={() => setPreviewDoc(doc)} className="block w-full h-full" title={doc.original_name}>
                              {doc.url.startsWith("data:image") ? (
                                <img src={doc.url} alt={doc.original_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileText size={18} className="text-slate-400" />
                                </div>
                              )}
                            </button>
                            {canManageStock && (
                              <button
                                type="button"
                                onClick={() => deleteDoc(doc.id)}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-black/50 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={9} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Other documents */}
            {legalDocs.filter(d => d.doc_type === "other").length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Other Documents</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {legalDocs.filter(d => d.doc_type === "other").map(doc => (
                    <div key={doc.id} className="relative rounded-md overflow-hidden aspect-square bg-slate-100" data-testid="uploaded-doc-other">
                      <button type="button" onClick={() => setPreviewDoc(doc)} className="block w-full h-full" title={doc.original_name}>
                        {doc.url.startsWith("data:image") ? (
                          <img src={doc.url} alt={doc.original_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FileText size={20} className="text-slate-400" />
                          </div>
                        )}
                      </button>
                      {canManageStock && (
                        <button
                          type="button"
                          onClick={() => deleteDoc(doc.id)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-black/50 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nested modals */}
      {showExpenseModal && (
        <ExpenseModal
          onClose={() => setShowExpenseModal(false)}
          onSubmit={addExpense}
          form={expForm}
          setForm={setExpForm}
          saving={saving}
        />
      )}

      {showQR && (
        <QRLabelModal
          onClose={() => setShowQR(false)}
          qrData={qrData}
        />
      )}

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

      {previewPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewPhoto(null)}>
          <button onClick={() => setPreviewPhoto(null)} className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">✕</button>
          <img src={previewPhoto} alt="Vehicle full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewDoc(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <a href={previewDoc.url} download={previewDoc.original_name} onClick={e => e.stopPropagation()} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white" title="Download"><Download size={18} /></a>
            <button onClick={() => setPreviewDoc(null)} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">✕</button>
          </div>
          {previewDoc.url.startsWith("data:application/pdf") ? (
            <iframe src={previewDoc.url} title={previewDoc.original_name} className="w-full h-full max-w-4xl bg-white rounded-lg" onClick={e => e.stopPropagation()} />
          ) : (
            <img src={previewDoc.url} alt={previewDoc.original_name} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}

// Thin route wrapper for direct deep links (e.g. from Reports, Sold Stock) — closing here
// still navigates back to /inventory since there's no local Inventory state to fall back to.
export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <VehicleDetailModal id={id} onClose={() => navigate("/inventory")} />;
}
