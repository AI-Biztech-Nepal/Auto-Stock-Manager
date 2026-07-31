import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Search, AlertTriangle, Package, Trash2, Edit, Minus, ShoppingCart, History, ChevronUp, ChevronDown, Check, Store, Layers, Boxes, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import BSDatePicker from "../components/BSDatePicker";

// ── Defined outside component to prevent focus loss ────────────────────
const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = `${inp} bg-white`;

const CATEGORIES = ["General", "Engine", "Brakes", "Electrical", "Tyres", "Body", "Oil & Fluids", "Filters", "Chain & Sprocket", "Lights", "Other"];
const REASONS = ["Sale", "Used in Repair", "Damaged", "Return to Supplier", "Internal Use"];

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ── Searchable Vendor Combobox ─────────────────────────────────────────
const VendorCombobox = ({ value, onChange, vendors, onAddNew }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = vendors.find(v => v.id === value);
  const filtered = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        data-testid="vendor-combobox-trigger"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between text-left"
      >
        {selected
          ? <span className="text-slate-900 flex items-center gap-1.5"><Store size={13} className="text-slate-400 shrink-0" />{selected.name}</span>
          : <span className="text-slate-400">Select vendor...</span>}
        <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 left-0 right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 flex flex-col" data-testid="vendor-dropdown">
          {/* Search input */}
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vendors..."
              className="w-full h-7 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="vendor-search-input"
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">No vendors found</div>
            )}
            {filtered.map(v => (
              <button
                type="button"
                key={v.id}
                data-testid={`vendor-option-${v.id}`}
                onClick={() => { onChange(v.id); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between transition-colors ${value === v.id ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
              >
                <div className="flex items-center gap-2">
                  {value === v.id && <Check size={11} className="text-blue-600 shrink-0" />}
                  <span className={value === v.id ? "font-medium" : ""}>{v.name}</span>
                </div>
                {v.phone && <span className="text-xs text-slate-400 shrink-0">{v.phone}</span>}
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="border-t border-slate-100 shrink-0">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Clear selection
              </button>
            )}
            <button
              type="button"
              data-testid="add-new-vendor-btn"
              onClick={() => { setOpen(false); onAddNew(); }}
              className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium flex items-center gap-1.5 transition-colors border-t border-slate-100"
            >
              <Plus size={11} /> Add New Vendor
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Constants ──────────────────────────────────────────────────────────
const EMPTY = { name: "", category: "General", brand_compatibility: "", part_number: "", vendor_id: "", quantity: 0, unit_cost: "", selling_price: "", min_stock_alert: 2, location: "", notes: "", is_kit: false };
const EMPTY_USE = { quantity: 1, reason: "Sale", notes: "" }; const EMPTY_BULK_ROW = { part_number: "", name: "", qty: "1", unit: "PCS", rate: "", discount: "", selling_price: "", min_stock_alert: "2" };
const EMPTY_KIT_ROW = { component_part_id: "", qty_per_kit: 1 };
const netRate = (r) => { const rate = Number(r.rate) || 0; const discount = Number(r.discount) || 0; return discount ? rate - (rate * discount / 100) : rate; };

export default function SpareParts() {
  const [parts, setParts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [initialForm, setInitialForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Kit components (bill of materials) editor, shown inside Add/Edit modal when is_kit
  const [kitRows, setKitRows] = useState([]);

  // Break Kit modal
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [breakPart, setBreakPart] = useState(null);
  const [breakQty, setBreakQty] = useState(1);
  const [breaking, setBreaking] = useState(false);

  // Use/Sell modal
  const [showUseModal, setShowUseModal] = useState(false);
  const [usePart, setUsePart] = useState(null);
  const [useForm, setUseForm] = useState(EMPTY_USE);
  const [useSaving, setUseSaving] = useState(false);
  const [issueMode, setIssueMode] = useState("whole"); // "whole" | "individual" — only relevant when usePart.is_kit
  const [useKitComponents, setUseKitComponents] = useState([]);
  const [issueComponentId, setIssueComponentId] = useState("");
  const [containingKits, setContainingKits] = useState([]); // kits that can be broken to top up usePart's stock
  const [breakingForIssue, setBreakingForIssue] = useState(false);

  // Transaction log
  const [expandedPart, setExpandedPart] = useState(null);
  const [txns, setTxns] = useState({});

  // Inline Add Vendor form (shown inside Add Part modal)
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "" });
  const [addingVendor, setAddingVendor] = useState(false); const [showBulkModal, setShowBulkModal] = useState(false); const [bulkVendorId, setBulkVendorId] = useState(""); const [bulkBillNo, setBulkBillNo] = useState(""); const [bulkEntryDate, setBulkEntryDate] = useState(""); const [bulkVat, setBulkVat] = useState(""); const [bulkRows, setBulkRows] = useState([{ ...EMPTY_BULK_ROW }]); const [bulkSaving, setBulkSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [p, s, v] = await Promise.all([
        api.get("/spare-parts"),
        api.get("/spare-parts/summary"),
        api.get("/vendors/search?q=&vendor_type=parts"),
      ]);
      setParts(p.data); setSummary(s.data); setVendors(v.data);
    } catch { toast.error("Failed to load parts"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = parts.filter(p => {
    if (catFilter !== "all" && p.category !== catFilter) return false;
    if (showLowStock && !p.low_stock) return false;
    if (search) {
      const q = search.toLowerCase();
      const vendorName = (p.vendor_name || p.supplier || "").toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.part_number || "").toLowerCase().includes(q) || vendorName.includes(q);
    }
    return true;
  });

  const openAdd = () => { setForm(EMPTY); setInitialForm(EMPTY); setEditId(null); setKitRows([]); setShowAddVendor(false); setNewVendor({ name: "", phone: "", address: "" }); setShowModal(true); };
  const openEdit = async (p) => {
    const next = { ...p, unit_cost: p.unit_cost || "", selling_price: p.selling_price || "", vendor_id: p.vendor_id || "" };
    setForm(next); setInitialForm(next);
    setEditId(p.id); setShowAddVendor(false); setNewVendor({ name: "", phone: "", address: "" }); setKitRows([]); setShowModal(true);
    if (p.is_kit) {
      try {
        const r = await api.get(`/spare-parts/${p.id}/kit-components`);
        setKitRows(r.data.map(c => ({ component_part_id: c.component_part_id, qty_per_kit: c.qty_per_kit })));
      } catch { toast.error("Failed to load kit components"); }
    }
  };

  const addKitRow = () => setKitRows(prev => [...prev, { ...EMPTY_KIT_ROW }]);
  const removeKitRow = (idx) => setKitRows(prev => prev.filter((_, i) => i !== idx));
  const updateKitRow = (idx, field, value) => setKitRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const closePartModal = () => {
    if (JSON.stringify(form) !== JSON.stringify(initialForm) && !window.confirm("You have unsaved changes. Close without saving?")) return;
    setShowModal(false); setForm(EMPTY); setShowAddVendor(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.error("Name is required"); return; }
    const validKitRows = kitRows.filter(r => r.component_part_id && Number(r.qty_per_kit) > 0);
    if (form.is_kit && validKitRows.length === 0) { toast.error("Add at least one component for this kit"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity) || 0,
        unit_cost: Number(form.unit_cost) || 0,
        selling_price: form.selling_price ? Number(form.selling_price) : null,
        min_stock_alert: Number(form.min_stock_alert) || 2,
        vendor_id: form.vendor_id || null,
        supplier: null, // clear legacy text field on save
      };
      let partId = editId;
      if (editId) { await api.put(`/spare-parts/${editId}`, payload); toast.success("Updated!"); }
      else { const r = await api.post("/spare-parts", payload); partId = r.data.id; toast.success("Part added!"); }
      if (form.is_kit) {
        await api.post(`/spare-parts/${partId}/kit-components`, {
          components: validKitRows.map(r => ({ component_part_id: r.component_part_id, qty_per_kit: Number(r.qty_per_kit) })),
        });
      }
      setShowModal(false); fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this part?")) return;
    try { await api.delete(`/spare-parts/${id}`); toast.success("Deleted"); fetchAll(); }
    catch { toast.error("Failed to delete"); }
  };

  const adjustStock = async (id, delta) => {
    try {
      const r = await api.post(`/spare-parts/${id}/adjust-stock`, { delta });
      setParts(prev => prev.map(p => p.id === id ? { ...p, quantity: r.data.quantity, low_stock: r.data.quantity <= p.min_stock_alert } : p));
    } catch { toast.error("Failed to update stock"); }
  };

  const openUsePart = async (p) => {
    setUsePart(p); setUseForm(EMPTY_USE); setIssueMode("whole"); setUseKitComponents([]); setIssueComponentId(""); setContainingKits([]);
    setShowUseModal(true);
    try {
      if (p.is_kit) {
        const r = await api.get(`/spare-parts/${p.id}/kit-components`);
        setUseKitComponents(r.data);
      } else {
        const r = await api.get(`/spare-parts/${p.id}/containing-kits`);
        setContainingKits(r.data.filter(k => k.kit_quantity > 0));
      }
    } catch { /* non-fatal — issuing whole-kit / plain stock-out still works without this */ }
  };

  // Refreshes just the two numbers this modal depends on (usePart's own stock, and
  // the selected component's stock inside useKitComponents) without a full fetchAll,
  // so the auto-break flow can chain straight into a stock-out with fresh figures.
  const refreshUseModalStock = async (p) => {
    const r = await api.get("/spare-parts");
    setParts(r.data);
    const fresh = r.data.find(x => x.id === p.id);
    if (fresh) setUsePart(fresh);
    if (p.is_kit) {
      const kc = await api.get(`/spare-parts/${p.id}/kit-components`);
      setUseKitComponents(kc.data);
    } else {
      const ck = await api.get(`/spare-parts/${p.id}/containing-kits`);
      setContainingKits(ck.data.filter(k => k.kit_quantity > 0));
    }
    return r.data;
  };

  const doStockOut = async (partId, partName, qty, reason, notes) => {
    await api.post(`/spare-parts/${partId}/stock-out`, { quantity: qty, reason, notes });
    toast.success(`${qty} unit(s) of ${partName} marked as "${reason}"`);
    fetchAll();
    if (expandedPart === partId) {
      const r = await api.get(`/spare-parts/${partId}/transactions`);
      setTxns(prev => ({ ...prev, [partId]: r.data }));
    }
  };

  const handleStockOut = async (e) => {
    e.preventDefault();
    const qty = Number(useForm.quantity);
    if (!qty || qty <= 0) { toast.error("Enter a valid quantity"); return; }

    if (usePart.is_kit && issueMode === "individual") {
      const comp = useKitComponents.find(c => c.component_part_id === issueComponentId);
      if (!comp) { toast.error("Pick a component to issue"); return; }
      if (qty > comp.component_quantity) { toast.error(`Only ${comp.component_quantity} of ${comp.component_name} in loose stock`); return; }
      setUseSaving(true);
      try {
        await doStockOut(comp.component_part_id, comp.component_name, qty, useForm.reason, useForm.notes);
        setShowUseModal(false);
      } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
      finally { setUseSaving(false); }
      return;
    }

    if (qty > usePart.quantity) { toast.error(`Only ${usePart.quantity} in stock`); return; }
    setUseSaving(true);
    try {
      await doStockOut(usePart.id, usePart.name, qty, useForm.reason, useForm.notes);
      setShowUseModal(false);
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
    finally { setUseSaving(false); }
  };

  // Breaks enough sealed kits to cover the shortfall on either (a) the component
  // currently selected in "issue individual" mode, or (b) usePart itself when it's a
  // plain (non-kit) part that happens to also be a kit's component.
  const handleBreakForShortfall = async (kit, requestedQty, currentQty) => {
    const neededKits = Math.ceil((requestedQty - currentQty) / kit.qty_per_kit);
    setBreakingForIssue(true);
    try {
      await api.post(`/spare-parts/${kit.kit_part_id}/break-kit`, { quantity: neededKits });
      toast.success(`Broke ${neededKits} kit(s) of ${kit.kit_name}`);
      await refreshUseModalStock(usePart);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to break kit"); }
    finally { setBreakingForIssue(false); }
  };

  const openBreakKit = (p) => { setBreakPart(p); setBreakQty(1); setShowBreakModal(true); };

  const handleBreakKit = async (e) => {
    e.preventDefault();
    const qty = Number(breakQty);
    if (!qty || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    if (qty > breakPart.quantity) { toast.error(`Only ${breakPart.quantity} sealed kit(s) in stock`); return; }
    setBreaking(true);
    try {
      const r = await api.post(`/spare-parts/${breakPart.id}/break-kit`, { quantity: qty });
      toast.success(`Broke ${qty} kit(s) into ${r.data.components_updated} component part(s)`);
      setShowBreakModal(false);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to break kit"); }
    finally { setBreaking(false); }
  };

  const toggleTxn = async (pid) => {
    if (expandedPart === pid) { setExpandedPart(null); return; }
    setExpandedPart(pid);
    if (!txns[pid]) {
      try {
        const r = await api.get(`/spare-parts/${pid}/transactions`);
        setTxns(prev => ({ ...prev, [pid]: r.data }));
      } catch { toast.error("Failed to load history"); }
    }
  };

  const saveNewVendor = async () => {
    if (!newVendor.name || !newVendor.phone) { toast.error("Vendor name and phone required"); return; }
    setAddingVendor(true);
    try {
      const r = await api.post("/vendors", { ...newVendor, vendor_type: "parts" });
      const created = r.data;
      setVendors(prev => [...prev, created]);
      setForm(f => ({ ...f, vendor_id: created.id }));
      setShowAddVendor(false);
      setNewVendor({ name: "", phone: "", address: "" });
      toast.success("Vendor created and selected!");
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add vendor"); }
    finally { setAddingVendor(false); }
  };

  const openBulkAdd = () => { setBulkVendorId(""); setBulkBillNo(""); setBulkEntryDate(new Date().toISOString().slice(0,10)); setBulkVat(""); setBulkRows([{ ...EMPTY_BULK_ROW }]); setShowBulkModal(true); }; const addBulkRow = () => setBulkRows(prev => [...prev, { ...EMPTY_BULK_ROW }]); const removeBulkRow = (idx) => setBulkRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)); const updateBulkRow = (idx, field, value) => setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); const bulkSubtotal = bulkRows.reduce((sum, r) => sum + (Number(r.qty) || 0) * netRate(r), 0); const bulkVatAmount = bulkVat ? bulkSubtotal * (Number(bulkVat) / 100) : 0; const bulkGrandTotal = bulkSubtotal + bulkVatAmount; const handleBulkSave = async (e) => { e.preventDefault(); const validRows = bulkRows.filter(r => r.name.trim()); if (validRows.length === 0) { toast.error("Add at least one part with a name"); return; } setBulkSaving(true); try { for (const r of validRows) { const payload = { name: r.name, category: "General", part_number: r.part_number || "", brand_compatibility: "", vendor_id: bulkVendorId || null, quantity: Number(r.qty) || 0, unit_cost: Math.round(netRate(r) * 100) / 100, selling_price: r.selling_price ? Number(r.selling_price) : null, min_stock_alert: Number(r.min_stock_alert) || 2, location: "", bill_no: bulkBillNo || null, entry_date: bulkEntryDate || null, notes: "", supplier: null }; await api.post("/spare-parts", payload); } toast.success(validRows.length + " part(s) added from bill!"); setShowBulkModal(false); fetchAll(); } catch (err) { toast.error(err.response?.data?.detail || "Error adding bulk parts"); } finally { setBulkSaving(false); } };

  const useQtyNum = Number(useForm.quantity) || 0;
  const selectedIssueComponent = useKitComponents.find(c => c.component_part_id === issueComponentId);
  const individualShortfallKit = usePart && usePart.is_kit && issueMode === "individual" && selectedIssueComponent && useQtyNum > selectedIssueComponent.component_quantity
    ? { kit_part_id: usePart.id, kit_name: usePart.name, kit_quantity: usePart.quantity, qty_per_kit: selectedIssueComponent.qty_per_kit }
    : null;
  const plainShortfallKit = usePart && !usePart.is_kit && useQtyNum > usePart.quantity && containingKits.length > 0
    ? (containingKits.find(k => Math.ceil((useQtyNum - usePart.quantity) / k.qty_per_kit) <= k.kit_quantity) || containingKits[0])
    : null;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Spare Parts</h1>
          <p className="text-sm text-slate-500">{parts.length} parts in inventory</p>
        </div>
        <button onClick={openBulkAdd} data-testid="bulk-add-part-btn" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all active:scale-95 shadow-sm">
          <Layers size={16} /> Bulk Add (Bill)
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Parts", value: summary.total_parts, color: "bg-blue-500" },
            { label: "Inventory Value", value: formatNPR(summary.total_value), color: "bg-indigo-500" },
            { label: "Low Stock", value: summary.low_stock_count, color: summary.low_stock_count > 0 ? "bg-red-500" : "bg-green-500" },
            { label: "Categories", value: summary.categories?.length || 0, color: "bg-purple-500" },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center`}><Package size={16} className="text-white" /></div>
              <div>
                <div className="text-xs text-slate-500 font-medium">{c.label}</div>
                <div className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters — sticky so search/filters stay reachable while scrolling a long list */}
      <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts, part#, vendor..." className="w-full h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="parts-search" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => setShowLowStock(!showLowStock)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showLowStock ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} data-testid="low-stock-filter">
          <AlertTriangle size={13} /> Low Stock
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <Package size={32} className="mb-2 opacity-30" />
            <p className="font-medium">No parts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Part Name", "Category", "Part#", "Qty", "Unit Cost", "Sell Price", "Total Value", "Supplier", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.flatMap(p => {
                  const displaySupplier = p.vendor_name || p.supplier;
                  const rows = [];
                  rows.push(
                    <tr key={p.id} data-testid="part-row" className={`transition-colors ${p.low_stock ? "bg-red-50/40" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                          {p.name}
                          {p.is_kit && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1" title="This part is a kit/set with its own components"><Boxes size={11} /> Kit</span>}
                          {p.low_stock && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Low</span>}
                        </div>
                        {p.brand_compatibility && <div className="text-xs text-slate-400 mt-0.5">{p.brand_compatibility}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{p.category}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{p.part_number || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => adjustStock(p.id, -1)} className="w-6 h-6 rounded-md bg-slate-100 hover:bg-red-100 flex items-center justify-center transition-colors"><Minus size={11} /></button>
                          <span className={`text-sm font-bold w-7 text-center ${p.low_stock ? "text-red-600" : "text-slate-900"}`}>{p.quantity}</span>
                          <button onClick={() => adjustStock(p.id, 1)} className="w-6 h-6 rounded-md bg-slate-100 hover:bg-green-100 flex items-center justify-center transition-colors"><Plus size={11} /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatNPR(p.unit_cost)}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">{p.selling_price ? <span className="text-green-700 font-medium">{formatNPR(p.selling_price)}</span> : "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{formatNPR(p.total_value)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {displaySupplier
                          ? <span className="flex items-center gap-1 text-sm text-slate-600"><Store size={12} className="text-slate-400 shrink-0" />{displaySupplier}</span>
                          : <span className="text-slate-400 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openUsePart(p)} title="Use / Sell Part" data-testid="use-part-btn" className="p-1.5 hover:bg-orange-50 rounded-lg transition-colors">
                            <ShoppingCart size={14} className="text-orange-500" />
                          </button>
                          {p.is_kit && (
                            <button onClick={() => openBreakKit(p)} title="Break Kit into Components" data-testid="break-kit-btn" className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors">
                              <PackageOpen size={14} className="text-indigo-500" />
                            </button>
                          )}
                          <button onClick={() => toggleTxn(p.id)} title="View History" data-testid="txn-history-btn" className={`p-1.5 rounded-lg transition-colors ${expandedPart === p.id ? "bg-blue-100" : "hover:bg-slate-100"}`}>
                            {expandedPart === p.id ? <ChevronUp size={14} className="text-blue-600" /> : <History size={14} className="text-slate-500" />}
                          </button>
                          <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" data-testid="edit-part-btn"><Edit size={14} className="text-slate-500" /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-part-btn"><Trash2 size={14} className="text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                  if (expandedPart === p.id) {
                    rows.push(
                      <tr key={`${p.id}-txn`} className="bg-slate-50">
                        <td colSpan={9} className="px-6 py-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                            <History size={12} /> Usage History
                          </div>
                          {!txns[p.id] ? (
                            <div className="text-xs text-slate-400">Loading...</div>
                          ) : txns[p.id].length === 0 ? (
                            <div className="text-xs text-slate-400">No usage recorded yet.</div>
                          ) : (
                            <div className="space-y-1.5 max-h-44 overflow-y-auto">
                              {txns[p.id].map(t => (
                                <div key={t.id} className="flex items-center gap-4 text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                  <span className="font-bold text-red-600 w-8 shrink-0">-{t.quantity}</span>
                                  <span className="font-medium text-slate-800">{t.reason}</span>
                                  <span className="text-slate-400">{t.date?.slice(0, 10)}</span>
                                  {t.notes && <span className="text-slate-400 italic truncate">{t.notes}</span>}
                                  <span className="ml-auto text-slate-400 shrink-0">by {t.created_by}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{editId ? "Edit Part" : "Add Spare Part"}</h2>
              <button onClick={closePartModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field label="Part Name" required>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Brake Pad Front" className={inp} data-testid="part-name-input" />
                  </Field>
                </div>
                <Field label="Category">
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className={sel}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Part Number">
                  <input value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})} placeholder="e.g. BP-001" className={inp} />
                </Field>
                <Field label="Brand Compatibility">
                  <input value={form.brand_compatibility} onChange={e => setForm({...form, brand_compatibility: e.target.value})} placeholder="e.g. Honda, Yamaha" className={inp} />
                </Field>

                {/* Vendor (Supplier) */}
                <div className="col-span-2">
                  <Field label="Supplier (Vendor)">
                    <VendorCombobox
                      value={form.vendor_id}
                      onChange={vid => setForm(f => ({ ...f, vendor_id: vid }))}
                      vendors={vendors}
                      onAddNew={() => setShowAddVendor(true)}
                    />
                  </Field>

                  {/* Inline Add Vendor form */}
                  {showAddVendor && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2" data-testid="add-vendor-inline-form">
                      <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><Store size={11} /> New Vendor</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="Vendor Name *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" data-testid="new-vendor-name" />
                        <input value={newVendor.phone} onChange={e => setNewVendor({...newVendor, phone: e.target.value})} placeholder="Phone *" className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" data-testid="new-vendor-phone" />
                      </div>
                      <input value={newVendor.address} onChange={e => setNewVendor({...newVendor, address: e.target.value})} placeholder="Address (optional)" className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setShowAddVendor(false)} className="px-3 h-7 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                        <button type="button" onClick={saveNewVendor} disabled={addingVendor} data-testid="save-new-vendor-btn" className="px-3 h-7 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">{addingVendor ? "Saving..." : "Create & Select"}</button>
                      </div>
                    </div>
                  )}
                </div>

                <Field label="Quantity">
                  <input type="text" inputMode="numeric" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} placeholder="0" className={inp} />
                </Field>
                <Field label="Min Stock Alert">
                  <input type="text" inputMode="numeric" value={form.min_stock_alert} onChange={e => setForm({...form, min_stock_alert: e.target.value})} placeholder="2" className={inp} />
                </Field>
                <Field label="Unit Cost (NPR)">
                  <input type="text" inputMode="numeric" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})} placeholder="e.g. 850" className={inp} data-testid="part-cost-input" />
                </Field>
                <Field label="Selling Price (NPR)">
                  <input type="text" inputMode="numeric" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} placeholder="e.g. 1200" className={inp} />
                </Field>
                <Field label="Storage Location">
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Shelf A2" className={inp} />
                </Field>
              </div>

              {/* Kit / Set toggle + Bill of Materials editor */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.is_kit} onChange={e => setForm({...form, is_kit: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" data-testid="is-kit-checkbox" />
                  <Boxes size={14} className="text-indigo-500" /> This part is a kit / set (e.g. gasket kit, bearing kit, brake pad set)
                </label>
                {form.is_kit && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-500">What this kit breaks down into when opened. The kit keeps its own stock (sealed kits); each component below keeps its own stock too.</p>
                    {kitRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.component_part_id}
                          onChange={e => updateKitRow(idx, "component_part_id", e.target.value)}
                          className={`${sel} flex-1`}
                          data-testid={`kit-row-part-${idx}`}
                        >
                          <option value="">Select component part...</option>
                          {parts.filter(p => !p.is_kit && p.id !== editId).map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.part_number ? ` (${p.part_number})` : ""}</option>
                          ))}
                        </select>
                        <input
                          type="text" inputMode="numeric"
                          value={row.qty_per_kit}
                          onChange={e => updateKitRow(idx, "qty_per_kit", e.target.value)}
                          placeholder="Qty/kit"
                          className="w-20 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={() => removeKitRow(idx)} className="p-1.5 hover:bg-red-50 rounded-lg shrink-0"><Trash2 size={13} className="text-red-400" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={addKitRow} className="flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg font-medium" data-testid="add-kit-row-btn">
                      <Plus size={12} /> Add Component
                    </button>
                  </div>
                )}
              </div>

              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Any notes..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </Field>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closePartModal} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} data-testid="save-part-btn" className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">{saving ? "Saving..." : editId ? "Update" : "Add Part"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between p-5 border-b border-slate-100"><div><h2 className="text-lg font-bold text-slate-900">Bulk Add Spare Parts (From Bill)</h2><p className="text-xs text-slate-500 mt-0.5">Add every line item from one purchase bill in a single entry</p></div><button onClick={() => setShowBulkModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button></div><form onSubmit={handleBulkSave} className="p-5 space-y-4"><div className="grid grid-cols-4 gap-4"><div className="col-span-2"><Field label="Vendor"><VendorCombobox value={bulkVendorId} onChange={setBulkVendorId} vendors={vendors} onAddNew={() => {}} /></Field></div><Field label="Bill No."><input value={bulkBillNo} onChange={e => setBulkBillNo(e.target.value)} placeholder="e.g. S/BILL22185" className={inp} data-testid="bulk-bill-no" /></Field><Field label="Entry Date (BS)"><BSDatePicker value={bulkEntryDate} onChange={setBulkEntryDate} /></Field></div><div className="overflow-x-auto border border-slate-200 rounded-xl"><table className="w-full text-sm"><thead><tr className="bg-slate-50 border-b border-slate-200">{["Part No.", "Part Name", "Qty", "Unit", "Rate", "Discount %", "Net Amount", "Selling Price", "Min Stock", ""].map(h => (<th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 px-2 py-2 whitespace-nowrap">{h}</th>))}</tr></thead><tbody className="divide-y divide-slate-100">{bulkRows.map((r, idx) => { const net = (Number(r.qty) || 0) * netRate(r); return (<tr key={idx}><td className="p-1"><input value={r.part_number} onChange={e => updateBulkRow(idx, "part_number", e.target.value)} className="w-24 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input value={r.name} onChange={e => updateBulkRow(idx, "name", e.target.value)} placeholder="Part name *" className="w-40 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input type="text" inputMode="numeric" value={r.qty} onChange={e => updateBulkRow(idx, "qty", e.target.value)} className="w-16 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input value={r.unit} onChange={e => updateBulkRow(idx, "unit", e.target.value)} className="w-16 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input type="text" inputMode="numeric" value={r.rate} onChange={e => updateBulkRow(idx, "rate", e.target.value)} className="w-20 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input type="text" inputMode="numeric" value={r.discount} onChange={e => updateBulkRow(idx, "discount", e.target.value)} placeholder="optional" title="Leave blank if the vendor already gave a final price with no discount" className="w-16 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1 text-xs font-medium text-slate-700 px-2 whitespace-nowrap">{formatNPR(net)}{Number(r.discount) > 0 && <div className="text-[10px] text-green-600 font-normal">@ {formatNPR(netRate(r))}/unit</div>}</td><td className="p-1"><input type="text" inputMode="numeric" value={r.selling_price} onChange={e => updateBulkRow(idx, "selling_price", e.target.value)} placeholder="optional" className="w-20 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><input type="text" inputMode="numeric" value={r.min_stock_alert} onChange={e => updateBulkRow(idx, "min_stock_alert", e.target.value)} className="w-16 h-8 px-2 text-xs border border-slate-200 rounded-md" /></td><td className="p-1"><button type="button" onClick={() => removeBulkRow(idx)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={13} className="text-red-400" /></button></td></tr>); })}</tbody></table></div><button type="button" onClick={addBulkRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium"><Plus size={14} /> Add Row</button><div className="flex flex-wrap items-center justify-end gap-4 bg-slate-50 rounded-xl p-4"><Field label="VAT % (optional)"><input type="text" inputMode="numeric" value={bulkVat} onChange={e => setBulkVat(e.target.value)} placeholder="e.g. 13" className="w-24 h-9 px-3 text-sm border border-slate-200 rounded-lg" /></Field><div className="text-sm text-slate-600">Subtotal: <span className="font-semibold text-slate-900">{formatNPR(bulkSubtotal)}</span></div><div className="text-sm text-slate-600">VAT: <span className="font-semibold text-slate-900">{formatNPR(bulkVatAmount)}</span></div><div className="text-base text-slate-800">Grand Total: <span className="font-bold text-blue-700">{formatNPR(bulkGrandTotal)}</span></div></div><div className="flex gap-3 pt-1"><button type="button" onClick={() => setShowBulkModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button><button type="submit" disabled={bulkSaving} data-testid="save-bulk-parts-btn" className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">{bulkSaving ? "Saving..." : "Add " + bulkRows.filter(r=>r.name.trim()).length + " Part(s)"}</button></div></form></div></div>)}

      {/* ── Break Kit Modal ── */}
      {showBreakModal && breakPart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-1.5"><PackageOpen size={17} className="text-indigo-500" /> Break Kit</h2>
                <p className="text-xs text-slate-500 mt-0.5">{breakPart.name} — <span className="font-semibold text-slate-700">{breakPart.quantity} sealed kit(s) in stock</span></p>
              </div>
              <button onClick={() => setShowBreakModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleBreakKit} className="p-5 space-y-4">
              <Field label="Kits to Break" required>
                <input type="text" inputMode="numeric" value={breakQty} onChange={e => setBreakQty(e.target.value)} placeholder="1" className={inp} data-testid="break-qty-input" />
              </Field>
              <p className="text-xs text-slate-500">This deducts {breakQty || 0} from {breakPart.name}'s own stock and adds each component's qty-per-kit × {breakQty || 0} to that component's loose stock.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowBreakModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={breaking} data-testid="confirm-break-btn" className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">{breaking ? "Breaking..." : "Break Kit"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Use / Sell Modal ── */}
      {showUseModal && usePart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Use / Sell Part</h2>
                <p className="text-xs text-slate-500 mt-0.5">{usePart.name} — <span className="font-semibold text-slate-700">{usePart.quantity} in stock</span></p>
              </div>
              <button onClick={() => setShowUseModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>

            {usePart.is_kit && (
              <div className="flex gap-2 px-5 pt-4">
                <button type="button" onClick={() => setIssueMode("whole")} data-testid="issue-mode-whole" className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors ${issueMode === "whole" ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Issue Whole Kit</button>
                <button type="button" onClick={() => setIssueMode("individual")} data-testid="issue-mode-individual" className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition-colors ${issueMode === "individual" ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Issue Individual Part(s)</button>
              </div>
            )}

            <form onSubmit={handleStockOut} className="p-5 space-y-4">
              {usePart.is_kit && issueMode === "individual" && (
                <Field label="Component" required>
                  <select value={issueComponentId} onChange={e => setIssueComponentId(e.target.value)} className={sel} data-testid="issue-component-select">
                    <option value="">Select component...</option>
                    {useKitComponents.map(c => (
                      <option key={c.component_part_id} value={c.component_part_id}>{c.component_name} ({c.component_quantity} loose in stock)</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Quantity to Deduct" required>
                <input type="text" inputMode="numeric" value={useForm.quantity} onChange={e => setUseForm({...useForm, quantity: e.target.value})} placeholder="1" className={inp} data-testid="use-qty-input" />
              </Field>

              {individualShortfallKit && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 space-y-2" data-testid="individual-shortfall-banner">
                  <p>Only {selectedIssueComponent.component_quantity} of {selectedIssueComponent.component_name} in loose stock. {usePart.name} has {individualShortfallKit.kit_quantity} sealed kit(s), each yielding {individualShortfallKit.qty_per_kit} of this part.</p>
                  <button type="button" onClick={() => handleBreakForShortfall(individualShortfallKit, useQtyNum, selectedIssueComponent.component_quantity)} disabled={breakingForIssue} className="w-full h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-60" data-testid="break-for-shortfall-btn">
                    {breakingForIssue ? "Breaking..." : `Break ${Math.ceil((useQtyNum - selectedIssueComponent.component_quantity) / individualShortfallKit.qty_per_kit)} kit(s) & continue`}
                  </button>
                </div>
              )}

              {plainShortfallKit && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 space-y-2" data-testid="plain-shortfall-banner">
                  <p>Only {usePart.quantity} in loose stock. {plainShortfallKit.kit_name} has {plainShortfallKit.kit_quantity} sealed kit(s), each yielding {plainShortfallKit.qty_per_kit} of this part.</p>
                  <button type="button" onClick={() => handleBreakForShortfall(plainShortfallKit, useQtyNum, usePart.quantity)} disabled={breakingForIssue} className="w-full h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-60" data-testid="break-for-shortfall-btn">
                    {breakingForIssue ? "Breaking..." : `Break ${Math.ceil((useQtyNum - usePart.quantity) / plainShortfallKit.qty_per_kit)} kit(s) & continue`}
                  </button>
                </div>
              )}

              <Field label="Reason" required>
                <select value={useForm.reason} onChange={e => setUseForm({...useForm, reason: e.target.value})} className={sel} data-testid="use-reason-select">
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Notes">
                <input value={useForm.notes} onChange={e => setUseForm({...useForm, notes: e.target.value})} placeholder="Optional notes" className={inp} />
              </Field>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowUseModal(false)} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={useSaving} data-testid="confirm-use-btn" className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60 active:scale-95 transition-all">{useSaving ? "Saving..." : "Confirm"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
