import { useState } from "react";
import { splitWarrantyDays, warrantyToDays } from "../utils/helpers";

// Amount + unit (days / months / years) editor for a warranty length. Calls onChange with
// the length in days (what the backend stores), or null while the amount is empty/invalid.
export default function WarrantyLengthInput({ days, onChange, className = "" }) {
  const [state, setState] = useState(() => splitWarrantyDays(days));
  const update = (next) => {
    setState(next);
    const n = Number(next.amount);
    onChange(next.amount !== "" && n > 0 ? warrantyToDays(n, next.unit) : null);
  };
  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="number" min="1" inputMode="numeric"
        value={state.amount}
        onChange={e => update({ ...state, amount: e.target.value })}
        className="w-24 h-10 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="warranty-length-amount"
      />
      <select
        value={state.unit}
        onChange={e => update({ ...state, unit: e.target.value })}
        className="h-10 px-3 text-base sm:text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="warranty-length-unit"
      >
        <option value="days">Days</option>
        <option value="months">Months</option>
        <option value="years">Years</option>
      </select>
    </div>
  );
}
