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

function ReferrerPicker({ customers, value, onChange, excludeId }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const picked = customers.find(c => c.id === value);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers
      .filter(c => c.id !== excludeId && (!needle || (c.name || "").toLowerCase().includes(needle) || (c.contact_number || "").includes(needle)))
      .slice(0, 6);
  }, [customers, q, excludeId]);

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 h-9 px-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
        <span className="truncate font-medium">{picked.name}<span className="font-normal text-amber-700"> · {picked.contact_number}</span></span>
        <button type="button" onClick={() => onChange("")} aria-label="Remove referrer" className="shrink-0 text-amber-700 hover:text-amber-900"><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search the customer who referred them"
        className={`${inp} pl-8`}
        data-testid="referrer-search"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {matches.map(c => (
            <li key={c.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(c.id); setQ(""); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2">
                <span className="truncate text-slate-800">{c.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{c.contact_number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SourceField({ value, onChange, customers, excludeId, required = false, label = "How did they find us?" }) {
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
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {SOURCES.map(({ key, label: l, Icon }) => {
          const on = value.source === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(on && !required ? "" : key)}
              aria-pressed={on}
              data-testid={`source-${key}`}
              className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              <Icon size={14} />{l}
            </button>
          );
        })}
      </div>
      {value.source === "referral" && (
        <div className="mt-2 space-y-1.5">
          <ReferrerPicker customers={list} value={value.referred_by_id} onChange={id => set({ referred_by_id: id })} excludeId={excludeId} />
          {!value.referred_by_id && (
            <input value={value.source_note} onChange={e => set({ source_note: e.target.value })} placeholder="Or type who referred them (if not a customer)" className={inp} data-testid="referrer-note" />
          )}
        </div>
      )}
      {value.source === "other" && (
        <input value={value.source_note} onChange={e => set({ source_note: e.target.value })} placeholder="Where? e.g. TikTok, signboard, Hamro Bazar" className={`${inp} mt-2`} data-testid="source-note" />
      )}
    </div>
  );
}
