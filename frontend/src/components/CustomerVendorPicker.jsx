import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Plus, Store, User } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

const fieldInp = "h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white";

/**
 * CustomerVendorPicker
 * A combobox that toggles between searching/selecting an existing Customer or
 * Vendor, with an inline "add new" form for either — mirrors the pick-or-create
 * UX used for customers on the Sales tab and vendors on the Spare Parts tab.
 *
 * value    - { type: "customer" | "vendor", id: string|null, name: string }
 * onChange - called with the next { type, id, name }
 * vendorType - passed through to /vendors/search and used as the default
 *              vendor_type when creating a new vendor from here
 */
export default function CustomerVendorPicker({ value, onChange, vendorType = "" }) {
  const type = value?.type || "vendor";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [vendors, setVendors] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const [newEntity, setNewEntity] = useState({ name: "", contact: "", address: "" });
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ensureLoaded = async (t) => {
    if (t === "vendor" && vendors === null) {
      setLoading(true);
      try {
        const typeParam = vendorType ? `&vendor_type=${encodeURIComponent(vendorType)}` : "";
        const r = await api.get(`/vendors/search?q=${typeParam}`);
        setVendors(r.data);
      } catch { setVendors([]); }
      finally { setLoading(false); }
    } else if (t === "customer" && customers === null) {
      setLoading(true);
      try {
        const r = await api.get("/customers");
        setCustomers(r.data);
      } catch { setCustomers([]); }
      finally { setLoading(false); }
    }
  };

  const switchType = (t) => {
    if (t === type) return;
    onChange({ type: t, id: null, name: "" });
    setSearch("");
    setShowAddNew(false);
    ensureLoaded(t);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    setSearch("");
    if (next) ensureLoaded(type);
  };

  const list = type === "vendor" ? vendors : customers;
  const filtered = (list || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()));

  const select = (item) => {
    onChange({ type, id: item.id, name: item.name });
    setOpen(false);
    setSearch("");
  };

  const clear = () => {
    onChange({ type, id: null, name: "" });
    setOpen(false);
  };

  const saveNew = async () => {
    if (!newEntity.name.trim() || !newEntity.contact.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      if (type === "vendor") {
        const r = await api.post("/vendors", {
          name: newEntity.name, phone: newEntity.contact,
          address: newEntity.address || null, vendor_type: vendorType || "both",
        });
        setVendors(prev => [...(prev || []), r.data]);
        onChange({ type: "vendor", id: r.data.id, name: r.data.name });
        toast.success("Vendor added!");
      } else {
        const r = await api.post("/customers", {
          name: newEntity.name, contact_number: newEntity.contact,
          address: newEntity.address || null,
        });
        setCustomers(prev => [...(prev || []), r.data]);
        onChange({ type: "customer", id: r.data.id, name: r.data.name });
        toast.success("Customer added!");
      }
      setShowAddNew(false);
      setOpen(false);
      setNewEntity({ name: "", contact: "", address: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to add ${type}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1 mb-1.5">
        <button
          type="button"
          data-testid="cv-picker-type-vendor"
          onClick={() => switchType("vendor")}
          className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium transition-colors ${type === "vendor" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          <Store size={11} /> Vendor
        </button>
        <button
          type="button"
          data-testid="cv-picker-type-customer"
          onClick={() => switchType("customer")}
          className={`flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium transition-colors ${type === "customer" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          <User size={11} /> Customer
        </button>
      </div>

      <button
        type="button"
        data-testid="cv-picker-trigger"
        onClick={toggleOpen}
        className="w-full h-10 sm:h-9 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between text-left"
      >
        {value?.id
          ? <span className="text-slate-900 flex items-center gap-1.5 truncate">
              {type === "vendor" ? <Store size={13} className="text-slate-400 shrink-0" /> : <User size={13} className="text-slate-400 shrink-0" />}
              <span className="truncate">{value.name}</span>
            </span>
          : <span className="text-slate-400">{`Select ${type}...`}</span>}
        <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 flex flex-col" data-testid="cv-picker-dropdown">
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${type}s...`}
              className="w-full h-7 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="cv-picker-search-input"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">Loading...</div>}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">No {type}s found</div>
            )}
            {!loading && filtered.map(item => (
              <button
                type="button"
                key={item.id}
                data-testid={`cv-picker-option-${item.id}`}
                onClick={() => select(item)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between transition-colors ${value?.id === item.id ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {value?.id === item.id && <Check size={11} className="text-blue-600 shrink-0" />}
                  <span className={`truncate ${value?.id === item.id ? "font-medium" : ""}`}>{item.name}</span>
                </div>
                {(item.phone || item.contact_number) && <span className="text-xs text-slate-400 shrink-0 ml-2">{item.phone || item.contact_number}</span>}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 shrink-0">
            {value?.id && (
              <button type="button" onClick={clear} className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors">
                Clear selection
              </button>
            )}
            <button
              type="button"
              data-testid="cv-picker-add-new-btn"
              onClick={() => setShowAddNew(true)}
              className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-medium flex items-center gap-1.5 transition-colors border-t border-slate-100"
            >
              <Plus size={11} /> {`Add New ${type === "vendor" ? "Vendor" : "Customer"}`}
            </button>
          </div>
        </div>
      )}

      {showAddNew && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2" data-testid="cv-picker-add-new-form">
          <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
            {type === "vendor" ? <Store size={11} /> : <User size={11} />} New {type === "vendor" ? "Vendor" : "Customer"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newEntity.name}
              onChange={e => setNewEntity({ ...newEntity, name: e.target.value })}
              placeholder="Full Name *"
              className={fieldInp}
              data-testid="cv-picker-new-name"
            />
            <input
              value={newEntity.contact}
              onChange={e => setNewEntity({ ...newEntity, contact: e.target.value })}
              placeholder="Phone *"
              className={fieldInp}
              data-testid="cv-picker-new-contact"
            />
          </div>
          <input
            value={newEntity.address}
            onChange={e => setNewEntity({ ...newEntity, address: e.target.value })}
            placeholder="Address (optional)"
            className={`w-full ${fieldInp}`}
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAddNew(false)} className="px-3 h-7 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={saveNew} disabled={saving} data-testid="cv-picker-save-new-btn" className="px-3 h-7 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
              {saving ? "Saving..." : "Create & Select"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
