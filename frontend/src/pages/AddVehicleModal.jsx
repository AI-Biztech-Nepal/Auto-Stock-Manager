/**
 * AddVehicleModal.jsx — the vehicle form.
 *
 * VehicleFormBody is the form itself: four sections on one scrolling page (Purchase, Vehicle, Paperwork, Photos & notes).
 * AddVehicleModal wraps it in the Purchase Vehicle window opened from Inventory: a header, chips for phones to jump
 * between the sections, and a footer that keeps the cost price, selling price and margin in view. VehicleDetail puts the
 * same body in a vehicle's Overview tab, read-only until Edit is pressed.
 */
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, UploadCloud, Check, X, ImagePlus, AlertCircle, FileText } from "lucide-react";
import BSDatePicker from "../components/BSDatePicker";
import CustomerVendorPicker from "../components/CustomerVendorPicker";
import { BRANDS, SOURCES, CONDITIONS, FUEL_TYPES, OWNERSHIP_OPTIONS, VEHICLE_STATUS_OPTIONS, formatNPR } from "../utils/helpers";
import { EMPTY_DOC_PHOTOS } from "../utils/stagedDocs";
import { PhotoCropperModal } from "../components/PhotoCropperModal";
import { usePhotoCropQueue } from "../hooks/usePhotoCropQueue";

const LBL = "block text-xs font-semibold text-slate-600 mb-1.5";
// A box that is switched off (the form is read-only) keeps its text dark, drops the grey-out and, for a dropdown, the arrow.
const RO = "disabled:bg-slate-50 disabled:text-slate-900 disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100 disabled:cursor-default disabled:appearance-none";
const BOX = `w-full h-11 px-3 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${RO}`;
const OK = "border-slate-300";
const BAD = "border-red-500 ring-1 ring-red-500";
const SECTION = "px-4 sm:px-7 py-6 border-b border-slate-200 last:border-b-0 scroll-mt-2";
const H2 = "mb-4 text-base font-bold text-slate-900";
// The date picker's trigger, sized like BOX (the picker draws its own focus ring).
const DATE_BOX = "w-full h-11 px-3 text-base sm:text-sm border rounded-[10px] bg-white disabled:bg-slate-50 disabled:cursor-default disabled:hover:border-slate-300";
const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

