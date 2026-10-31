import { useEffect, useMemo, useState, useCallback } from "react";
import { Users, Phone, MessageCircle, Search, CornerDownRight, UserCheck, Link2, Globe, Tag, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import DateRangeFilter, { resolveDateFilter } from "../components/DateRangeFilter";
import HoverADDate from "../components/HoverADDate";
import SourceField from "../components/SourceField";
import { SOURCES, SOURCE_LABEL, SOURCE_STYLE, isSourceComplete, sourceFromCustomer, sourcePayload } from "../utils/crm";

// Where customers come from: which source brings them, who refers whom (and who they refer in turn),
// and how the website is doing. Everything here is read from the customers' source tags, so the tagging
// list (Customers view) is what makes the Overview worth reading.
const FONT = { fontFamily: "Manrope" };
const PAGE_SIZE = 40;

const Card = ({ children, className = "" }) => (
  <div className={`bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, title, hint }) => (
  <div className="px-5 pt-5 pb-3">
    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={FONT}>
      <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Icon size={16} /></span>{title}
    </h3>
    {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
  </div>
);

const Tile = ({ value, label, sub }) => (
  <Card className="p-4">
    <div className="text-2xl font-bold text-slate-900 leading-tight" style={FONT}>{typeof value === "number" ? value.toLocaleString() : value}</div>
    <div className="text-xs font-medium text-slate-600 mt-0.5">{label}</div>
    {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
  </Card>
);

const SourcePill = ({ source, note }) => (
  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_STYLE[source || "unknown"].pill}`}>
    {SOURCE_LABEL[source || "unknown"]}{source === "other" && note ? ` · ${note}` : ""}
  </span>
);

const waNumber = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};

const WEBSITE_GROUPS = [
  ["direct", "Direct (typed the address or saved link)", "bg-slate-500"],
  ["google", "Google", "bg-emerald-500"],
  ["facebook", "Facebook", "bg-blue-500"],
  ["instagram", "Instagram", "bg-pink-500"],
  ["tiktok", "TikTok", "bg-slate-800"],
  ["whatsapp", "WhatsApp", "bg-green-500"],
  ["other_search", "Other search (Bing, Yahoo ...)", "bg-amber-400"],
  ["other", "Other sites", "bg-amber-500"],
];

// ── Overview ──────────────────────────────────────────────────────────

function SourceRows({ sources }) {
  // A source nobody has been tagged with yet would only be a card of zeros.
  const rows = sources.filter(r => r.customers > 0 || r.sold > 0 || r.new_customers > 0);
  const anyTagged = rows.some(r => r.source !== "unknown");
  const max = Math.max(1, ...rows.map(r => r.customers));
  const total = rows.reduce((t, r) => ({
    customers: t.customers + r.customers, new_customers: t.new_customers + r.new_customers, sold: t.sold + r.sold,
    revenue: t.revenue + r.revenue, profit: t.profit + r.profit,
  }), { customers: 0, new_customers: 0, sold: 0, revenue: 0, profit: 0 });
  const stat = (label, value, tone = "") => (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-sm font-bold truncate ${tone || "text-slate-800"}`} style={FONT}>{value}</div>
    </div>
  );
  return (
    <div className="px-5 pb-5 space-y-3">
      {!anyTagged && <p className="text-sm text-slate-500">No customer is tagged with a source yet, so there is nothing to compare. Tag customers to see which source brings the most business.</p>}
      {rows.map(r => (
        <div key={r.source} className="rounded-xl border border-slate-100 p-3" data-testid={`crm-source-${r.source}`}>
          <div className="flex items-center justify-between gap-3">
            <SourcePill source={r.source === "unknown" ? null : r.source} />
            <span className="text-sm font-bold text-slate-900" style={FONT}>{r.customers.toLocaleString()} <span className="text-xs font-medium text-slate-400">customers</span></span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${SOURCE_STYLE[r.source].bar}`} style={{ width: `${(r.customers / max) * 100}%` }} /></div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stat("New in range", r.new_customers)}
            {stat("Vehicles sold", r.sold)}
            {stat("Revenue", formatNPR(r.revenue))}
            {stat("Profit", formatNPR(r.profit), r.profit < 0 ? "text-red-600" : "")}
          </div>
        </div>
      ))}
      <div className="rounded-xl bg-slate-50 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stat("All sources", `${total.customers.toLocaleString()} customers`)}
        {stat("New in range", total.new_customers)}
        {stat("Vehicles sold", total.sold)}
        {stat("Revenue", formatNPR(total.revenue))}
        {stat("Profit", formatNPR(total.profit), total.profit < 0 ? "text-red-600" : "")}
      </div>
    </div>
  );
}

