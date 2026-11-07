import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Check, Printer, FileSpreadsheet, CalendarDays } from "lucide-react";
import * as XLSX from "xlsx";
import { formatBSDate } from "../../utils/nepali-date";
import { npr } from "./money";

// Styled after Jageer Nepal's Finance kit (BookKit / FormKit): its input, its blue toolbar button (#1D4ED8),
// its white outline button, and the white rounded card with a soft shadow that its forms and tables sit in.
export const inputCls = "w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500";
export const btnPrimary = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-[13px] font-semibold disabled:opacity-50 transition-colors";
export const btnGhost = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 text-[13px] font-semibold disabled:opacity-50 transition-colors";
// The big Save on an entry form (Jageer's FINANCE_ENTRY_ACCENT, with its glow).
export const btnSave = "inline-flex items-center justify-center gap-2 h-10 px-8 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-50 shadow-[0_2px_6px_rgba(37,99,235,0.35)] transition-colors";

export const Card = ({ children, className = "" }) => (
  <div className={`bg-white border border-gray-200 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_12px_rgba(16,24,40,0.03)] ${className}`}>{children}</div>
);

// A small grey section title with its icon, as Jageer's FormSection / FormCard heads a group of fields.
export const SectionTitle = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-1.5 mb-3">{Icon && <Icon size={13} className="text-gray-400" />}<span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{children}</span></div>
);

// A soft coloured tag (a row's type, an age group ...).
export const Pill = ({ text, color, bg }) => (
  <span className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap" style={{ color, backgroundColor: bg }}>{text}</span>
);

// Jageer's segmented filter: grey track, the chosen one white with blue text.
export function FilterTabs({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1 gap-0.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${value === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{l}</button>
      ))}
    </div>
  );
}

export const Notice = ({ tone = "amber", children }) => {
  const tones = { amber: "bg-amber-50 border-amber-200 text-amber-800", red: "bg-red-50 border-red-200 text-red-700", blue: "bg-blue-50 border-blue-200 text-blue-800" };
  return <div className={`border rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
};

export const Field = ({ label, hint, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
  </label>
);

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sticky top-0 bg-white flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// An AD date with its Bikram Sambat equivalent underneath, so nobody converts in their head.
export const BsUnder = ({ date }) => (date ? <span className="block text-xs text-slate-400 mt-1">{formatBSDate(date)} BS</span> : null);

export const DateField = ({ label = "Date", value, onChange, max }) => (
  <Field label={label}>
    <input type="date" value={value || ""} max={max} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    <BsUnder date={value} />
  </Field>
);

// `available` (optional, from balances(books).buckets): each option shows what the account holds right now,
// as Finance Nepal's picker does, so nobody pays out of an account that cannot cover it.
const withAmount = (name, bucket) => (bucket ? `${name}  —  ${npr(bucket.total)}` : name);
export const AccountSelect = ({ label = "Payment method", value, onChange, accounts, emptyLabel = "Cash", available }) => (
  <Field label={label}>
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
      <option value="">{withAmount(emptyLabel, available && (available.cash || { total: 0 }))}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{withAmount(a.name, available && (available[a.id] || { total: 0 }))}</option>)}
    </select>
  </Field>
);

// ── "Save this entry?" -- the summary Finance Nepal shows before anything is saved ──
// const { confirm, dialog } = useConfirmSave();  ...  if (!(await confirm({ title, rows, total }))) return;
export function useConfirmSave() {
  const [ask, setAsk] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setAsk({ ...opts, resolve }));
  const done = (ok) => { ask?.resolve(ok); setAsk(null); };
  const dialog = ask && (
    <Modal title={ask.title} onClose={() => done(false)}>
      <div className="space-y-2">
        {ask.rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-4 text-sm"><span className="text-slate-500">{r.label}</span><span className="font-semibold text-slate-900 text-right">{r.value}</span></div>
        ))}
        {ask.total && (
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 mt-3 text-base font-bold">
            <span>{ask.total.label}</span><span style={{ color: ask.total.color }}>{ask.total.value}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={() => done(false)} className={btnGhost}>Cancel</button>
          <button onClick={() => done(true)} className={btnPrimary} autoFocus>Save</button>
        </div>
      </div>
    </Modal>
  );
  return { confirm, dialog };
}

// ── "Add new customer / vendor" -- asked when a form is saved with a name nobody has yet ──
// Name (editable), phone (optional) and ledger type, defaulting to the side of the entry (Received ->
// Customer, Paid -> Vendor). Resolves to { name, phone, party_type_id } or null when cancelled.
export function useAskNewParty(partyTypes) {
  const [ask, setAsk] = useState(null);
  const askNewParty = ({ name, kind }) => new Promise((resolve) => {
    const want = kind === "vendor" ? "vendor" : "customer";
    const typeId = (partyTypes || []).find((t) => t.name.toLowerCase() === want)?.id || "";
    setAsk({ kind: want, name, phone: "", typeId, resolve });
  });
  const done = (value) => { ask?.resolve(value); setAsk(null); };
  const dialog = ask && (
    <Modal title={`Add new ${ask.kind}`} onClose={() => done(null)}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Nobody is saved by this name yet. Save them now so this entry lands on their ledger.</p>
        <Field label="Name"><input value={ask.name} onChange={(e) => setAsk({ ...ask, name: e.target.value })} className={inputCls} autoFocus /></Field>
        <Field label="Phone (optional)" hint="10-digit phone"><input value={ask.phone} onChange={(e) => setAsk({ ...ask, phone: e.target.value })} inputMode="numeric" className={inputCls} /></Field>
        {partyTypes?.length > 0 && (
          <Field label="Ledger type">
            <select value={ask.typeId} onChange={(e) => setAsk({ ...ask, typeId: e.target.value })} className={inputCls}>
              <option value="">No ledger type</option>
              {partyTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => done(null)} className={btnGhost}>Cancel</button>
          <button disabled={!ask.name.trim()} onClick={() => done({ name: ask.name.trim(), phone: ask.phone.replace(/\D/g, ""), party_type_id: ask.typeId || null })} className={btnPrimary}>Add and continue</button>
        </div>
      </div>
    </Modal>
  );
  return { askNewParty, dialog };
}

// Type to search saved parties. Typing a name that isn't saved offers "Add as new" -- on forms that
// need a real party id it creates it on the spot via onCreate; otherwise the typed name is returned
// with id null and the caller creates the party when the entry is saved.
export function PartyPicker({ label = "Party", parties, id, name, onChange, onCreate, placeholder = "Search or type a name" }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(name || "");
  const box = useRef(null);
  useEffect(() => { setText(name || ""); }, [name, id]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const q = text.trim().toLowerCase();
  const matches = useMemo(() => parties.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.phone || "").includes(q)).slice(0, 8), [parties, q]);
  const exact = parties.some((p) => p.name.toLowerCase() === q);
  const pick = (p) => { onChange({ id: p.id, name: p.name, party: p }); setText(p.name); setOpen(false); };
  const addNew = async () => {
    const typed = text.trim();
    if (!typed) return;
    if (onCreate) {
      const created = await onCreate(typed);
      if (created) pick(created);
    } else { onChange({ id: null, name: typed }); setOpen(false); }
  };
  return (
    <div ref={box} className="relative">
      <Field label={label}>
        <input value={text} placeholder={placeholder} className={inputCls}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setOpen(true); onChange({ id: null, name: e.target.value }); }} />
      </Field>
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between gap-2">
              <span className="truncate">{p.name}</span><span className="text-xs text-slate-400">{p.phone || ""}</span>
            </button>
          ))}
          {q && !exact && (
            <button type="button" onClick={addNew} className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-t border-slate-100">
              <Plus size={14} /> Add “{text.trim()}” as new
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Delete asks twice IN the sheet: the button turns red and reverts after 5 seconds.
export function TwoTapDelete({ onConfirm, label = "Delete" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`h-9 px-3.5 rounded-lg text-[13px] font-semibold transition-colors ${armed ? "bg-red-600 text-white hover:bg-red-700" : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}>
      {armed ? "Tap again to delete for good" : label}
    </button>
  );
}

