import { useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import api from "../utils/api";
import { SOURCES } from "../utils/crm";

// "How did they find us?" -- one tap for the source, and for a referral, who referred them.
// Used wherever a customer is added (Sales, Bookings, Ledger) and in the CRM's tagging list.
// value / onChange work on { source, source_note, referred_by_id } (see utils/crm.js).
// `customers` is optional: when the caller doesn't have the list handy, the field loads it itself
// the first time "Referral" is picked.
const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
// size="lg": the boxes of the big forms (Purchase / Sale Vehicle)
const inpLg = "w-full h-11 px-3 text-base sm:text-sm border border-slate-300 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white";
const labelCls = (big) => (big ? "block text-xs font-semibold text-slate-600 mb-1.5" : "block text-xs font-medium text-slate-600 mb-1");

// One box for the referrer: type a name and the customers we know that match drop down to pick from. Pick one and they
// are linked (shown as a chip); leave it typed and it is kept as the plain name of someone who isn't a customer.
// onChange gets just the fields that changed.
function ReferrerInput({ customers, value, onChange, excludeId, big = false }) {
  const box = big ? inpLg : inp;
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1); // keyboard-highlighted match; -1 keeps Enter from swapping a typed name for a near match
  const picked = customers.find(c => c.id === value.referred_by_id);
  const text = value.source_note || "";
  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return customers
      .filter(c => c.id !== excludeId && (!needle || (c.name || "").toLowerCase().includes(needle) || (c.contact_number || "").includes(needle)))
      .slice(0, 6);
  }, [customers, text, excludeId]);

  if (picked) {
    return (
      <div className={`flex items-center justify-between gap-2 px-3 bg-amber-50 border border-amber-200 text-sm text-amber-900 ${big ? "h-11 rounded-[10px]" : "h-9 rounded-lg"}`} data-testid="referrer-picked">
        <span className="truncate font-medium">{picked.name}<span className="font-normal text-amber-700"> · {picked.contact_number}</span></span>
        <button type="button" onClick={() => onChange({ referred_by_id: "" })} aria-label="Remove referrer" className="shrink-0 text-amber-700 hover:text-amber-900"><X size={14} /></button>
      </div>
    );
  }

  const pick = (c) => { onChange({ referred_by_id: c.id, source_note: "" }); setOpen(false); setHi(-1); };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && matches[hi]) pick(matches[hi]); } // never submits the form behind it
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={text}
        onChange={e => { onChange({ source_note: e.target.value, referred_by_id: "" }); setHi(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Type a name, or pick a customer we know"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        className={`${box} pl-8`}
        data-testid="referrer-input"
      />
      {open && (matches.length > 0 || text.trim()) && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(c)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${i === hi ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                <span className="truncate text-slate-800">{c.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{c.contact_number}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">Not a customer we know &mdash; &ldquo;{text.trim()}&rdquo; will be saved as typed</li>}
        </ul>
      )}
    </div>
  );
}

// "Referred by" as a section of its own, independent of the lead: value is { referred_by_id, source_note } where
// source_note is the typed name of a referrer who isn't a customer.
export function ReferredByField({ value, onChange, customers = [], excludeId, size }) {
  const big = size === "lg";
  return (
    <div data-testid="referred-by-field">
      <label className={labelCls(big)}>Referred by</label>
      <ReferrerInput customers={customers} value={value} onChange={patch => onChange({ ...value, ...patch })} excludeId={excludeId} big={big} />
    </div>
  );
}

// `hideReferral` drops the Referral button, for a form that asks "Referred by" separately.
export default function SourceField({ value, onChange, customers, excludeId, required = false, label = "How did they find us?", hideReferral = false, size }) {
  const big = size === "lg";
  const [loaded, setLoaded] = useState(null);
  const list = customers || loaded || [];
  const needList = value.source === "referral" && !customers && !loaded;

  useEffect(() => {
    if (!needList) return;
    let alive = true;
    api.get("/customers").then(r => { if (alive) setLoaded(r.data); }).catch(() => { if (alive) setLoaded([]); });
    return () => { alive = false; };
  }, [needList]);

  const set = (patch) => onChange({ ...value, ...patch });
  const pick = (key) => set({ source: key, ...(key !== "referral" ? { referred_by_id: "" } : {}), ...(key !== "referral" && key !== "other" ? { source_note: "" } : {}) });

  return (
    <div data-testid="source-field">
      <label className={labelCls(big)}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {SOURCES.filter(s => !(hideReferral && s.key === "referral")).map(({ key, label: l, Icon }) => {
          const on = value.source === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(on && !required ? "" : key)}
              aria-pressed={on}
              data-testid={`source-${key}`}
              className={`inline-flex items-center gap-1.5 font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${big ? "h-11 px-3 rounded-[10px] text-[13px]" : "h-9 px-2.5 rounded-lg text-xs"} ${on ? "bg-blue-600 text-white border-blue-600" : `bg-white text-slate-600 hover:bg-slate-50 ${big ? "border-slate-300" : "border-slate-200"}`}`}
            >
              <Icon size={14} />{l}
            </button>
          );
        })}
      </div>
      {value.source === "referral" && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-medium text-slate-600">Referred by</p>
          <ReferrerInput customers={list} value={value} onChange={set} excludeId={excludeId} big={big} />
        </div>
      )}
      {value.source === "other" && (
        <input value={value.source_note} onChange={e => set({ source_note: e.target.value })} placeholder="Where? e.g. Instagram, signboard, Hamro Bazar" className={`${big ? inpLg : inp} mt-2`} data-testid="source-note" />
      )}
    </div>
  );
}
