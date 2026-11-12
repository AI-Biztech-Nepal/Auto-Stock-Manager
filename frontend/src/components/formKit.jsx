// The look shared by the big forms (Purchase Vehicle, Sale Vehicle): labels, boxes, sections and the Rs. amount field.
import { formatNPR } from "../utils/helpers";

export const LBL = "block text-xs font-semibold text-slate-600 mb-1.5";
// A box that is switched off (the form is read-only) keeps its text dark, drops the grey-out and, for a dropdown, the arrow.
export const RO = "disabled:bg-slate-50 disabled:text-slate-900 disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100 disabled:cursor-default disabled:appearance-none";
export const BOX = `w-full h-11 px-3 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${RO}`;
export const OK = "border-slate-300";
export const BAD = "border-red-500 ring-1 ring-red-500";
export const SECTION = "px-4 sm:px-7 py-6 border-b border-slate-200 last:border-b-0 scroll-mt-2";
export const H2 = "mb-4 text-base font-bold text-slate-900";
// The date picker's trigger, sized like BOX (the picker draws its own focus ring).
export const DATE_BOX = "w-full h-11 px-3 text-base sm:text-sm border rounded-[10px] bg-white disabled:bg-slate-50 disabled:cursor-default disabled:hover:border-slate-300";
export const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

export const digits = (x) => Number(String(x ?? "").replace(/[^\d.]/g, "")) || 0;

// An amount field: "Rs." in front, digits only (what the form saves), the formatted figure under it.
export function Money({ id, value, onChange, testid, error, placeholder = "0" }) {
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