function TreeNode({ node, level }) {
  return (
    <li>
      <div className="flex items-center gap-1.5 py-1 text-sm" style={{ paddingLeft: (level - 1) * 18 }}>
        <CornerDownRight size={13} className="text-slate-300 shrink-0" />
        <span className="font-medium text-slate-700">{node.name}</span>
        {node.bought && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">bought</span>}
      </div>
      {node.children.length > 0 && <ul>{node.children.map(c => <TreeNode key={c.id} node={c} level={level + 1} />)}</ul>}
    </li>
  );
}

function Referrals({ data, onTag }) {
  const [openId, setOpenId] = useState(null);
  return (
    <Card>
      <SectionTitle icon={Link2} title="Referrals" hint="Who brings customers in, and who they bring in after that" />
      {data.referral_customers === 0 ? (
        <div className="px-5 pb-6 text-sm text-slate-500">
          No referrals recorded yet. When a customer is added as <b>Referral</b> and you pick who referred them, it shows up here, including chains where a referred customer refers someone else.
          <button onClick={onTag} className="block mt-3 text-sm font-semibold text-blue-600 hover:underline">Tag existing customers</button>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.referral_customers}</div><div className="text-xs text-slate-500">came by referral</div></div>
            <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.refer_of_refer}</div><div className="text-xs text-slate-500">referred by someone who was referred</div></div>
            <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.longest_chain || "—"}</div><div className="text-xs text-slate-500">people in the longest chain</div></div>
          </div>
          {data.top_referrers.length === 0 ? (
            <p className="text-sm text-slate-500">{data.referral_customers} customers are tagged Referral but none names who referred them yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.top_referrers.map(t => (
                <li key={t.id} className="py-3">
                  <button onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id} className="w-full text-left flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="font-semibold text-slate-900">{t.name}</span>
                    <span className="text-xs text-slate-500">
                      referred <b className="text-slate-800">{t.direct}</b>{t.via > 0 && <> + <b className="text-slate-800">{t.via}</b> through them</>}
                      {" · "}{t.buyers} bought · {formatNPR(t.revenue)}
                    </span>
                  </button>
                  {openId === t.id && <ul className="mt-2 pl-2 border-l-2 border-amber-200 ml-1">{t.tree.children.map(c => <TreeNode key={c.id} node={c} level={1} />)}</ul>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Website({ data, taggedWebsite }) {
  const rows = WEBSITE_GROUPS.map(([k, label, bar]) => ({ k, label, bar, n: data.by_source[k] || 0 })).filter(r => r.n > 0);
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <Card>
      <SectionTitle icon={Globe} title="Website" hint="Visitors to hamroauto.com.np and the enquiries they sent" />
      <div className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.visitors.toLocaleString()}</div><div className="text-xs text-slate-500">visitors</div></div>
          <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.leads.forms}</div><div className="text-xs text-slate-500">form enquiries</div></div>
          <div><div className="text-xl font-bold text-slate-900" style={FONT}>{data.leads.taps}</div><div className="text-xs text-slate-500">call / WhatsApp taps</div></div>
        </div>
        {rows.length === 0 ? <p className="text-sm text-slate-500">No visitors in this range.</p> : (
          <ul className="space-y-2.5">
            {rows.map(r => (
              <li key={r.k}>
                <div className="flex justify-between text-sm"><span className="text-slate-700">{r.label}</span><span className="font-semibold text-slate-900">{r.n} <span className="text-xs font-normal text-slate-400">{Math.round((r.n / data.visitors) * 100)}%</span></span></div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${r.bar}`} style={{ width: `${(r.n / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-400">
          Customers tagged <b>Website</b> in this range: {taggedWebsite}. Facebook only counts visitors whose browser says they came from Facebook, so the real number is higher.
        </p>
      </div>
    </Card>
  );
}

function Overview({ summary, range, setRange, onTag }) {
  const pct = summary.customers ? Math.round((summary.tagged / summary.customers) * 100) : 0;
  const website = summary.sources.find(s => s.source === "website");
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DateRangeFilter value={range.key} custom={range.custom} onChange={(key, custom) => setRange({ key, custom })} testid="crm-date-filter" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile value={summary.customers} label="Customers" sub={`${summary.sources.reduce((n, s) => n + s.buyers, 0)} bought in this range`} />
        <Tile value={`${pct}%`} label="Know how they found us" sub={`${summary.tagged} of ${summary.customers} tagged`} />
        <Tile value={summary.referrals.referral_customers} label="Came by referral" />
        <Tile value={summary.referrals.refer_of_refer} label="Refer-of-refer" sub={summary.referrals.longest_chain ? `Longest chain: ${summary.referrals.longest_chain} people` : "No chains yet"} />
      </div>

      {summary.untagged > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900"><b>{summary.untagged}</b> customers don't have a source yet. The figures below only count the ones that do.</p>
          <button onClick={onTag} className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold inline-flex items-center gap-1.5"><Tag size={15} /> Tag them</button>
        </div>
      )}

      <Card>
        <SectionTitle icon={Users} title="Where customers come from" hint="Customers are everyone on file; the other figures follow the dates you picked" />
        <SourceRows sources={summary.sources} />
      </Card>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Referrals data={summary.referrals} onTag={onTag} />
        <Website data={summary.website} taggedWebsite={website ? website.new_customers : 0} />
      </div>
    </div>
  );
}

// ── Customers (tagging) ───────────────────────────────────────────────

function CustomerRow({ c, customers, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sourceFromCustomer(c));
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    setSaving(true);
    try { await onSave(c, value); setEditing(false); }
    catch { /* the error was already shown; keep the editor open so nothing typed is lost */ }
    finally { setSaving(false); }
  };
  const submit = () => {
    if (isSourceComplete(draft)) save(draft);
    else toast.error(draft.source === "referral" ? "Say who referred them" : "Pick how they found the shop");
  };
  const quick = (key) => {
    if (key === "referral" || key === "other") { setDraft({ source: key, source_note: "", referred_by_id: "" }); setEditing(true); return; }
    save({ source: key, source_note: "", referred_by_id: "" });
  };

  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${c.source ? "border-slate-200/80" : "border-amber-200"}`} data-testid="crm-customer">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-bold text-slate-900 truncate" style={FONT}>{c.name}</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {c.purchases > 0 ? <>{c.purchases} vehicle{c.purchases > 1 ? "s" : ""} · {formatNPR(c.spent)}{c.last_sale_date && <> · last <HoverADDate date={c.last_sale_date} /></>}</> : "No purchase yet"}
            {c.referral_count > 0 && <> · referred {c.referral_count}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {c.contact_number && <a href={`tel:${c.contact_number}`} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"><Phone size={14} /> {c.contact_number}</a>}
          {c.contact_number && <a href={`https://wa.me/${waNumber(c.contact_number)}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="h-9 w-9 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center"><MessageCircle size={16} /></a>}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <SourceField value={draft} onChange={setDraft} customers={customers} excludeId={c.id} required />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditing(false); setDraft(sourceFromCustomer(c)); }} className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-white inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            <button onClick={submit} disabled={saving}
              className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1" data-testid="crm-save-source"><Check size={14} /> {saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      ) : c.source ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SourcePill source={c.source} note={c.source_note} />
          {c.source === "referral" && (c.referred_by_name || c.source_note) && <span className="text-xs text-slate-500">by <b className="text-slate-700">{c.referred_by_name || c.source_note}</b></span>}
          <button onClick={() => { setDraft(sourceFromCustomer(c)); setEditing(true); }} className="ml-auto text-xs font-semibold text-blue-600 hover:underline">Change</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-xs font-medium text-amber-700 mb-1.5">How did they find us? Tap one</p>
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => quick(key)} disabled={saving} data-testid={`crm-quick-${key}`}
                className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerList({ customers, onSave, filter, setFilter }) {
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const n = { all: customers.length, needs: 0 };
    SOURCES.forEach(s => { n[s.key] = 0; });
    customers.forEach(c => { if (c.source) n[c.source] += 1; else n.needs += 1; });
    return n;
  }, [customers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c =>
      (filter === "all" || (filter === "needs" ? !c.source : c.source === filter)) &&
      (!q || (c.name || "").toLowerCase().includes(q) || (c.contact_number || "").includes(q)));
  }, [customers, filter, search]);

  useEffect(() => { setShown(PAGE_SIZE); }, [filter, search]);

  const chips = [["all", "All"], ["needs", "Needs source"], ...SOURCES.map(s => [s.key, s.label])];
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone" className="w-full h-11 pl-10 pr-3 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" data-testid="crm-search" />
      </div>
      <div role="group" aria-label="Filter customers" style={{ scrollbarWidth: "none" }} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-scroll sm:overflow-visible sm:flex-wrap [&::-webkit-scrollbar]:hidden">
        {chips.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={`shrink-0 h-10 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filter === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {label}<span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === k ? "bg-white/25" : k === "needs" && counts.needs ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto mb-4 size-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><UserCheck size={22} /></span>
          <h3 className="text-base font-bold text-slate-900" style={FONT}>{filter === "needs" && !search ? "Everyone has a source" : "No customers match"}</h3>
          <p className="mt-1 text-sm text-slate-600">{filter === "needs" && !search ? "New customers are asked how they found the shop when they are added." : "Try another filter or search."}</p>
        </Card>
      ) : (
        <>
          {list.slice(0, shown).map(c => <CustomerRow key={c.id} c={c} customers={customers} onSave={onSave} />)}
          {list.length > shown && (
            <button onClick={() => setShown(s => s + PAGE_SIZE)} className="w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50">Show more ({list.length - shown} left)</button>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function CRM() {
  const [view, setView] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState({ key: "all", custom: null });
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState(null);

  const resolved = range.key === "all" ? null : resolveDateFilter(range.key, range.custom);
  const start = resolved?.start, end = resolved?.end;

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/crm/summary", { params: start && end ? { start, end } : {} });
      setSummary(data);
    } catch { toast.error("Failed to load the CRM figures"); }
  }, [start, end]);

  const loadCustomers = useCallback(async () => {
    try { setCustomers((await api.get("/crm/customers")).data); }
    catch { toast.error("Failed to load customers"); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const saveSource = async (c, value) => {
    try {
      await api.put(`/customers/${c.id}/source`, sourcePayload(value));
      await Promise.all([loadCustomers(), loadSummary()]);
      toast.success(`${c.name} tagged`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save the source");
      throw err;
    }
  };

  const goTag = () => { setFilter("needs"); setView("customers"); window.scrollTo({ top: 0 }); };

  if (!summary || !customers) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  }
  const needs = summary.untagged;
  return (
    <div className="space-y-4" data-testid="crm-page">
      <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 sm:max-w-sm" role="tablist" aria-label="CRM">
        {[["overview", "Overview"], ["customers", "Customers"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} data-testid={`crm-view-${k}`}
            className={`h-10 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center justify-center gap-2 ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            {label}{k === "customers" && needs > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold inline-flex items-center justify-center">{needs}</span>}
          </button>
        ))}
      </div>
      {view === "overview"
        ? <Overview summary={summary} range={range} setRange={setRange} onTag={goTag} />
        : <CustomerList customers={customers} onSave={saveSource} filter={filter} setFilter={setFilter} />}
    </div>
  );
}
