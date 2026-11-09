import { NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";

// Inventory in the main side panel when it has more than one page under it (Product and Spare Parts): a dropdown,
// open by default while on an Inventory page, like Marketing. `tabs` is [{ key, label, icon, to }] in panel order;
// the open/closed state lives in Layout (see FinanceNavGroup for why).
export default function InventoryNavGroup({ label, Icon, pathname, search, tabs, open, setOpen, navigate, onPick }) {
  const onInventory = pathname.startsWith("/inventory");
  const requested = new URLSearchParams(search).get("tab");
  const current = tabs.some((t) => t.key === requested) ? requested : tabs[0].key;
  const isOpen = open ?? onInventory;

  return (
    <div data-testid="nav-inventory-group">
      <button
        onClick={() => { setOpen(!isOpen); if (!onInventory) navigate(tabs[0].to); }}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${onInventory ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
        data-testid="nav-inventory"
      >
        <Icon size={17} />
        {label}
        <ChevronDown size={15} className={`ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="mt-0.5 ml-5 pl-3 border-l border-slate-700 space-y-0.5">
          {tabs.map((t) => (
            <NavLink
              key={t.key}
              to={t.to}
              replace={onInventory}
              onClick={onPick}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${onInventory && current === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              data-testid={`nav-inventory-${t.key}`}
            >
              <t.icon size={15} />
              {t.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
