import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Users, Store, UsersRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ledgerTabsFor } from "../utils/permissions";

// The business's book of people: customers, vendors and staff, each kept as an A–Z register
// you open to read someone's details and history. Each tab is the page that used to be its own
// nav entry (Customers, Vendors, Team) — lazy so opening the Ledger only loads the tab shown.
const Customers = lazy(() => import("./Customers"));
const Vendors = lazy(() => import("./Vendors"));
const Team = lazy(() => import("./Team"));

const TABS = {
  customers: { label: "Customers", Icon: Users, Page: Customers },
  vendors: { label: "Vendors", Icon: Store, Page: Vendors },
  staff: { label: "Staff", Icon: UsersRound, Page: Team },
};

export default function Ledger() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowed = ledgerTabsFor(user?.role);
  const requested = searchParams.get("tab");
  const tab = allowed.includes(requested) ? requested : allowed[0];
  if (!tab) return null;
  const { Page } = TABS[tab];

  const switchTab = (t) => setSearchParams({ tab: t }, { replace: true });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen size={22} className="text-slate-400" /> Ledger
        </h1>
        <p className="text-sm text-slate-500">Everyone you deal with: customers, vendors and staff</p>
      </div>

      {allowed.length > 1 && (
        <div className="grid gap-2 bg-slate-100 rounded-2xl p-1.5" style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Ledger" data-testid="ledger-tabs">
          {allowed.map(key => {
            const { label, Icon } = TABS[key];
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                data-testid={`ledger-tab-${key}`}
                className={`flex items-center justify-center gap-2 h-12 rounded-xl text-sm sm:text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon size={18} /> {label}
              </button>
            );
          })}
        </div>
      )}

      <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
        <Page key={tab} />
      </Suspense>
    </div>
  );
}
