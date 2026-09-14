import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";

// One global "Cards / List" preference (localStorage), shared across every page that
// offers both layouts — same idea as a file explorer remembering grid vs. list, so
// switching once on Inventory carries over to Job Cards, Vendors, etc.
const VIEW_STORAGE_KEY = "view_mode";

export function useViewMode() {
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "card"; } catch { return "card"; }
  });
  const setView = (v) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* private mode — fine */ }
  };
  return [view, setView];
}

export default function ViewToggle({ view, onChange, testid = "view-toggle" }) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0" data-testid={testid}>
      <button
        type="button"
        title="Card view"
        onClick={() => onChange("card")}
        data-testid={`${testid}-card`}
        className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${
          view === "card" ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <LayoutGrid size={15} />
      </button>
      <button
        type="button"
        title="List view"
        onClick={() => onChange("list")}
        data-testid={`${testid}-list`}
        className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${
          view === "list" ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <List size={15} />
      </button>
    </div>
  );
}
