/**
 * AddVehicleModal.jsx — the Purchase Vehicle form (opened from the Inventory page).
 *
 * Four sections (Vehicle, Purchase, Paperwork, Photos & notes) with a rail to jump between them, and a footer that
 * keeps the cost price, selling price, margin and amount still owed in view while you fill it in. The fields and what
 * is saved are the same as before; Inventory's handleSave does the saving.
 */
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, UploadCloud, Check, X, ImagePlus, AlertCircle } from "lucide-react";
import BSDatePicker from "../components/BSDatePicker";
import CustomerVendorPicker from "../components/CustomerVendorPicker";
import { BRANDS, SOURCES, CONDITIONS, FUEL_TYPES, OWNERSHIP_OPTIONS, formatNPR } from "../utils/helpers";
import { PhotoCropperModal } from "../components/PhotoCropperModal";
import { usePhotoCropQueue } from "../hooks/usePhotoCropQueue";

const LBL = "block text-xs font-semibold text-slate-600 mb-1.5";
const BOX = "w-full h-11 px-3 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const OK = "border-slate-300";
const BAD = "border-red-500 ring-1 ring-red-500";
const SECTION = "px-4 sm:px-7 py-6 border-b border-slate-200 last:border-b-0 scroll-mt-2";
const H2 = "mb-4 text-base font-bold text-slate-900";
const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

const LISTING = [{ value: "available", label: "Available" }, { value: "unlisted", label: "Unlisted" }, { value: "in_repair", label: "In repair" }];
const DOC_STATUS = [{ value: "pending", label: "Pending", tone: "text-amber-800" }, { value: "ok", label: "OK", tone: "text-emerald-700" }, { value: "missing", label: "Missing", tone: "text-red-700" }];
const DOCS = [["bluebook_status", "Bluebook"], ["tax_clearance_status", "Tax clearance"], ["transfer_status", "Transfer"]];

