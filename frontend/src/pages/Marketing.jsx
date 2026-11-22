import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { Share2, Gift, Eye, Inbox, HeartHandshake } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { marketingTabsFor } from "../utils/permissions";

// Everything that brings customers in, in one place: website leads, each accepted or rejected (Leads), posting vehicles (Share), the festival gift
// spin (Offers) and who is visiting the website (Visits). Each tab is the page that used to be its
// own nav entry -- lazy so opening Marketing only loads the tab shown. The tab's name is the title in the app's top bar (Layout).
const Share = lazy(() => import("./Share"));
const Offers = lazy(() => import("./Offers"));
const Visits = lazy(() => import("./Visits"));
const Leads = lazy(() => import("./Leads"));
const CRM = lazy(() => import("./CRM"));

const TABS = {
  crm: { label: "CRM", ownHeader: true, hint: "", Icon: HeartHandshake, Page: CRM }, // the CRM draws its own heading and buttons
  share: { label: "Share", hint: "Post your vehicles to social media", Icon: Share2, Page: Share },
  offers: { label: "Offers", hint: "Run the festival gift spin", Icon: Gift, Page: Offers },
  leads: { label: "Leads", hint: "Enquiries from your website, including WhatsApp and Call taps: add each one to the CRM or reject it", Icon: Inbox, Page: Leads },
  visits: { label: "Visits", hint: "See who visits your website", Icon: Eye, Page: Visits },
};

export default function Marketing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const allowed = marketingTabsFor(user?.role);
  const requested = searchParams.get("tab");
  const tab = allowed.includes(requested) ? requested : allowed[0];
  if (!tab) return null;
  const { Page, ownHeader } = TABS[tab];

  if (ownHeader) {
    return (
      <div className="animate-fade-in" data-testid="marketing-page">
        <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
          <Page key={tab} embedded />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" data-testid="marketing-page">
      <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
        <Page key={tab} embedded />
      </Suspense>
    </div>
  );
}