const LISTING = [{ value: "available", label: "Available" }, { value: "unlisted", label: "Unlisted" }, { value: "in_repair", label: "In repair" }];
const TERMINATION = [{ value: "pending", label: "Pending" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const VEHICLE_TYPES = [{ value: "bike", label: "Bike" }, { value: "scooter", label: "Scooter" }];
const DOC_STATUS = [{ value: "pending", label: "Pending", tone: "text-amber-800" }, { value: "ok", label: "OK", tone: "text-emerald-700" }, { value: "missing", label: "Missing", tone: "text-red-700" }];
// [document type, label]: the type is what the paperwork photos are filed under, and `${type}_status` is its status field.
const DOCS = [["bluebook", "Bluebook"], ["tax_clearance", "Tax clearance"], ["transfer", "Transfer"]];

// Plates compare without spaces, slashes or case, the same rule the Inventory page uses for duplicates.
const normPlate = (s) => (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (x) => Number(String(x ?? "").replace(/[^\d.]/g, "")) || 0;

// What Save needs, as [field, name] in page order (the first one is the field that gets focus). Editing leaves out the
// date and source: an older record may have neither, and that should not stop a change to something else.
export function vehicleMissing(form, { basicOnly = false, editing = false } = {}) {
  return [
    ...(basicOnly ? [] : [
      !editing && !form.purchase_date && ["purchase_date", "purchase date"],
      !editing && !form.purchase_source && ["purchase_source", "bought from"],
      !form.purchase_price && ["purchase_price", "purchase price"],
    ]),
    !form.brand && ["brand", "brand"],
    !form.model && ["model", "model"],
    !form.registration_number && ["registration_number", "registration number"],
  ].filter(Boolean);
}

// Marking ownership termination Done with no date saved dates it today, as the Sanaakhat page does, so the 35-day
// countdown has a start.
function datedToday(status, form) {
  if (status !== "yes" || (form.sanakhat_date || "").slice(0, 10)) return {};
  const now = new Date();
  return { sanakhat_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` };
}

// A row of choices where exactly one is on, drawn as a segmented control.
function Seg({ value, onChange, options, label, testid }) {
  return (
    <div role="group" aria-label={label} data-testid={testid} className="flex gap-0.5 p-[3px] bg-slate-100 rounded-[10px]">
      {options.map(o => {
        const on = String(value) === String(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-0 h-[42px] sm:h-[38px] rounded-lg text-[13px] font-semibold transition-colors disabled:cursor-default ${on ? `bg-white shadow-sm ${o.tone || "text-blue-700"}` : "text-slate-600 hover:text-slate-900 disabled:hover:text-slate-600"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// An amount field: "Rs." in front, digits only (what the form saves), the formatted figure under it.
function Money({ id, value, onChange, testid, error, placeholder = "0" }) {
  const n = digits(value);
  return (
    <div>
      <div className={`flex items-center h-11 border rounded-[10px] bg-white has-[:disabled]:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${error ? BAD : OK}`}>
        <span className="pl-3 pr-1 text-[13px] font-semibold text-slate-500">Rs.</span>
        <input
          id={id} data-testid={testid} type="text" inputMode="numeric" pattern="[0-9]*"
          value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="flex-1 min-w-0 h-full pr-3 text-base sm:text-sm text-slate-900 bg-transparent outline-none disabled:cursor-default disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100"
        />
      </div>
      {n > 0 && <p className="mt-1 text-xs text-slate-500">{formatNPR(n)}</p>}
    </div>
  );
}

// The form's four sections, for a new purchase or (editing) for a vehicle already in stock.
// form / setForm: the values, as the API has them (setForm gets the whole next form).
// photos / setPhotos: the vehicle's own photos waiting to be uploaded (a new purchase only).
// docPhotos / setDocPhotos: paperwork photos waiting to be uploaded, { bluebook: [{ file, previewUrl }], tax_clearance: [], transfer: [] }.
// vehicles: the stock list, so a new plate can be checked while it is typed.
// editing: an existing vehicle: adds the fields only it has (minimum selling price, any status, ownership termination and
//   the Sanaakhat date and cost), leaves out the vehicle photos (they live on its page) and says how many documents of each
//   type are already on file (existingDocs). readOnly: shows it all without letting anything be changed.
// attempted: Save was pressed, so the fields still missing are marked. hideCost / hidePricing: what a role may not see.
// sanakhatNote: a line under the Sanaakhat date (when it is next due, how long it has waited).
export function VehicleFormBody({
  form, setForm, photos = [], setPhotos = () => {}, docPhotos = EMPTY_DOC_PHOTOS, setDocPhotos = () => {},
  basicOnly = false, vehicles = [], editing = false, readOnly = false, attempted = false, existingDocs = {},
  hideCost = false, hidePricing = false, sanakhatNote = null,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [showSanakhat, setShowSanakhat] = useState(() => !!(form.sanakhat_date || form.sanakhat_cost));
  const set = (patch) => setForm({ ...form, ...patch });
  const ph = (text) => (readOnly ? "—" : text); // an empty box reads as a dash, not as a prompt, when nothing can be typed

  const stageCroppedPhoto = (file) => {
    setPhotos(prev => [...prev, { file, previewUrl: URL.createObjectURL(file) }]);
  };
  const { activeSrc, enqueueFiles, cancelActive, confirmActive } = usePhotoCropQueue(stageCroppedPhoto);

  const toggleSelected = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const removeSelected = () => {
    setPhotos(prev => {
      prev.forEach((p, idx) => { if (selected.has(idx)) URL.revokeObjectURL(p.previewUrl); });
      return prev.filter((_, idx) => !selected.has(idx));
    });
    setSelected(new Set());
  };

  // Paperwork photos are not cropped. Saving one files it under its document and marks that document OK (the server
  // does the same on upload), so the status follows: OK once a photo is waiting, and back to what it was when the last
  // one comes off.
  const statusBeforePhotos = useRef({});
  const addDocFiles = (doc, fileList) => {
    const added = Array.from(fileList).map(file => ({ file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }));
    if (!added.length) return;
    const key = `${doc}_status`;
    if (!(docPhotos[doc] || []).length) statusBeforePhotos.current[doc] = form[key];
    setDocPhotos(prev => ({ ...prev, [doc]: [...(prev[doc] || []), ...added] }));
    if (form[key] !== "ok") set({ [key]: "ok" });
  };
  const removeDocFile = (doc, idx) => {
    const list = docPhotos[doc] || [];
    const key = `${doc}_status`;
    if (list[idx]?.previewUrl) URL.revokeObjectURL(list[idx].previewUrl);
    setDocPhotos(prev => ({ ...prev, [doc]: (prev[doc] || []).filter((_, i) => i !== idx) }));
    if (list.length === 1 && form[key] === "ok") set({ [key]: statusBeforePhotos.current[doc] ?? "pending" });
  };

  const missing = vehicleMissing(form, { basicOnly, editing });
  const bad = (key) => attempted && missing.some(m => m[0] === key);

  // The plate, checked against stock as it is typed (the server has the final say). Not for a vehicle already in stock,
  // which would find itself.
  const plate = editing ? "" : normPlate(form.registration_number);
  const plateHit = useMemo(() => {
    if (!plate) return null;
    const hits = vehicles.filter(v => normPlate(v.registration_number) === plate);
    return hits.find(v => v.status !== "sold" && v.status !== "scrap") || hits[0] || null;
  }, [plate, vehicles]);
  const plateClosed = plateHit && (plateHit.status === "sold" || plateHit.status === "scrap");
  const plateBlocked = plateHit && !plateClosed;

  const statusOptions = editing ? VEHICLE_STATUS_OPTIONS : LISTING; // an existing vehicle can be in any status, sold included
  const sanakhatOpen = editing || showSanakhat;

  return (
    <>
      <fieldset disabled={readOnly} className="min-w-0 m-0 p-0 border-0">
        {attempted && missing.length > 0 && (
          <div role="alert" className="mx-4 sm:mx-7 mt-5 flex gap-2.5 items-start rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-800" data-testid="purchase-missing">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div><strong>{missing.length} {missing.length === 1 ? "thing needs" : "things need"} filling in</strong> before this can be saved: {missing.map(m => m[1]).join(", ")}.</div>
          </div>
        )}

        {/* 1 Purchase */}
        {!basicOnly && (
          <section id="pv-section-purchase" className={SECTION}>
            <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Purchase</h3>
            <div className={GRID}>
              <div>
                <span id="pv-purchase_date" tabIndex={-1} className={LBL}>Purchase date (BS) <span className="text-red-600">*</span></span>
                <BSDatePicker data-testid="purchase-date-input" value={form.purchase_date || ""} onChange={val => set({ purchase_date: val })} required triggerClassName={`${DATE_BOX} ${bad("purchase_date") ? BAD : OK}`} />
                {bad("purchase_date") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick the date you bought it</p>}
              </div>
              <div>
                <label htmlFor="pv-purchase_source" className={LBL}>Bought from <span className="text-red-600">*</span></label>
                <select id="pv-purchase_source" data-testid="source-select" value={form.purchase_source ?? ""} onChange={e => set({ purchase_source: e.target.value })} className={`${BOX} ${bad("purchase_source") ? BAD : OK}`}>
                  <option value="">{readOnly ? "—" : "Select source"}</option>
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <span className={LBL}>Name</span>
                <CustomerVendorPicker
                  combined
                  value={{ type: form.linked_contact_type || "vendor", id: form.linked_contact_id || null, name: form.linked_contact_name || "" }}
                  onChange={next => set({ linked_contact_type: next.type, linked_contact_id: next.id, linked_contact_name: next.name })}
                  vendorType="vehicles"
                  placeholder={readOnly ? "—" : undefined}
                />
              </div>

              {!hideCost && (
                <div>
                  <label htmlFor="pv-purchase_price" className={LBL}>Purchase price <span className="text-red-600">*</span></label>
                  <Money id="pv-purchase_price" testid="purchase-price-input" value={form.purchase_price} onChange={v => set({ purchase_price: v })} error={bad("purchase_price")} placeholder={ph("0")} />
                  {bad("purchase_price") && <p className="mt-1 text-xs font-semibold text-red-700">Enter what you paid</p>}
                </div>
              )}
              {!hidePricing && (
                <div>
                  <label htmlFor="pv-selling" className={LBL}>Selling price</label>
                  <Money id="pv-selling" value={form.selling_price} onChange={v => set({ selling_price: v })} placeholder={readOnly ? "Not set" : "0"} />
                </div>
              )}
              {editing && !hideCost && !hidePricing && (
                <div>
                  <label htmlFor="pv-minimum" className={LBL}>Minimum selling price</label>
                  <Money id="pv-minimum" testid="minimum-selling-price-input" value={form.minimum_selling_price} onChange={v => set({ minimum_selling_price: v })} placeholder={readOnly ? "Not set" : "0"} />
                </div>
              )}
              <div>
                <label htmlFor="pv-status" className={LBL}>{editing ? "Status" : "Listing"}</label>
                <select id="pv-status" data-testid={editing ? "edit-status-select" : "add-status-select"} value={form.status ?? ""} onChange={e => set({ status: e.target.value })} className={`${BOX} ${OK}`}>
                  {statusOptions.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                {!readOnly && <p className="mt-1 text-xs text-slate-500">Available needs a selling price</p>}
              </div>
            </div>
          </section>
        )}

        {/* 2 Vehicle */}
        <section id="pv-section-vehicle" className={SECTION}>
          <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Vehicle</h3>
          <div className={GRID}>
            <div>
              <label htmlFor="pv-brand" className={LBL}>Brand <span className="text-red-600">*</span></label>
              <select id="pv-brand" data-testid="brand-select" value={form.brand ?? ""} onChange={e => set({ brand: e.target.value })} className={`${BOX} ${bad("brand") ? BAD : OK}`}>
                <option value="">{readOnly ? "—" : "Select brand"}</option>
                {BRANDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-model" className={LBL}>Model <span className="text-red-600">*</span></label>
              <input id="pv-model" data-testid="model-input" value={form.model ?? ""} onChange={e => set({ model: e.target.value })} placeholder={ph("e.g. CB Shine, FZ-S")} className={`${BOX} ${bad("model") ? BAD : OK}`} />
            </div>
            <div>
              <label htmlFor="pv-year" className={LBL}>Year <span className="text-red-600">*</span></label>
              <input id="pv-year" type="text" inputMode="numeric" pattern="[0-9]*" value={form.year ?? ""} onChange={e => set({ year: e.target.value })} placeholder={ph("e.g. 2020")} className={`${BOX} ${OK}`} />
            </div>
            <div>
              <label htmlFor="pv-cc" className={LBL}>Engine CC</label>
              <input id="pv-cc" type="text" inputMode="numeric" pattern="[0-9]*" value={form.engine_cc ?? ""} onChange={e => set({ engine_cc: e.target.value })} placeholder={ph("e.g. 125")} className={`${BOX} ${OK}`} />
            </div>

            <div>
              <label htmlFor="pv-type" className={LBL}>Type <span className="text-red-600">*</span></label>
              <select id="pv-type" data-testid="vehicle-type-select" value={form.vehicle_type || "bike"} onChange={e => set({ vehicle_type: e.target.value })} className={`${BOX} ${OK}`}>
                {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-fuel" className={LBL}>Fuel</label>
              <select id="pv-fuel" value={form.fuel_type ?? ""} onChange={e => set({ fuel_type: e.target.value })} className={`${BOX} ${OK}`}>
                {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-owner" className={LBL}>Ownership</label>
              <select id="pv-owner" data-testid="ownership-select" value={form.ownership_number ?? ""} onChange={e => set({ ownership_number: e.target.value })} className={`${BOX} ${OK}`}>
                <option value="">Not known yet</option>
                {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-cond" className={LBL}>Condition</label>
              <select id="pv-cond" value={form.condition ?? ""} onChange={e => set({ condition: e.target.value })} className={`${BOX} ${OK}`}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pv-registration_number" className={LBL}>Registration number <span className="text-red-600">*</span></label>
              <input
                id="pv-registration_number" data-testid="registration-number-input" value={form.registration_number ?? ""}
                onChange={e => set({ registration_number: e.target.value })} placeholder={ph("e.g. 052/0164")}
                aria-invalid={plateBlocked || bad("registration_number") || undefined}
                className={`w-full h-12 px-3.5 border rounded-[10px] bg-white text-slate-900 font-mono text-lg font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 ${RO} ${plateBlocked || bad("registration_number") ? BAD : "border-slate-400"}`}
              />
              {plateBlocked && (
                <p className="mt-1.5 text-xs font-semibold text-red-700" data-testid="plate-in-stock">
                  {form.registration_number} is already in stock as {[plateHit.brand, plateHit.model, plateHit.year].filter(Boolean).join(" ")} ({plateHit.status.replace("_", " ")}). A plate can only be in stock once.
                </p>
              )}
              {plateClosed && (
                <p className="mt-1.5 text-xs font-semibold text-amber-700" data-testid="plate-sold-before">
                  This plate belongs to a {plateHit.status} {[plateHit.brand, plateHit.model, plateHit.year].filter(Boolean).join(" ")}. You will be asked to confirm if this is a vehicle you bought back.
                </p>
              )}
              {plate && !plateHit && <p className="mt-1.5 text-xs text-emerald-700">Not in stock yet, good to add</p>}
              {bad("registration_number") && <p className="mt-1.5 text-xs font-semibold text-red-700">Enter the plate number</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pv-color" className={LBL}>Color</label>
              <input id="pv-color" value={form.color ?? ""} onChange={e => set({ color: e.target.value })} placeholder={ph("e.g. Red, Black")} className={`w-full h-12 px-3.5 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${RO} ${OK}`} />
            </div>
          </div>
        </section>

        {/* 3 Paperwork */}
        {!basicOnly && (
          <section id="pv-section-paperwork" className={SECTION}>
            <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Paperwork {!readOnly && <span className="ml-1 text-xs font-medium text-slate-500" style={{ fontFamily: "Inter, sans-serif" }}>optional, can be filled in later</span>}</h3>
            <div className={GRID}>
              {/* Each document: its status, then a photo (or scan) of it, uploaded once the vehicle is saved */}
              {DOCS.map(([doc, label]) => {
                const files = docPhotos[doc] || [];
                return (
                  <div key={doc} data-testid={`doc-photos-${doc}`}>
                    <span className={LBL}>{label}{(existingDocs[doc] || 0) > 0 && <span className="ml-1.5 font-medium text-slate-500">· {existingDocs[doc]} on file</span>}</span>
                    <Seg label={label} value={form[`${doc}_status`] || "pending"} onChange={v => set({ [`${doc}_status`]: v })} options={DOC_STATUS} />
                    {!readOnly && (
                      <label className="mt-2 flex items-center justify-center gap-2 w-full h-11 border border-dashed border-slate-400 rounded-[10px] bg-white text-[13px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
                        <ImagePlus size={16} /> Add photo
                        <input type="file" accept="image/*,.pdf" multiple className="hidden" data-testid={`doc-photo-input-${doc}`} onChange={e => { addDocFiles(doc, e.target.files); e.target.value = ""; }} />
                      </label>
                    )}
                    {files.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {files.map((f, idx) => (
                          <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-slate-100" title={f.file.name}>
                            {f.previewUrl ? (
                              <button type="button" onClick={() => setPreviewPhoto(f.previewUrl)} className="block w-full h-full" aria-label={`Preview ${label} photo ${idx + 1}`}>
                                <img src={f.previewUrl} alt={`${label} ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><FileText size={18} className="text-slate-400" /></div>
                            )}
                            <button type="button" onClick={() => removeDocFile(doc, idx)} aria-label={`Remove ${label} photo ${idx + 1}`} className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-black/55 hover:bg-red-600 text-white flex items-center justify-center">
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div>
                {editing ? (
                  <>
                    <label htmlFor="pv-termination" className={LBL}>Ownership termination</label>
                    <select id="pv-termination" data-testid="termination-select" value={form.ownership_termination_status || "pending"} onChange={e => set({ ownership_termination_status: e.target.value, ...datedToday(e.target.value, form) })} className={`${BOX} ${OK}`}>
                      {TERMINATION.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <span className={`${LBL} hidden sm:block`} aria-hidden="true">&nbsp;</span>
                    <button
                      type="button" onClick={() => setShowSanakhat(s => !s)} aria-expanded={showSanakhat}
                      className="flex items-center justify-center gap-2 w-full h-11 border border-dashed border-slate-400 rounded-[10px] bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={14} /> Sanaakhat date &amp; cost
                    </button>
                  </>
                )}
              </div>
              {sanakhatOpen && (
                <>
                  <div className="sm:col-span-2">
                    <span className={LBL}>Sanaakhat date (BS)</span>
                    <BSDatePicker value={form.sanakhat_date || ""} onChange={val => set({ sanakhat_date: val })} triggerClassName={`${DATE_BOX} ${OK}`} placeholder={readOnly ? "—" : undefined} />
                    {sanakhatNote && <p className="mt-1 text-xs text-slate-500" data-testid="sanakhat-note">{sanakhatNote}</p>}
                  </div>
                  {!hideCost && (
                    <div className="sm:col-span-2 lg:col-span-1">
                      <label htmlFor="pv-sanakhat" className={LBL}>Sanaakhat cost</label>
                      <Money id="pv-sanakhat" testid="sanakhat-cost-input" value={form.sanakhat_cost} onChange={v => set({ sanakhat_cost: v })} placeholder={ph("0")} />
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* 4 Photos and notes (an existing vehicle's photos are managed on its own page, so only the notes) */}
        <section id="pv-section-photos" className={SECTION}>
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{editing ? "Notes" : basicOnly ? "Photos" : "Photos & notes"}</h3>
            {selected.size > 0 && (
              <button type="button" onClick={removeSelected} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white">
                <Trash2 size={13} /> Remove selected ({selected.size})
              </button>
            )}
          </div>
          {!editing && (
            <>
              <div className="flex flex-wrap gap-3">
                <label className="w-full sm:w-44 h-14 sm:h-32 shrink-0 flex flex-row sm:flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-400 rounded-[14px] bg-slate-50 text-slate-700 cursor-pointer hover:bg-slate-100">
                  <ImagePlus size={24} />
                  <span className="text-sm font-semibold">Add photos</span>
                  <span className="hidden sm:block text-[11px] text-slate-500">you can crop each one</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files.length) enqueueFiles(e.target.files); e.target.value = ""; }} />
                </label>
                {photos.map((p, idx) => (
                  <div key={idx} className="relative w-[calc(33.333%-0.5rem)] sm:w-[170px] aspect-[4/3] sm:aspect-auto sm:h-32 rounded-[14px] overflow-hidden bg-slate-100">
                    <button type="button" onClick={() => setPreviewPhoto(p.previewUrl)} className="block w-full h-full" aria-label={`Preview photo ${idx + 1}`}>
                      <img src={p.previewUrl} alt={`Vehicle ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                    {idx === 0 && <span className="absolute top-2 left-2 bg-blue-600 text-white text-[11px] font-bold rounded-full px-2.5 py-0.5">Cover</span>}
                    <button
                      type="button" onClick={() => toggleSelected(idx)} aria-pressed={selected.has(idx)} title="Select for removal"
                      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${selected.has(idx) ? "bg-red-600 border-red-600" : "bg-white/80 border-white"}`}
                    >
                      {selected.has(idx) && <div className="w-2 h-2 bg-white rounded-sm" />}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Two or more photos are needed before this shows as fully photographed.</p>
            </>
          )}

          {!basicOnly && (
            <>
              <label htmlFor="pv-notes" className={editing ? "sr-only" : `${LBL} mt-5`}>Notes</label>
              <textarea
                id="pv-notes" value={form.notes ?? ""} onChange={e => set({ notes: e.target.value })} placeholder={ph("Anything worth remembering about this vehicle")} rows={3}
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-300 rounded-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50 disabled:text-slate-900 disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100"
              />
            </>
          )}
        </section>
      </fieldset>

      {previewPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewPhoto(null)}>
          <button onClick={() => setPreviewPhoto(null)} aria-label="Close preview" className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white"><X size={20} /></button>
          <img src={previewPhoto} alt="Vehicle full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <PhotoCropperModal imageSrc={activeSrc} onCancel={cancelActive} onConfirm={confirmActive} />
    </>
  );
}

// onImport: opens the Import Stock page; left out for roles that may not use it.
// The other props are VehicleFormBody's: the form, its photos and the stock list.
export function AddVehicleModal({ form, setForm, onClose, onSubmit, saving, photos, setPhotos, docPhotos, setDocPhotos, basicOnly = false, onImport, vehicles = [] }) {
  const [attempted, setAttempted] = useState(false);
  const [active, setActive] = useState("vehicle");

  const submit = (e) => {
    e.preventDefault();
    const missing = vehicleMissing(form, { basicOnly });
    if (missing.length) {
      setAttempted(true);
      document.getElementById(`pv-${missing[0][0]}`)?.focus();
      return;
    }
    onSubmit(e);
  };

  // Footer figures: what it cost, what it should sell for, and the margin the app would show.
  const cost = digits(form.purchase_price) + digits(form.sanakhat_cost);
  const selling = digits(form.selling_price);
  const margin = cost > 0 && selling > 0 ? ((selling - cost) / selling) * 100 : null;
  const listing = form.status === "available" && !selling ? "Unlisted" : (LISTING.find(l => l.value === form.status)?.label || form.status);

  const sections = [
    ...(basicOnly ? [] : [{ id: "purchase", label: "Purchase", done: !!(form.purchase_price && form.purchase_date && form.purchase_source) }]),
    { id: "vehicle", label: "Vehicle", done: !!(form.brand && form.model && form.registration_number) },
    ...(basicOnly ? [] : [{ id: "paperwork", label: "Paperwork", done: false }]),
    { id: "photos", label: basicOnly ? "Photos" : "Photos & notes", done: photos.length > 0 },
  ];
  const go = (id) => document.getElementById(`pv-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const onScroll = (e) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    let cur = sections[0].id;
    for (const s of sections) {
      const el = document.getElementById(`pv-section-${s.id}`);
      if (el && el.getBoundingClientRect().top - top <= 80) cur = s.id;
    }
    if (cur !== active) setActive(cur);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl lg:max-w-6xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 pl-4 sm:pl-7 pr-2 sm:pr-4 py-3 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 truncate" style={{ fontFamily: "Manrope, sans-serif" }}>Purchase Vehicle</h2>
            <p className="hidden sm:block text-[13px] text-slate-500">Add a vehicle you have bought to your stock <span className="text-slate-400">· <span className="text-red-600">*</span> needed to save</span></p>
          </div>
          {onImport && (
            <button type="button" onClick={onImport} data-testid="import-stock-btn" className="flex items-center gap-2 h-11 px-3 sm:px-4 border border-slate-300 rounded-[10px] text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
              <UploadCloud size={16} /> <span className="hidden sm:inline">Import a list</span><span className="sm:hidden">Import</span>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center rounded-[10px] text-slate-600 hover:bg-slate-100 shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col flex-1 min-h-0">

          {/* Section chips (phones and tablets) */}
          <nav aria-label="Form sections" className="lg:hidden flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-slate-200 bg-slate-50 shrink-0">
            {sections.map(s => (
              <button
                key={s.id} type="button" onClick={() => go(s.id)}
                className={`shrink-0 flex items-center gap-1.5 h-11 px-4 rounded-full text-[13px] font-semibold ${active === s.id ? "bg-blue-600 text-white" : s.done ? "bg-emerald-100 text-emerald-800" : "bg-white border border-slate-300 text-slate-700"}`}
              >
                {s.done && active !== s.id && <Check size={13} strokeWidth={3} />}{s.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-1 min-h-0">
            <div onScroll={onScroll} className="flex-1 min-w-0 overflow-y-auto">
              <VehicleFormBody
                form={form} setForm={setForm} photos={photos} setPhotos={setPhotos} docPhotos={docPhotos} setDocPhotos={setDocPhotos}
                basicOnly={basicOnly} vehicles={vehicles} attempted={attempted}
              />
            </div>
          </div>

          {/* Footer: what this purchase adds up to, and the actions */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-7 gap-y-3 px-4 sm:px-7 py-3 border-t border-slate-200 bg-slate-50">
            {!basicOnly && (
              <>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">Cost price</div>
                  <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="purchase-cost">{formatNPR(cost)}</div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-[11px] font-semibold text-slate-500">Selling price</div>
                  <div className="text-lg font-extrabold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{selling ? formatNPR(selling) : "Not set"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">Expected margin</div>
                  <div className={`text-lg font-extrabold ${margin === null ? "text-slate-400" : margin < 8 ? "text-red-700" : "text-emerald-700"}`} style={{ fontFamily: "Manrope, sans-serif" }} data-testid="purchase-margin">{margin === null ? "—" : `${margin.toFixed(1)}%`}</div>
                </div>
                <span className="hidden md:inline-block text-xs font-semibold text-blue-800 bg-blue-100 rounded-full px-3 py-1.5">{form.status === "available" && !selling ? "Will be saved as Unlisted (no selling price yet)" : `Will be listed as ${listing}`}</span>
              </>
            )}
            <div className="flex-1" />
            <div className="flex gap-3 w-full sm:w-auto">
              <button type="button" onClick={onClose} className="flex-1 sm:flex-none h-12 px-6 border border-slate-300 rounded-[10px] bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                data-testid="save-vehicle-button" type="submit" disabled={saving}
                className="flex-1 sm:flex-none h-12 px-7 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Purchase Vehicle"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
