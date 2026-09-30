import { Search } from "lucide-react";
import { formatNPR } from "../utils/helpers";

// Shared pieces for the Ledger tabs (Customers / Vendors / Staff) so every register reads the
// same way: one sticky search bar, entries filed A–Z under letter headings, and money shown as
// a quiet tag on the entry rather than the headline.

export function LedgerToolbar({ search, onSearch, placeholder, testid, action, count }) {
  return (
    <div className="sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center gap-2">
      <div className="relative flex-1 min-w-0">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full h-10 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          data-testid={testid}
        />
      </div>
      {count != null && <span className="hidden sm:block text-xs text-slate-400 tabular-nums whitespace-nowrap px-1">{count}</span>}
      {action}
    </div>
  );
}

// Files entries under their first letter, A–Z; anything not starting with a letter goes under "#".
export function groupByLetter(items, getName) {
  const groups = {};
  for (const item of items) {
    const first = (getName(item) || "").trim().charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    (groups[key] ??= []).push(item);
  }
  return Object.keys(groups)
    .sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b))
    .map(letter => ({ letter, items: groups[letter].sort((a, b) => getName(a).localeCompare(getName(b))) }));
}

// One letter's section of the register.
export function LetterSection({ letter, children }) {
  return (
    <section aria-label={letter}>
      <h3 className="px-4 pt-3 pb-1 text-xs font-bold text-slate-400 tracking-wider bg-slate-50/80 border-b border-slate-100">{letter}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

// A small, secondary money tag for an entry — only shown when something is outstanding.
export function DueTag({ amount, overdue = false, label = "Due" }) {
  if (!(amount > 0)) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${overdue ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`} data-testid="due-tag">
      {label} {formatNPR(amount)}{overdue ? " · overdue" : ""}
    </span>
  );
}

// Neutral info pill for a register row (counts, status). tone: slate | green | blue.
const PILL_TONES = { slate: "bg-slate-100 text-slate-600", green: "bg-green-50 text-green-700", blue: "bg-blue-50 text-blue-700" };
export function InfoPill({ children, tone = "slate" }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${PILL_TONES[tone]}`}>{children}</span>;
}

export function LedgerSkeleton({ rows = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-40 max-w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-56 max-w-full rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LedgerEmpty({ icon: Icon, title, body, action }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center">
      {Icon && <Icon size={28} className="mx-auto mb-3 text-slate-300" />}
      <p className="font-semibold text-slate-800">{title}</p>
      {body && <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
