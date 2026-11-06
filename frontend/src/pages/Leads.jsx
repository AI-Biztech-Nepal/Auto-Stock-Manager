import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MessageCircle, Inbox, Wrench, Repeat, Bike, X, Mail, MapPin, Check, CheckCheck, Ban, Users, ExternalLink, UserPlus, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

// Sell / Exchange / Book Service forms from the public website land here (POST /public/leads), and so do WhatsApp / Call
// taps (the website asks who they are first). Every lead is decided once: Add to CRM (the lead is accepted and the person
// goes into the CRM) or Reject (a remark saying why is required).
// Tabs: "All" lists every lead, newest first, whatever its type or outcome. Each lead also lives in the tab for its type
// (still waiting for a decision there); rejecting one also puts it in the Rejected tab. A registered account also shows in
// Accounts while it is still pending. A lead is never deleted: Reject is the only way to put one aside.
const TYPES = {
  sell: { label: "Sell bike", Icon: Bike, cls: "bg-emerald-50 text-emerald-700" },
  exchange: { label: "Exchange", Icon: Repeat, cls: "bg-indigo-50 text-indigo-700" },
  service: { label: "Service", Icon: Wrench, cls: "bg-amber-50 text-amber-700" },
  whatsapp: { label: "WhatsApp tap", Icon: MessageCircle, cls: "bg-green-50 text-green-700" },
  call: { label: "Call tap", Icon: Phone, cls: "bg-sky-50 text-sky-700" },
  signup: { label: "Account", tab: "Accounts", Icon: UserPlus, cls: "bg-violet-50 text-violet-700" },
};
const TABS = [
  { key: "all", label: "All" },
  ...Object.entries(TYPES).map(([key, v]) => ({ key, label: v.tab || v.label, Icon: v.Icon })),
  { key: "rejected", label: "Rejected" },
];
const MIN_REMARK = 3;
const FONT = { fontFamily: "Manrope" };

// Nepali mobile numbers are typed as 98XXXXXXXX; wa.me needs the country code.
const waNumber = phone => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};

// The WhatsApp logo (lucide has no brand icons).
const WhatsAppIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L0 24l6.35-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.17-1.23-6.15-3.42-8.43zM12.06 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.77.99 1.01-3.67-.24-.38a9.88 9.88 0 0 1-1.51-5.27c0-5.46 4.45-9.9 9.92-9.9 2.65 0 5.13 1.03 7 2.9a9.84 9.84 0 0 1 2.9 7c0 5.46-4.45 9.91-9.9 9.91zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
  </svg>
);

// The reply that opens in WhatsApp, ready to send: greets them by name and refers to what they asked for.
const replyText = l => {
  const first = String(l.name || "").trim().split(/\s+/)[0];
  const hi = first && first !== "Website" ? `Hello ${first}, ` : "Hello, ";
  const about = l.vehicle?.label ? ` about the ${l.vehicle.label}`
    : { sell: " about selling your bike", exchange: " about your exchange request", service: l.requested_service ? ` about your ${l.requested_service} booking` : " about your service booking" }[l.type] || "";
  return `${hi}this is Hamro G&G Auto, Nayabasti, Boudha. Thank you for contacting us${about}. How can we help you?`;
};

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