// Plates compare without spaces, slashes or case, the same rule the Inventory page uses for duplicates.
const normPlate = (s) => (s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (x) => Number(String(x ?? "").replace(/[^\d.]/g, "")) || 0;

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
            className={`flex-1 min-w-0 h-[42px] sm:h-[38px] rounded-lg text-[13px] font-semibold transition-colors ${on ? `bg-white shadow-sm ${o.tone || "text-blue-700"}` : "text-slate-600 hover:text-slate-900"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// An amount field: "Rs." in front, digits only (what the form saves), the formatted figure under it.
function Money({ id, value, onChange, testid, error, hint }) {
  const n = digits(value);
  return (
    <div>
      <div className={`flex items-center h-11 border rounded-[10px] bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${error ? BAD : OK}`}>
        <span className="pl-3 pr-1 text-[13px] font-semibold text-slate-500">Rs.</span>
        <input
          id={id} data-testid={testid} type="text" inputMode="numeric" pattern="[0-9]*"
          value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder="0"
          className="flex-1 min-w-0 h-full pr-3 text-base sm:text-sm text-slate-900 bg-transparent outline-none"
        />
      </div>
      {hint ?? (n > 0 && <p className="mt-1 text-xs text-slate-500">{formatNPR(n)}</p>)}
    </div>
  );
}

// onImport: opens the Import Stock page; left out for roles that may not use it.
// vehicles: the stock list, so the plate can be checked while it is typed.
export function AddVehicleModal({ form, setForm, onClose, onSubmit, saving, photos, setPhotos, basicOnly = false, onImport, vehicles = [] }) {
  const [selected, setSelected] = useState(() => new Set());
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [showSanakhat, setShowSanakhat] = useState(() => !!(form.sanakhat_date || form.sanakhat_cost));
  const [active, setActive] = useState("vehicle");
  const scrollRef = useRef(null);
  const set = (patch) => setForm({ ...form, ...patch });

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

  // What Save needs (the same list Inventory's handleSave checks); shown on the fields after a first try.
  const missing = [
    !form.brand && ["brand", "brand"],
    !form.model && ["model", "model"],
    !form.registration_number && ["registration_number", "registration number"],
    ...(basicOnly ? [] : [
      !form.purchase_price && ["purchase_price", "purchase price"],
      !form.purchase_date && ["purchase_date", "purchase date"],
      !form.purchase_source && ["purchase_source", "bought from"],
    ]),
  ].filter(Boolean);
  const bad = (key) => attempted && missing.some(m => m[0] === key);

  const submit = (e) => {
    e.preventDefault();
    if (missing.length) {
      setAttempted(true);
      document.getElementById(`pv-${missing[0][0]}`)?.focus();
      return;
    }
    onSubmit(e);
  };

  // The plate, checked against stock as it is typed (the server has the final say).
  const plate = normPlate(form.registration_number);
  const plateHit = useMemo(() => {
    if (!plate) return null;
    const hits = vehicles.filter(v => normPlate(v.registration_number) === plate);
    return hits.find(v => v.status !== "sold" && v.status !== "scrap") || hits[0] || null;
  }, [plate, vehicles]);
  const plateClosed = plateHit && (plateHit.status === "sold" || plateHit.status === "scrap");
  const plateBlocked = plateHit && !plateClosed;

  // Footer figures: what it cost, what it should sell for, and the margin the app would show.
  const cost = digits(form.purchase_price) + digits(form.sanakhat_cost);
  const selling = digits(form.selling_price);
  const margin = cost > 0 && selling > 0 ? ((selling - cost) / selling) * 100 : null;
  const owed = digits(form.purchase_due);
  const listing = form.status === "available" && !selling ? "Unlisted" : (LISTING.find(l => l.value === form.status)?.label || form.status);

  const sections = [
    { id: "vehicle", label: "Vehicle", done: !!(form.brand && form.model && form.registration_number) },
    ...(basicOnly ? [] : [
      { id: "purchase", label: "Purchase", done: !!(form.purchase_price && form.purchase_date && form.purchase_source) },
      { id: "paperwork", label: "Paperwork", done: false },
    ]),
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
            <p className="hidden sm:block text-[13px] text-slate-500">Add a vehicle you have bought to your stock</p>
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

            {/* Rail (desktop) */}
            <nav aria-label="Form sections" className="hidden lg:flex flex-col gap-1 w-[188px] shrink-0 p-3.5 bg-slate-50 border-r border-slate-200">
              {sections.map((s, i) => (
                <button
                  key={s.id} type="button" onClick={() => go(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[13px] ${active === s.id ? "bg-blue-100 text-blue-700 font-bold" : "text-slate-700 font-semibold hover:bg-slate-100"}`}
                >
                  <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-xs shrink-0 ${s.done ? "bg-emerald-600 text-white" : active === s.id ? "bg-blue-600 text-white" : "border border-slate-400 text-slate-600"}`}>
                    {s.done ? <Check size={12} strokeWidth={3.2} /> : i + 1}
                  </span>
                  {s.label}
                </button>
              ))}
              <p className="mx-3 mt-5 text-xs text-slate-500"><span className="text-red-600">*</span> needed to save</p>
            </nav>

            {/* The form */}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-w-0 overflow-y-auto">

              {attempted && missing.length > 0 && (
                <div role="alert" className="mx-4 sm:mx-7 mt-5 flex gap-2.5 items-start rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-800" data-testid="purchase-missing">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <div><strong>{missing.length} {missing.length === 1 ? "thing needs" : "things need"} filling in</strong> before this can be saved: {missing.map(m => m[1]).join(", ")}.</div>
                </div>
              )}

              {/* 1 Vehicle */}
              <section id="pv-section-vehicle" className={SECTION}>
                <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Vehicle</h3>
                <div className={GRID}>
                  <div>
                    <label htmlFor="pv-brand" className={LBL}>Brand <span className="text-red-600">*</span></label>
                    <select id="pv-brand" data-testid="brand-select" value={form.brand} onChange={e => set({ brand: e.target.value })} className={`${BOX} ${bad("brand") ? BAD : OK}`}>
                      <option value="">Select brand</option>
                      {BRANDS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pv-model" className={LBL}>Model <span className="text-red-600">*</span></label>
                    <input id="pv-model" data-testid="model-input" value={form.model} onChange={e => set({ model: e.target.value })} placeholder="e.g. CB Shine, FZ-S" className={`${BOX} ${bad("model") ? BAD : OK}`} />
                  </div>
                  <div>
                    <label htmlFor="pv-year" className={LBL}>Year <span className="text-red-600">*</span></label>
                    <input id="pv-year" type="text" inputMode="numeric" pattern="[0-9]*" value={form.year} onChange={e => set({ year: e.target.value })} placeholder="e.g. 2020" className={`${BOX} ${OK}`} />
                  </div>
                  <div>
                    <label htmlFor="pv-cc" className={LBL}>Engine CC</label>
                    <input id="pv-cc" type="text" inputMode="numeric" pattern="[0-9]*" value={form.engine_cc} onChange={e => set({ engine_cc: e.target.value })} placeholder="e.g. 125" className={`${BOX} ${OK}`} />
                  </div>

                  <div>
                    <span className={LBL}>Type <span className="text-red-600">*</span></span>
                    <Seg label="Type" testid="vehicle-type-select" value={form.vehicle_type} onChange={v => set({ vehicle_type: v })} options={[{ value: "bike", label: "Bike" }, { value: "scooter", label: "Scooter" }]} />
                  </div>
                  <div>
                    <span className={LBL}>Fuel</span>
                    <Seg label="Fuel" value={form.fuel_type} onChange={v => set({ fuel_type: v })} options={FUEL_TYPES.map(f => ({ value: f, label: f }))} />
                  </div>
                  <div>
                    <label htmlFor="pv-owner" className={LBL}>Ownership</label>
                    <select id="pv-owner" data-testid="ownership-select" value={form.ownership_number} onChange={e => set({ ownership_number: e.target.value })} className={`${BOX} ${OK}`}>
                      <option value="">Not known yet</option>
                      {OWNERSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pv-cond" className={LBL}>Condition</label>
                    <select id="pv-cond" value={form.condition} onChange={e => set({ condition: e.target.value })} className={`${BOX} ${OK}`}>
                      {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="pv-registration_number" className={LBL}>Registration number <span className="text-red-600">*</span></label>
                    <input
                      id="pv-registration_number" data-testid="registration-number-input" value={form.registration_number}
                      onChange={e => set({ registration_number: e.target.value })} placeholder="e.g. 052/0164"
                      aria-invalid={plateBlocked || bad("registration_number") || undefined}
                      className={`w-full h-12 px-3.5 border rounded-[10px] bg-white text-slate-900 font-mono text-lg font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 ${plateBlocked || bad("registration_number") ? BAD : "border-slate-400"}`}
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
                    <input id="pv-color" value={form.color} onChange={e => set({ color: e.target.value })} placeholder="e.g. Red, Black" className={`w-full h-12 px-3.5 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${OK}`} />
                  </div>
                </div>
              </section>

              {/* 2 Purchase */}
              {!basicOnly && (
                <section id="pv-section-purchase" className={SECTION}>
                  <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Purchase</h3>
                  <div className={GRID}>
                    <div>
                      <span id="pv-purchase_date" tabIndex={-1} className={LBL}>Purchase date (BS) <span className="text-red-600">*</span></span>
                      <BSDatePicker data-testid="purchase-date-input" value={form.purchase_date} onChange={val => set({ purchase_date: val })} required />
                      {bad("purchase_date") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick the date you bought it</p>}
                    </div>
                    <div>
                      <label htmlFor="pv-purchase_source" className={LBL}>Bought from <span className="text-red-600">*</span></label>
                      <select id="pv-purchase_source" data-testid="source-select" value={form.purchase_source} onChange={e => set({ purchase_source: e.target.value })} className={`${BOX} ${bad("purchase_source") ? BAD : OK}`}>
                        <option value="">Select source</option>
                        {SOURCES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <span className={LBL}>Name (customer or vendor)</span>
                      <CustomerVendorPicker
                        value={{ type: form.linked_contact_type || "vendor", id: form.linked_contact_id || null, name: form.linked_contact_name || "" }}
                        onChange={next => set({ linked_contact_type: next.type, linked_contact_id: next.id, linked_contact_name: next.name })}
                        vendorType="vehicles"
                      />
                    </div>

                    <div>
                      <label htmlFor="pv-purchase_price" className={LBL}>Purchase price <span className="text-red-600">*</span></label>
                      <Money id="pv-purchase_price" testid="purchase-price-input" value={form.purchase_price} onChange={v => set({ purchase_price: v })} error={bad("purchase_price")} />
                      {bad("purchase_price") && <p className="mt-1 text-xs font-semibold text-red-700">Enter what you paid, even if part is still owed</p>}
                    </div>
                    <div>
                      <label htmlFor="pv-due" className={LBL}>Still owed to seller</label>
                      <Money
                        id="pv-due" testid="purchase-due-input" value={form.purchase_due} onChange={v => set({ purchase_due: v })}
                        hint={owed > 0 && digits(form.purchase_price) >= owed ? <p className="mt-1 text-xs text-slate-500">Paid now: {formatNPR(digits(form.purchase_price) - owed)}</p> : undefined}
                      />
                    </div>
                    <div>
                      <label htmlFor="pv-selling" className={LBL}>Selling price</label>
                      <Money id="pv-selling" value={form.selling_price} onChange={v => set({ selling_price: v })} />
                    </div>
                    <div>
                      <span className={LBL}>Listing</span>
                      <Seg label="Listing" testid="add-status-select" value={form.status} onChange={v => set({ status: v })} options={LISTING} />
                      <p className="mt-1 text-xs text-slate-500">Available needs a selling price</p>
                    </div>
                  </div>
                </section>
              )}

              {/* 3 Paperwork */}
              {!basicOnly && (
                <section id="pv-section-paperwork" className={SECTION}>
                  <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Paperwork <span className="ml-1 text-xs font-medium text-slate-500" style={{ fontFamily: "Inter, sans-serif" }}>optional, can be filled in later</span></h3>
                  <div className={GRID}>
                    {DOCS.map(([key, label]) => (
                      <div key={key}>
                        <span className={LBL}>{label}</span>
                        <Seg label={label} value={form[key]} onChange={v => set({ [key]: v })} options={DOC_STATUS} />
                      </div>
                    ))}
                    <div className="flex items-end">
                      <button
                        type="button" onClick={() => setShowSanakhat(s => !s)} aria-expanded={showSanakhat}
                        className="flex items-center justify-center gap-2 w-full h-11 border border-dashed border-slate-400 rounded-[10px] bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Plus size={14} /> Sanaakhat date &amp; cost
                      </button>
                    </div>
                    {showSanakhat && (
                      <>
                        <div className="sm:col-span-2">
                          <span className={LBL}>Sanaakhat date (BS)</span>
                          <BSDatePicker value={form.sanakhat_date || ""} onChange={val => set({ sanakhat_date: val })} />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <label htmlFor="pv-sanakhat" className={LBL}>Sanaakhat cost</label>
                          <Money id="pv-sanakhat" testid="sanakhat-cost-input" value={form.sanakhat_cost} onChange={v => set({ sanakhat_cost: v })} />
                        </div>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* 4 Photos and notes */}
              <section id="pv-section-photos" className={SECTION}>
                <div className="flex items-center justify-between mb-4 gap-2">
                  <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{basicOnly ? "Photos" : "Photos & notes"}</h3>
                  {selected.size > 0 && (
                    <button type="button" onClick={removeSelected} className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white">
                      <Trash2 size={13} /> Remove selected ({selected.size})
                    </button>
                  )}
                </div>
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

                {!basicOnly && (
                  <>
                    <label htmlFor="pv-notes" className={`${LBL} mt-5`}>Notes</label>
                    <textarea
                      id="pv-notes" value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Anything worth remembering about this vehicle" rows={3}
                      className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-300 rounded-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </>
                )}
              </section>
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
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">Owed to seller</div>
                  <div className={`text-lg font-extrabold ${owed > 0 ? "text-amber-700" : "text-slate-400"}`} style={{ fontFamily: "Manrope, sans-serif" }}>{owed > 0 ? formatNPR(owed) : "—"}</div>
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

      {previewPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewPhoto(null)}>
          <button onClick={() => setPreviewPhoto(null)} aria-label="Close preview" className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white"><X size={20} /></button>
          <img src={previewPhoto} alt="Vehicle full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <PhotoCropperModal imageSrc={activeSrc} onCancel={cancelActive} onConfirm={confirmActive} />
    </div>
  );
}
