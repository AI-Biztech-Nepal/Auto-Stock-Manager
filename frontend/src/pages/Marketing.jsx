import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { Megaphone, Share2, Gift, Eye } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { marketingTabsFor } from "../utils/permissions";

// Everything that brings customers in, in one place: posting vehicles (Share), the festival gift
// spin (Offers) and who is visiting the website (Visits). Each tab is the page that used to be its
// own nav entry -- lazy so opening Marketing only loads the tab shown.
const Share = lazy(() => import("./Share"));
const Offers = lazy(() => import("./Offers"));
const Visits = lazy(() => import("./Visits"));

const TABS = {
  share: { label: "Share", Icon: Share2, Page: Share },
  offers: { label: "Offers", Icon: Gift, Page: Offers },
  visits: { label: "Visits", Icon: Eye, Page: Visits },
};

export default function Marketing() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowed = marketingTabsFor(user?.role);
  const requested = searchParams.get("tab");
  const tab = allowed.includes(requested) ? requested : allowed[0];
  if (!tab) return null;
  const { Page } = TABS[tab];

  const switchTab = (t) => setSearchParams({ tab: t }, { replace: true });

  return (
    <div className="space-y-5 animate-fade-in" data-testid="marketing-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Megaphone size={22} className="text-slate-400" /> Marketing
        </h1>
        <p className="text-sm text-slate-500">Post your vehicles, run offers and see who visits your website</p>
      </div>

      {allowed.length > 1 && (
        <div className="grid gap-2 bg-slate-100 rounded-2xl p-1.5" style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Marketing" data-testid="marketing-tabs">
          {allowed.map(key => {
            const { label, Icon } = TABS[key];
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(key)}
                data-testid={`marketing-tab-${key}`}
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
        <Page key={tab} embedded />
      </Suspense>
    </div>
  );
}