// "Today", "Yesterday", "2 days ago" ... counted in calendar days, so a lead from last night is "Yesterday", not "Today".
const dayLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 30) return `${days} days ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};
const DAY_CLS = { Today: "bg-blue-600 text-white", Yesterday: "bg-amber-100 text-amber-800" };
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "");

// A lead is pending until it is accepted or rejected (older ones with another status count as pending too).
const state = l => (l.status === "accepted" || l.status === "rejected" ? l.status : "new");

// The one tab a lead lives in, apart from All (which lists every lead). A lead of a type with no tab of its own is only in All.
const tabOf = l => (state(l) === "rejected" ? "rejected" : !TYPES[l.type] ? "all" : l.type);
const tabLabel = key => TABS.find(t => t.key === key)?.label;
// Where a lead is listed: its home tab, plus Accounts for a registered account that is still pending (it shows there at once).
const inTab = (l, key) => key === "all" || tabOf(l) === key || (key === "signup" && l.type === "signup" && state(l) === "new");

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [rejecting, setRejecting] = useState(null); // { id, remark }: the lead whose reject box is open
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [zoom, setZoom] = useState(null);
  // Leads nobody had opened before this visit: they stay "New" (blue) while the page is open. Opening the page marks them
  // seen on the server, so on the next visit they show as "Read" (green).
  const [newIds, setNewIds] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
      setNewIds(prev => (prev.size ? prev : new Set(data.filter(l => !l.seen_at).map(l => l.id))));
      // Unseen leads are all on screen in the All tab, so they count as seen: this clears the nav badge and the bell, and
      // takes them out of All on the next visit (the list above keeps them there for this one).
      // Done before the ping below so the badge's refetch already sees them as seen.
      const unseen = data.filter(l => state(l) === "new" && !l.seen_at).map(l => l.id);
      if (unseen.length) await api.post("/leads/seen", { ids: unseen }, { suppressErrorToast: true }).catch(() => {});
      window.dispatchEvent(new Event("leads-changed"));
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceLead = (l) => { setLeads(ls => ls.map(x => (x.id === l.id ? l : x))); window.dispatchEvent(new Event("leads-changed")); };
  const errText = (ex, fallback) => (typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : fallback);

  const accept = async (lead) => {
    setBusyId(lead.id);
    try {
      const { data } = await api.post(`/leads/${lead.id}/accept`, null, { suppressErrorToast: true });
      replaceLead(data.lead);
      toast.success(!data.customer_id ? "Accepted, but it has no phone number, so it was not added to the CRM"
        : data.customer_created ? `${lead.name} was added to the CRM` : `${lead.name} is already a customer, linked in the CRM`,
      tabOf(data.lead) === tab ? undefined : { description: `Moved to the ${tabLabel(tabOf(data.lead))} tab` });
    } catch (ex) { toast.error(errText(ex, "Couldn't add that lead to the CRM")); load(); }
    finally { setBusyId(null); }
  };

  const reject = async (lead) => {
    const remark = (rejecting?.remark || "").trim();
    if (remark.length < MIN_REMARK) { toast.error("Please write why you are rejecting this lead"); return; }
    setBusyId(lead.id);
    try {
      const { data } = await api.post(`/leads/${lead.id}/reject`, { remark }, { suppressErrorToast: true });
      replaceLead(data);
      setRejecting(null);
      toast.success("Lead rejected", { description: "Moved to the Rejected tab" });
    } catch (ex) { toast.error(errText(ex, "Couldn't reject that lead")); load(); }
    finally { setBusyId(null); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  const shown = leads.filter(l => inTab(l, tab));
  const countOf = key => leads.filter(l => inTab(l, key)).length; // the number of cards that tab shows
  const [emptyTitle, emptyText] = leads.length === 0
    ? ["No leads yet", "Sell, exchange and service requests, and people who tap WhatsApp or Call on your website, will appear here as they come in."]
    : tab === "all" ? ["No leads yet", "Every lead from your website appears here, and also in the tab for its type."]
    : tab === "rejected" ? ["No rejected leads", "Leads you reject are kept here, with your reason."]
    : tab === "signup" ? ["No registered accounts yet", "People who sign in with Google on your website and add their phone number appear here."]
    : [`Nothing in ${tabLabel(tab)} yet`, "Leads of this type appear here as they come in."];

  return (
    <div className="space-y-4" data-testid="leads-page">
      {/* The chips wrap onto as many rows as they need, so every tab is on screen and one tap away (no hidden sideways scrolling on phones). */}
      <div role="group" aria-label="Filter leads by tab" className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            data-testid={`leads-tab-${key}`}
            className={`touch-manipulation h-10 px-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            {Icon && <Icon size={15} />}{label}
            {/* Every tab shows how many leads it holds; All is blue while any lead there is still undecided. */}
            <span data-testid={`leads-count-${key}`} className={`ml-0.5 min-w-[20px] text-center text-xs px-1.5 py-0.5 rounded-full ${tab === key ? "bg-white/25 text-white" : key === "all" && leads.some(x => state(x) === "new") ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{countOf(key)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Inbox size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{emptyTitle}</h3>
          <p className="mt-1 text-sm text-slate-600 max-w-xs mx-auto">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(l => {
            const t = TYPES[l.type] || { label: l.type, Icon: Inbox, cls: "bg-slate-100 text-slate-600" };
            const images = (l.images || []).filter(Boolean);
            const isNew = newIds.has(l.id);
            const day = dayLabel(l.created_at);
            return (
              <div key={l.id} data-testid="lead-card" data-state={state(l)} className={`border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${state(l) === "rejected" ? "bg-white border-slate-200/80" : isNew ? "bg-white border-blue-300 ring-1 ring-blue-100" : "bg-emerald-50/60 border-emerald-300"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${t.cls}`}><t.Icon size={12} /> {t.label}</span>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900" style={FONT}>{l.name}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500" data-testid="lead-when">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-bold ${DAY_CLS[day] || "bg-slate-100 text-slate-700"}`}>{day}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={12} className="text-slate-400" />{clock(l.created_at)}</span>
                      <span className="text-slate-400">{dateOnly(l.created_at)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="lead-contact">
                      {l.phone ? (
                        <>
                          <a href={`tel:${l.phone}`} data-testid="lead-phone" className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><Phone size={14} /> {l.phone}</a>
                          <a href={`https://wa.me/${waNumber(l.phone)}?text=${encodeURIComponent(replyText(l))}`} target="_blank" rel="noopener noreferrer" title="Reply on WhatsApp" aria-label={`Reply to ${l.name} on WhatsApp`} data-testid="lead-whatsapp" className="h-9 px-3 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 inline-flex items-center gap-1.5"><WhatsAppIcon size={16} /> WhatsApp</a>
                        </>
                      ) : (
                        <span data-testid="lead-no-phone" className="h-9 px-3 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 inline-flex items-center gap-1.5"><Phone size={13} /> No phone number</span>
                      )}
                    </div>
                    {(l.email || l.address) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-blue-700"><Mail size={12} className="text-slate-400" />{l.email}</a>}
                        {l.address && <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{l.address}</span>}
                      </p>
                    )}
                  </div>
                  {state(l) !== "rejected" && (isNew
                    ? <span data-testid="lead-new" className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white"><Sparkles size={12} /> New</span>
                    : <span data-testid="lead-read" className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"><CheckCheck size={13} /> Read</span>)}
                </div>

                {(l.requested_service || l.vehicle_type || l.preferred_date) && (
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    {[["Service", l.requested_service], ["Vehicle", l.vehicle_type], ["Preferred date", l.preferred_date]].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-slate-50 rounded-lg px-3 py-2"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-slate-800">{v}</dd></div>
                    ))}
                  </dl>
                )}
                {l.vehicle && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5" data-testid="lead-vehicle">
                    {l.vehicle.photo
                      ? <img src={l.vehicle.photo} alt="" className="size-14 shrink-0 rounded-lg object-cover bg-slate-200" loading="lazy" />
                      : <span className="size-14 shrink-0 rounded-lg bg-slate-200 text-slate-400 inline-flex items-center justify-center"><Bike size={22} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Was looking at</p>
                      <p className="truncate text-sm font-bold text-slate-900" style={FONT}>{l.vehicle.label}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[l.vehicle.registration_number, l.vehicle.price ? formatNPR(l.vehicle.price) : "", l.vehicle.status && l.vehicle.status !== "available" ? l.vehicle.status : ""].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <a href={l.vehicle.website_url} target="_blank" rel="noopener noreferrer" className="shrink-0 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5" data-testid="lead-vehicle-link"><ExternalLink size={13} /> View on website</a>
                  </div>
                )}
                {l.message && !(l.vehicle && /\/inventory\//.test(l.message)) && <p className="mt-3 text-sm text-slate-700 whitespace-pre-line">{l.message}</p>}
                {images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      <button key={i} onClick={() => setZoom(src)} className="size-16 rounded-lg overflow-hidden border border-slate-200"><img src={src} alt="" className="size-full object-cover" /></button>
                    ))}
                  </div>
                )}

                {state(l) === "new" ? (
                  rejecting?.id === l.id ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2" data-testid="reject-box">
                      <label htmlFor={`reject-${l.id}`} className="block text-xs font-semibold text-red-800">Why are you rejecting this lead? (required)</label>
                      <textarea id={`reject-${l.id}`} value={rejecting.remark} onChange={e => setRejecting({ id: l.id, remark: e.target.value })} rows={2} maxLength={1000} autoFocus
                        placeholder="e.g. Wrong number, not interested, outside our area" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-400" data-testid="reject-remark" />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setRejecting(null)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" data-testid="reject-cancel">Cancel</button>
                        <button onClick={() => reject(l)} disabled={busyId === l.id} className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60" data-testid="reject-confirm">{busyId === l.id ? "Rejecting..." : "Reject lead"}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <button onClick={() => setRejecting({ id: l.id, remark: "" })} disabled={busyId === l.id} className="h-10 px-5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="lead-reject"><Ban size={15} /> Reject</button>
                      <button onClick={() => accept(l)} disabled={busyId === l.id} className="h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="lead-accept"><UserPlus size={16} /> {busyId === l.id ? "Adding..." : "Add to CRM"}</button>
                    </div>
                  )
                ) : l.status === "accepted" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm" data-testid="lead-outcome">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800"><Check size={14} /> Accepted</span>
                    {l.customer_id
                      ? <button onClick={() => navigate("/marketing?tab=crm")} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Users size={13} /> In the CRM</button>
                      : <span className="text-xs text-slate-500">Not added to the CRM (no phone number)</span>}
                    <span className="text-xs text-slate-400 sm:ml-auto">{l.decided_by ? `by ${l.decided_by} · ` : ""}{when(l.decided_at)}</span>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm" data-testid="lead-outcome">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1 font-semibold text-red-800"><Ban size={14} /> Rejected</span>
                      <span className="text-xs text-slate-400 sm:ml-auto">{l.decided_by ? `by ${l.decided_by} · ` : ""}{when(l.decided_at)}</span>
                    </div>
                    {l.remark && <p className="mt-1 text-slate-700 whitespace-pre-line" data-testid="lead-remark">{l.remark}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <button aria-label="Close" className="absolute top-4 right-4 text-white"><X size={24} /></button>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
