import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { formatBSDate } from "../../utils/nepali-date";
import { npr } from "./money";

export const inputCls = "w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500";
export const btnPrimary = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors";
export const btnGhost = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-50 transition-colors";

export const Card = ({ children, className = "" }) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>{children}</div>
);

export const Notice = ({ tone = "amber", children }) => {
  const tones = { amber: "bg-amber-50 border-amber-200 text-amber-800", red: "bg-red-50 border-red-200 text-red-700", blue: "bg-blue-50 border-blue-200 text-blue-800" };
  return <div className={`border rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
};

export const Field = ({ label, hint, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
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

export const AccountSelect = ({ label = "Payment method", value, onChange, accounts, emptyLabel = "Cash" }) => (
  <Field label={label}>
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
      <option value="">{emptyLabel}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  </Field>
);

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
      className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${armed ? "bg-red-600 text-white hover:bg-red-700" : "border border-red-200 text-red-600 hover:bg-red-50"}`}>
      {armed ? "Tap again to delete for good" : label}
    </button>
  );
}

export const Stat = ({ label, value, color, onClick, sub }) => (
  <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    className={`bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm ${onClick ? "cursor-pointer hover:border-blue-300 hover:shadow-md transition" : ""}`}>
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-lg sm:text-xl font-bold mt-1 leading-tight" style={{ fontFamily: "Manrope", color: color || "#0f172a" }}>{typeof value === "number" ? npr(value) : value}</div>
    {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
  </div>
);

export const Empty = ({ children }) => <p className="py-10 text-center text-sm text-slate-500">{children}</p>;

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
    <button onClick={() => window.print()} className={btnGhost}>Print / PDF</button>
    {onXlsx && <button onClick={onXlsx} className={btnGhost}>Excel</button>}
  </div>
);
