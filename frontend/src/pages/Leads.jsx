import { useEffect, useState, useCallback } from "react";
import { Phone, Trash2, ImageIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatDateDual, getWhatsAppLink } from "../utils/helpers";

const TYPE_LABELS = { sell: "Sell", exchange: "Exchange", service: "Book Service" };
const STATUS_OPTIONS = ["new", "contacted", "closed"];
const BUSINESS_NAME = "G&G Auto Enterprise and Recondition House";
const WORKSHOP_ADDRESS = "Nayabasti, Boudha";

const buildWhatsAppMessage = (l) => {
  if (l.type === "service") {
    const service = l.requested_service || "your requested service";
    const vehicle = l.vehicle_type || "your vehicle";
    const date = l.preferred_date ? formatDateDual(l.preferred_date) : "your preferred date";
    return `We at ${BUSINESS_NAME} have received your request for ${service} of your vehicle ${vehicle}. You have booked the service at ${date}. Please contact this number or visit our workshop at ${WORKSHOP_ADDRESS} for any further queries. Thank you.`;
  }
  return `Hi ${l.name}, thank you for reaching out to ${BUSINESS_NAME} regarding your ${TYPE_LABELS[l.type] || l.type} inquiry. Please contact this number or visit our workshop at ${WORKSHOP_ADDRESS} for any further queries. Thank you.`;
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const fetchLeads = useCallback(async () => {
    try { const r = await api.get("/leads"); setLeads(r.data); }
    catch { toast.error("Failed to load leads"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/leads/${id}`, { status });
      setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
    } catch { toast.error("Failed to update status"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    try { await api.delete(`/leads/${id}`); toast.success("Deleted"); fetchLeads(); }
    catch { toast.error("Failed"); }
  };

  const filtered = leads.filter(l =>
    (typeFilter === "all" || l.type === typeFilter) &&
    (statusFilter === "all" || l.status === statusFilter)
  );

  const sel = "h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{leads.length} submissions from the storefront (Sell / Exchange / Book Service)</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={sel} data-testid="lead-type-filter">
            <option value="all">All Types</option>
            <option value="sell">Sell</option>
            <option value="exchange">Exchange</option>
            <option value="service">Book Service</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={sel} data-testid="lead-status-filter">
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <p className="font-medium">No leads yet</p>
          <p className="text-sm mt-1">Sell / Exchange / Book Service submissions from the storefront will show up here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => (
            <div key={l.id} data-testid="lead-card" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      {l.name}
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {TYPE_LABELS[l.type] || l.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1"><Phone size={11} />{l.phone}</span>
                      <span>{formatDateDual(l.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={l.status}
                      onChange={e => updateStatus(l.id, e.target.value)}
                      className={sel}
                      data-testid="lead-status-select"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <a
                      href={getWhatsAppLink(l.phone, buildWhatsAppMessage(l))}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Contact on WhatsApp"
                      data-testid="lead-whatsapp-btn"
                      className="p-1.5 hover:bg-green-50 rounded-lg"
                    >
                      <MessageCircle size={14} className="text-green-500" />
                    </a>
                    <button onClick={() => handleDelete(l.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>

                {l.type === "service" && (l.requested_service || l.vehicle_type || l.preferred_date) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {l.requested_service && <span><span className="font-semibold text-slate-700">Service:</span> {l.requested_service}</span>}
                    {l.vehicle_type && <span><span className="font-semibold text-slate-700">Vehicle:</span> {l.vehicle_type}</span>}
                    {l.preferred_date && <span><span className="font-semibold text-slate-700">Preferred Date:</span> {formatDateDual(l.preferred_date)}</span>}
                  </div>
                )}

                {l.message && (
                  <p className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{l.message}</p>
                )}

                {l.images?.length > 0 && (
                  <button
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    <ImageIcon size={13} /> {expanded === l.id ? "Hide" : "View"} {l.images.length} Photo{l.images.length > 1 ? "s" : ""}
                  </button>
                )}
                {expanded === l.id && l.images?.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {l.images.map((img, i) => (
                      <img key={i} src={img} alt={`Lead photo ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-slate-200" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
