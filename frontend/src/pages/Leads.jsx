import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MessageCircle, Inbox, Wrench, Repeat, Bike, X, Mail, MapPin, Check, Ban, Users, ExternalLink, UserPlus } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";

// Sell / Exchange / Book Service forms from the public website land here (POST /public/leads), and so do WhatsApp / Call
// taps (the website asks who they are first). Every lead is decided once: Accept (the person goes into the CRM) or
// Reject (a remark saying why is required).
// Tabs: "All" is the inbox of pending leads. Accepting one moves it out of All into the tab for its type; rejecting
// one moves it to the Rejected tab. A registered account also shows in Accounts while it is still pending. A lead is never
// deleted: Reject is the only way to put one aside.
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

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

// A lead is pending until it is accepted or rejected (older ones with another status count as pending too).
const state = l => (l.status === "accepted" || l.status === "rejected" ? l.status : "new");

// The one tab a lead lives in, so none can go missing. An accepted lead of a type with no tab of its own stays in All.
const tabOf = l => (state(l) === "new" ? "all" : state(l) === "rejected" ? "rejected" : TYPES[l.type] ? l.type : "all");
const tabLabel = key => TABS.find(t => t.key === key)?.label;
// Where a lead is listed: its home tab, plus Accounts for a registered account that is still pending (it shows there at once).
const inTab = (l, key) => tabOf(l) === key || (key === "signup" && l.type === "signup" && state(l) === "new");

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [rejecting, setRejecting] = useState(null); // { id, remark }: the lead whose reject box is open
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [zoom, setZoom] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
      // Pending leads are all on screen in the All tab, so they count as seen: this clears the nav badge and the bell.
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
      toast.success(!data.customer_id ? "Accepted. It has no phone number, so it was not added to the CRM"
        : data.customer_created ? `Accepted. ${lead.name} was added to the CRM` : `Accepted. ${lead.name} is already a customer, linked in the CRM`,
      { description: `Moved to the ${tabLabel(tabOf(data.lead))} tab` });
    } catch (ex) { toast.error(errText(ex, "Couldn't accept that lead")); load(); }
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
  const pendingCount = leads.filter(l => tabOf(l) === "all" && state(l) === "new").length;
  const [emptyTitle, emptyText] = leads.length === 0
    ? ["No leads yet", "Sell, exchange and service requests, and people who tap WhatsApp or Call on your website, will appear here as they come in."]
    : tab === "all" ? ["Nothing waiting for a decision", "New leads from your website appear here. Accept one to move it to its own tab, or reject it to move it to Rejected."]
    : tab === "rejected" ? ["No rejected leads", "Leads you reject are kept here, with your reason."]
    : tab === "signup" ? ["No registered accounts yet", "People who sign in with Google on your website and add their phone number appear here."]
    : [`No accepted leads in ${tabLabel(tab)}`, "Accept a lead in the All tab and it moves here."];

  return (
    <div className="space-y-4" data-testid="leads-page">
      {/* One swipeable row on phones (bleeds to the screen edge so the cut-off chip hints at more); wraps from sm up. */}
      <div role="group" aria-label="Filter leads by tab" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            data-testid={`leads-tab-${key}`}
            className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            {Icon && <Icon size={15} />}{label}{key === "all" && pendingCount > 0 && <span className={`ml-0.5 min-w-[20px] text-center text-xs px-1.5 py-0.5 rounded-full ${tab === key ? "bg-white/25" : "bg-blue-600 text-white"}`}>{pendingCount}</span>}
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
            return (
              <div key={l.id} data-testid="lead-card" data-state={state(l)} className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${state(l) === "new" ? "border-blue-300" : "border-slate-200/80"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${t.cls}`}><t.Icon size={12} /> {t.label}</span>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900" style={FONT}>{l.name}</h3>
                    <p className="text-xs text-slate-400">{when(l.created_at)}</p>
                    {(l.email || l.address) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {l.email && <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:text-blue-700"><Mail size={12} className="text-slate-400" />{l.email}</a>}
                        {l.address && <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{l.address}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {l.phone && <a href={`tel:${l.phone}`} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><Phone size={14} /> {l.phone}</a>}
                    {l.phone && <a href={`https://wa.me/${waNumber(l.phone)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="h-9 w-9 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center"><MessageCircle size={16} /></a>}
                  </div>
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
                      <button onClick={() => accept(l)} disabled={busyId === l.id} className="h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60" data-testid="lead-accept"><Check size={16} /> {busyId === l.id ? "Accepting..." : "Accept"}</button>
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
