import { useEffect, useState, useCallback } from "react";
import { Phone, MessageCircle, Trash2, Inbox, Wrench, Repeat, Bike, X } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

// Sell / Exchange / Book Service forms from the public website land here (POST /public/leads).
const TYPES = {
  sell: { label: "Sell bike", Icon: Bike, cls: "bg-emerald-50 text-emerald-700" },
  exchange: { label: "Exchange", Icon: Repeat, cls: "bg-indigo-50 text-indigo-700" },
  service: { label: "Service", Icon: Wrench, cls: "bg-amber-50 text-amber-700" },
  whatsapp: { label: "WhatsApp tap", Icon: MessageCircle, cls: "bg-green-50 text-green-700" },
  call: { label: "Call tap", Icon: Phone, cls: "bg-sky-50 text-sky-700" },
};
const STATUSES = [
  { key: "new", label: "New", cls: "bg-blue-600 text-white" },
  { key: "contacted", label: "Contacted", cls: "bg-amber-500 text-white" },
  { key: "closed", label: "Closed", cls: "bg-slate-500 text-white" },
];
const FONT = { fontFamily: "Manrope" };

// Nepali mobile numbers are typed as 98XXXXXXXX; wa.me needs the country code.
const waNumber = phone => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("all");
  const [zoom, setZoom] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
      window.dispatchEvent(new Event("leads-changed"));
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (lead, status) => {
    try {
      const { data } = await api.put(`/leads/${lead.id}`, { status });
      setLeads(ls => ls.map(l => (l.id === lead.id ? data : l)));
      window.dispatchEvent(new Event("leads-changed"));
    } catch {
      toast.error("Failed to update lead");
    }
  };

  const remove = async lead => {
    if (!window.confirm(`Delete the lead from ${lead.name}?`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      setLeads(ls => ls.filter(l => l.id !== lead.id));
      window.dispatchEvent(new Event("leads-changed"));
    } catch {
      toast.error("Failed to delete lead");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }

  const shown = type === "all" ? leads : leads.filter(l => l.type === type);
  const newCount = t => leads.filter(l => (t === "all" || l.type === t) && l.status === "new").length;

  return (
    <div className="space-y-4" data-testid="leads-page">
      {/* One swipeable row on phones (bleeds to the screen edge so the cut-off chip hints at more); wraps from sm up. */}
      <div role="group" aria-label="Filter leads by type" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {[["all", "All", null], ...Object.entries(TYPES).map(([k, v]) => [k, v.label, v.Icon])].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setType(k)}
            aria-pressed={type === k}
            className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${type === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          >
            {Icon && <Icon size={15} />}{label}{newCount(k) > 0 && <span className={`ml-0.5 min-w-[20px] text-center text-xs px-1.5 py-0.5 rounded-full ${type === k ? "bg-white/25" : "bg-blue-600 text-white"}`}>{newCount(k)}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-12 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Inbox size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{type === "all" ? "No leads yet" : `No ${TYPES[type].label.toLowerCase()} leads`}</h3>
          <p className="mt-1 text-sm text-slate-600 max-w-xs mx-auto">
            {type === "all" ? "Sell, exchange and service requests from your website will appear here as they come in." : "Nothing in this group right now."}
          </p>
          {type !== "all" && leads.length > 0 && (
            <button onClick={() => setType("all")} className="mt-4 h-10 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Show all {leads.length} leads</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(l => {
            const t = TYPES[l.type] || { label: l.type, Icon: Inbox, cls: "bg-slate-100 text-slate-600" };
            const images = (l.images || []).filter(Boolean);
            return (
              <div key={l.id} className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${l.status === "new" ? "border-blue-300" : "border-slate-200/80"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${t.cls}`}><t.Icon size={12} /> {t.label}</span>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900" style={FONT}>{l.name}</h3>
                    <p className="text-xs text-slate-400">{l.created_at ? new Date(l.created_at).toLocaleString() : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.phone && <a href={`tel:${l.phone}`} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><Phone size={14} /> {l.phone}</a>}
                    {l.phone && <a href={`https://wa.me/${waNumber(l.phone)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="h-9 w-9 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center"><MessageCircle size={16} /></a>}
                    <button onClick={() => remove(l)} aria-label="Delete lead" className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"><Trash2 size={16} /></button>
                  </div>
                </div>

                {(l.requested_service || l.vehicle_type || l.preferred_date) && (
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    {[["Service", l.requested_service], ["Vehicle", l.vehicle_type], ["Preferred date", l.preferred_date]].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-slate-50 rounded-lg px-3 py-2"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-slate-800">{v}</dd></div>
                    ))}
                  </dl>
                )}
                {l.message && <p className="mt-3 text-sm text-slate-700 whitespace-pre-line">{l.message}</p>}
                {images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      <button key={i} onClick={() => setZoom(src)} className="size-16 rounded-lg overflow-hidden border border-slate-200"><img src={src} alt="" className="size-full object-cover" /></button>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-1.5">
                  {STATUSES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => l.status !== s.key && setStatus(l, s.key)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold ${l.status === s.key ? s.cls : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >{s.label}</button>
                  ))}
                </div>
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