export const Stat = ({ label, value, color, onClick, sub }) => (
  <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    className={`bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 ${onClick ? "cursor-pointer hover:border-blue-300 transition" : ""}`}>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    <div className="text-base font-extrabold mt-0.5 leading-tight" style={{ color: color || "#111827" }}>{typeof value === "number" ? npr(value) : value}</div>
    {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

export const Empty = ({ children }) => <p className="py-10 text-center text-[13px] text-gray-500">{children}</p>;

export const SavedCheck = () => <Check size={16} className="text-emerald-600" />;

// Both exports come from the same column definition so they cannot drift.
export function exportXlsx(filename, columns, rows) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, c.value(r)])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export const ExportBar = ({ onXlsx }) => (
  <div className="fin-no-print flex gap-2">
    <button onClick={() => window.print()} className={btnGhost}><Printer size={15} className="text-gray-500" /> Print</button>
    {onXlsx && <button onClick={onXlsx} className={btnGhost}><FileSpreadsheet size={15} className="text-emerald-600" /> Excel</button>}
  </div>
);

// Jageer's date filter button: shows "All time" (or the range picked) and opens a small From / To picker with
// shortcuts. Empty from / to means no limit on that side.
export function DateRangeButton({ from, to, onApply, shortcuts = [] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from || "");
  const [t, setT] = useState(to || "");
  const box = useRef(null);
  useEffect(() => { setF(from || ""); setT(to || ""); }, [from, to]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = shortcuts.find((s) => s.on);
  const label = active ? active.label : from && to ? (from === to ? formatBSDate(from) : `${formatBSDate(from)} – ${formatBSDate(to)}`) : from ? `From ${formatBSDate(from)}` : to ? `Until ${formatBSDate(to)}` : "All time";
  return (
    <div className="fin-no-print relative" ref={box}>
      <button type="button" onClick={() => setOpen(!open)} className={`${btnGhost} min-w-[8.5rem]`}><CalendarDays size={15} className="text-gray-500" /> {label}</button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg space-y-3">
          {shortcuts.map((s) => (
            <button key={s.label} type="button" onClick={() => { s.onSelect(); setOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${s.on ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"}`}>{s.label}</button>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-gray-600">From<input type="date" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} className={`${inputCls} mt-1 !px-2`} /></label>
            <label className="text-xs font-semibold text-gray-600">To<input type="date" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} className={`${inputCls} mt-1 !px-2`} /></label>
          </div>
          {(f || t) && <div className="text-[11px] text-gray-400">{f ? formatBSDate(f) : "Start"} to {t ? formatBSDate(t) : "today"} BS</div>}
          <button type="button" onClick={() => { onApply(f, t); setOpen(false); }} className={`${btnPrimary} w-full`}>Apply</button>
        </div>
      )}
    </div>
  );
}
