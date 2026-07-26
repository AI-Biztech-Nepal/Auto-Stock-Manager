/**
 * AddVehicleModal.jsx — extracted Add Vehicle form modal for Inventory page
 */
import { Plus } from "lucide-react";
import BSDatePicker from "../components/BSDatePicker";
import VendorAutocomplete from "../components/VendorAutocomplete";
import CustomerVendorPicker from "../components/CustomerVendorPicker";
import { BRANDS, SOURCES, CONDITIONS, FUEL_TYPES, VEHICLE_STATUS_OPTIONS, OWNERSHIP_OPTIONS } from "../utils/helpers";

// text-base (16px) on mobile stops iOS Safari auto-zooming the page on focus; h-10 gives a comfortable touch target
const inp = "w-full h-10 sm:h-9 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = "w-full h-10 sm:h-9 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const Field = ({ label, required, children, full }) => (
  <div className={full ? "col-span-1 sm:col-span-2" : ""}>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

export function AddVehicleModal({ form, setForm, onClose, onSubmit, saving, photos, setPhotos }) {
  const addPhotos = (files) => {
    const staged = Array.from(files).map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPhotos(prev => [...prev, ...staged]);
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>Add New Vehicle</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
        </div>
        <form onSubmit={onSubmit} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Brand" required>
              <select data-testid="brand-select" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className={sel}>
                <option value="">Select Brand</option>
                {BRANDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Model" required>
              <input
                data-testid="model-input"
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. CB Shine, FZ-S"
                className={inp}
              />
            </Field>
            <Field label="Year" required>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={form.year}
                onChange={e => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. 2020"
                className={inp}
              />
            </Field>
            <Field label="Engine CC">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={form.engine_cc}
                onChange={e => setForm({ ...form, engine_cc: e.target.value })}
                placeholder="e.g. 125"
                className={inp}
              />
            </Field>
            <Field label="Fuel Type">
              <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })} className={sel}>
                {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Type" required>
              <select data-testid="vehicle-type-select" value={form.vehicle_type} onChange={e => setForm({ ...form, vehicle_type: e.target.value })} className={sel}>
                <option value="bike">Bike</option>
                <option value="scooter">Scooter</option>
              </select>
            </Field>
            <Field label="Ownership Number">
              <select value={form.ownership_number} onChange={e => setForm({ ...form, ownership_number: Number(e.target.value) })} className={sel}>
                {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Purchase Price (NPR)" required>
              <input
                data-testid="purchase-price-input"
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={form.purchase_price}
                onChange={e => setForm({ ...form, purchase_price: e.target.value })}
                placeholder="e.g. 150000"
                className={inp}
              />
            </Field>
            <Field label="Selling Price (NPR)">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={form.selling_price}
                onChange={e => setForm({ ...form, selling_price: e.target.value })}
                placeholder="e.g. 185000"
                className={inp}
              />
            </Field>
            <Field label="Status">
              <select data-testid="add-status-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={sel}>
                {VEHICLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Purchase Date (BS)" required full>
              <BSDatePicker
                data-testid="purchase-date-input"
                value={form.purchase_date}
                onChange={val => setForm({ ...form, purchase_date: val })}
                required
              />
            </Field>
            <Field label="Purchase Source" required>
              <select data-testid="source-select" value={form.purchase_source} onChange={e => setForm({ ...form, purchase_source: e.target.value })} className={sel}>
                <option value="">Select Source</option>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Purchased From (Name)">
              <VendorAutocomplete
                value={form.purchase_from}
                onChange={(name, vendorId) => setForm({ ...form, purchase_from: name, vendor_id: vendorId || form.vendor_id })}
                placeholder="Type vendor name to search..."
                vendorType="vehicles"
              />
            </Field>
            <Field label="Condition">
              <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className={sel}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Registration Number" required>
              <input
                data-testid="registration-number-input"
                value={form.registration_number}
                onChange={e => setForm({ ...form, registration_number: e.target.value })}
                placeholder="e.g. Ba 1 Pa 1234"
                className={inp}
              />
            </Field>
            <Field label="Color">
              <input
                value={form.color}
                onChange={e => setForm({ ...form, color: e.target.value })}
                placeholder="e.g. Red, Black"
                className={inp}
              />
            </Field>
            <Field label="Link Customer / Vendor">
              <CustomerVendorPicker
                value={{ type: form.linked_contact_type || "vendor", id: form.linked_contact_id || null, name: form.linked_contact_name || "" }}
                onChange={next => setForm({ ...form, linked_contact_type: next.type, linked_contact_id: next.id, linked_contact_name: next.name })}
                vendorType="vehicles"
              />
            </Field>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle Photos</p>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors bg-blue-600 hover:bg-blue-700 text-white">
                <Plus size={12} /> Add Photo
                <input
                  type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { if (e.target.files.length) addPhotos(e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>
            {photos.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl h-24 flex flex-col items-center justify-center text-slate-400">
                <p className="text-sm font-medium">No photos yet</p>
                <p className="text-xs mt-0.5">Click &quot;+ Add Photo&quot; to upload</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {photos.map((p, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden aspect-square bg-slate-100">
                    <img src={p.previewUrl} alt="Vehicle" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removePhoto(idx)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Document Status</p>
            <div className="grid grid-cols-2 gap-3">
              {[["bluebook_status", "Bluebook"], ["insurance_status", "Insurance"], ["tax_clearance_status", "Tax Clearance"], ["transfer_status", "Transfer"]].map(([key, label]) => (
                <Field key={key} label={label}>
                  <select value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={sel}>
                    <option value="pending">Pending</option>
                    <option value="ok">OK</option>
                    <option value="missing">Missing</option>
                  </select>
                </Field>
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 sm:pt-2 sticky bottom-0 sm:static -mx-4 sm:mx-0 px-4 sm:px-0 pb-4 sm:pb-0 bg-white border-t sm:border-t-0 border-slate-100">
            <button type="button" onClick={onClose} className="flex-1 h-11 sm:h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              data-testid="save-vehicle-button"
              type="submit"
              disabled={saving}
              className="flex-1 h-11 sm:h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-all active:scale-95 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Vehicle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
