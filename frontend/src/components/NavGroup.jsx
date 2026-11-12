import { NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";

// A main side-panel item with pages under it (Inventory: Product / Spare Parts, Service: Job Cards / Warranty): a
// dropdown, open by default while on one of its pages, like Marketing. `tabs` is [{ key, label, icon, to }] in panel
// order and `activeKey` the one being viewed (null when on some other page). The open/closed state lives in Layout
// (see FinanceNavGroup for why). Test ids: nav-<id>-group, nav-<id>, nav-<id>-<key>.
export default function NavGroup({ id, label, Icon, tabs, activeKey, open, setOpen, navigate, onPick }) {
  const onGroup = activeKey != null;
  const isOpen = open ?? onGroup;

  return (
    <div data-testid={`nav-${id}-group`}>
      <button
        onClick={() => { setOpen(!isOpen); if (!onGroup) navigate(tabs[0].to); }}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${onGroup ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
        data-testid={`nav-${id}`}
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
              replace={onGroup}
              onClick={onPick}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${activeKey === t.key ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              data-testid={`nav-${id}-${t.key}`}
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
