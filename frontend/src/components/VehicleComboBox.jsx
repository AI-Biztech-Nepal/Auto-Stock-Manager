/**
 * VehicleComboBox — a single input that acts as both a dropdown and a search bar.
 * Click it to see every vehicle; type to filter by brand, model, or registration number.
 * Selecting an option shows its label in the box, like Facebook's country-code picker.
 */
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { formatNPR } from "../utils/helpers";

const defaultLabel = (v) =>
  `${v.brand} ${v.model} ${v.year}${v.registration_number ? ` (${v.registration_number})` : ""}`;

export default function VehicleComboBox({ vehicles, value, onChange, placeholder = "Search or select a vehicle...", formatLabel = defaultLabel, testId = "vehicle", tagStatus = false, showPrice = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  const selected = vehicles.find(v => v.id === value);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = vehicles.filter(v => {
    if (!query) return true;
    const q = query.toLowerCase();
    return v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) || (v.registration_number || "").toLowerCase().includes(q);
  });

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={open ? query : (selected ? formatLabel(selected) : "")}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-8 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          data-testid={`${testId}-combobox`}
          autoComplete="off"
        />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto" data-testid={`${testId}-dropdown`}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matching vehicles</div>
          ) : filtered.map(v => (
            <button
              type="button"
              key={v.id}
              onClick={() => { onChange(v.id); setQuery(""); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-50 last:border-0 ${v.id === value ? "bg-blue-50 font-medium" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-800">{v.brand} {v.model} {v.year}</span>
                {tagStatus && v.status === "in_repair" && <span className="shrink-0 text-purple-600 font-medium">In Repair</span>}
                {tagStatus && v.status === "sold" && <span className="shrink-0 text-teal-600 font-medium">Sold · Under Warranty</span>}
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-400">
                {v.registration_number && <span className="font-mono">{v.registration_number}</span>}
                {showPrice && <span>{formatNPR(v.selling_price || v.purchase_price)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
