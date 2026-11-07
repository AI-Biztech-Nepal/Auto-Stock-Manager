import { NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { FINANCE_NAV, REPORT_FAMILY, financeTab, financeNavKey } from "../pages/finance/nav";

// Finance in the main side panel: a dropdown, open by default while on a Finance page, like Marketing.
// Report has its family of reports nested one step further in. The open/closed state lives in Layout
// (Sidebar is rebuilt on every render there, so state kept here would be lost).
export default function FinanceNavGroup({ label, Icon, pathname, search, navigate, open, setOpen, reportOpen, setReportOpen, onPick }) {
  const onFinance = pathname.startsWith("/finance");
  const tab = financeTab(new URLSearchParams(search).get("tab"));
  const current = onFinance ? financeNavKey(tab) : null;
  const isOpen = open ?? onFinance;
  const familyOpen = reportOpen ?? (current === "report" || REPORT_FAMILY.includes(current));

  const row = (active, nested = false) =>
    `flex items-center gap-2.5 ${nested ? "px-3 py-2" : "px-3 py-2.5"} rounded-lg text-sm font-medium transition-all duration-150 ${active ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`;
  const link = (item, nested = false) => (
    <NavLink
      key={item.key}
      to={`/finance?tab=${item.key}`}
      replace={onFinance}
      onClick={onPick}
      className={row(current === item.key, nested)}
      data-testid={`nav-finance-${item.key}`}
    >
      <item.icon size={15} />
      {item.label}
    </NavLink>
  );

  return (
    <div data-testid="nav-finance-group">
      <button
        onClick={() => { setOpen(!isOpen); if (!onFinance) navigate("/finance"); }}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${onFinance ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
        data-testid="nav-finance"
      >
        <Icon size={17} />
        {label}
        <ChevronDown size={15} className={`ml-auto transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="mt-0.5 ml-5 pl-3 border-l border-slate-700 space-y-0.5">
          {FINANCE_NAV.map((item) => {
            if (!item.children) return link(item);
            return (
              <div key={item.key}>
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">{link(item)}</div>
                  <button
                    onClick={() => setReportOpen(!familyOpen)}
                    aria-expanded={familyOpen}
                    aria-label={`${familyOpen ? "Hide" : "Show"} ${item.label} types`}
                    className="w-8 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800"
                    data-testid={`nav-finance-${item.key}-toggle`}
                  >
                    <ChevronDown size={14} className={`transition-transform ${familyOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {familyOpen && <div className="ml-4 pl-2 border-l border-slate-700 space-y-0.5">{item.children.map((c) => link(c, true))}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
