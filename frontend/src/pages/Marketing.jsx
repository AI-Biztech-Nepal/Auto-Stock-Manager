import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { Megaphone, Share2, Gift, Eye, Inbox, HeartHandshake } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { marketingTabsFor } from "../utils/permissions";

// Everything that brings customers in, in one place: website leads (Leads), posting vehicles (Share), the festival gift
// spin (Offers) and who is visiting the website (Visits). Each tab is the page that used to be its
// own nav entry -- lazy so opening Marketing only loads the tab shown.
const Share = lazy(() => import("./Share"));
const Offers = lazy(() => import("./Offers"));
const Visits = lazy(() => import("./Visits"));
const Leads = lazy(() => import("./Leads"));
const CRM = lazy(() => import("./CRM"));

const TABS = {
  crm: { label: "CRM", title: "CRM", hint: "Your customers, how they found the shop, and who referred them", Icon: HeartHandshake, Page: CRM },
  share: { label: "Share", hint: "Post your vehicles to social media", Icon: Share2, Page: Share },
  offers: { label: "Offers", hint: "Run the festival gift spin", Icon: Gift, Page: Offers },
  leads: { label: "Leads", hint: "Sell, exchange and service requests from your website", Icon: Inbox, Page: Leads },
  visits: { label: "Visits", hint: "See who visits your website", Icon: Eye, Page: Visits },
};

export default function Marketing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const allowed = marketingTabsFor(user?.role);
  const requested = searchParams.get("tab");
  const tab = allowed.includes(requested) ? requested : allowed[0];
  if (!tab) return null;
  const { Page, hint, title, Icon } = TABS[tab];
  const HeaderIcon = title ? Icon : Megaphone; // the CRM tab carries its own name; the others sit under Marketing

  return (
    <div className="space-y-5 animate-fade-in" data-testid="marketing-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <HeaderIcon size={22} className="text-slate-400" /> {title || "Marketing"}
        </h1>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>

      <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
        <Page key={tab} embedded />
      </Suspense>
    </div>
  );
}
