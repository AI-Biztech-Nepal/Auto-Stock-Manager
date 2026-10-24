import { useEffect, useState, useCallback } from "react";
import { Eye, Users, Smartphone, Monitor, Globe, FileText, ExternalLink, Search, Clock, TrendingUp, Layers } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

const RANGES = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];
const PAGE_SIZE = 16;
const FONT = { fontFamily: "Manrope" };

const fmtDuration = s => (s < 60 ? (s ? `${s} sec` : "under 1 min") : `${Math.floor(s / 60)} min ${s % 60} sec`);

// Search Console reports countries as ISO alpha-3 codes; Intl.DisplayNames wants alpha-2.
const A3 = "afg:AF,alb:AL,dza:DZ,arg:AR,arm:AM,aus:AU,aut:AT,aze:AZ,bhr:BH,bgd:BD,blr:BY,bel:BE,btn:BT,bol:BO,bih:BA,bra:BR,brn:BN,bgr:BG,khm:KH,cmr:CM,can:CA,chl:CL,chn:CN,col:CO,hrv:HR,cyp:CY,cze:CZ,dnk:DK,egy:EG,est:EE,eth:ET,fin:FI,fra:FR,deu:DE,gha:GH,grc:GR,gin:GN,hkg:HK,hun:HU,isl:IS,ind:IN,idn:ID,irn:IR,irq:IQ,irl:IE,isr:IL,ita:IT,jpn:JP,jor:JO,kaz:KZ,ken:KE,kwt:KW,kgz:KG,lao:LA,lva:LV,lbn:LB,ltu:LT,lux:LU,mac:MO,mys:MY,mdv:MV,mlt:MT,mus:MU,mex:MX,mng:MN,mar:MA,mmr:MM,npl:NP,nld:NL,nzl:NZ,nga:NG,nor:NO,omn:OM,pak:PK,per:PE,phl:PH,pol:PL,prt:PT,qat:QA,rou:RO,rus:RU,sau:SA,srb:RS,sgp:SG,svk:SK,svn:SI,zaf:ZA,kor:KR,esp:ES,lka:LK,swe:SE,che:CH,twn:TW,tza:TZ,tha:TH,tur:TR,uga:UG,ukr:UA,are:AE,gbr:GB,usa:US,uzb:UZ,ven:VE,vnm:VN,yem:YE,zmb:ZM,zwe:ZW".split(",").reduce((m, p) => { const [k, v] = p.split(":"); m[k] = v; return m; }, {});
const countryName = code => {
  const a2 = A3[code.toLowerCase()];
  try { return a2 ? new Intl.DisplayNames(["en"], { type: "region" }).of(a2) : code.toUpperCase(); } catch { return code.toUpperCase(); }
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}>{children}</div>
);

const SectionTitle = ({ icon: Icon, title, hint, right }) => (
  <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5 pb-3">
    <div>
      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={FONT}>
        <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Icon size={16} /></span>{title}
      </h3>
      {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
    {right}
  </div>
);

const Stat = ({ icon: Icon, value, label }) => (
  <Card className="p-4 flex items-center gap-3">
    <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Icon size={18} /></span>
    <div className="min-w-0">
      <div className="text-2xl font-bold text-slate-900 leading-tight" style={FONT}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-xs text-slate-500 truncate">{label}</div>
    </div>
  </Card>
);

// Daily page views stacked by where they came from (direct / Google / other sites), with Google
// search clicks from Search Console drawn over them as a line.
const COLORS = { direct: "bg-indigo-500 group-hover:bg-indigo-600", google: "bg-emerald-500 group-hover:bg-emerald-600", other: "bg-amber-400 group-hover:bg-amber-500", views: "bg-indigo-400 group-hover:bg-indigo-500" };
const CombinedChart = ({ daily, clicksByDate }) => {
  const split = daily.some(d => d.direct !== undefined);
  const clicks = daily.map(d => (clicksByDate ? clicksByDate[d.date] ?? null : null));
  const max = Math.max(1, ...daily.map(d => d.views), ...clicks.map(c => c || 0));
  const pts = clicks.map((c, i) => (c === null ? null : [((i + 0.5) / daily.length) * 100, 100 - (c / max) * 100]));
  const line = pts.filter(Boolean).map(p => p.join(",")).join(" ");
  const seg = (d, n, key) => <div className={`w-full ${COLORS[key]}`} style={{ height: `${d.views ? (n / d.views) * 100 : 0}%` }} />;
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
        {split ? <>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Direct</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />From Google</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Other sites</span>
        </> : <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />Page views</span>}
        {clicksByDate && <span className="flex items-center gap-1.5"><i className="w-4 h-0.5 bg-rose-500" />Google search clicks (Search Console)</span>}
      </div>
      <div className="relative h-48">
        {[0.25, 0.5, 0.75].map(f => <div key={f} className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${f * 100}%` }} />)}
        <div className="relative flex items-end gap-[3px] h-full">
          {daily.map((d, i) => (
            <div key={d.date} className="flex-1 h-full flex items-end group"
              title={`${d.date}: ${d.views} views, ${d.visitors} visitors${split ? ` (direct ${d.direct}, Google ${d.google}, other ${d.other})` : ""}${clicks[i] !== null ? `, ${clicks[i]} Google search clicks` : ""}`}>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 3 : 0 }}>
                {split ? <>{seg(d, d.direct, "direct")}{seg(d, d.google, "google")}{seg(d, d.other, "other")}</> : seg(d, d.views, "views")}
              </div>
            </div>
          ))}
        </div>
        {line && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={line} fill="none" stroke="#f43f5e" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1"><span>{daily[0]?.date}</span><span>{daily[daily.length - 1]?.date}</span></div>
    </div>
  );
};

const RankList = ({ title, icon, rows, empty, linkBase }) => {
  const max = Math.max(1, ...rows.map(r => r.views));
  return (
    <Card>
      <SectionTitle icon={icon} title={title} />
      {rows.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500 text-center">{empty}</p> : (
        <ul className="px-5 pb-5 space-y-3 max-h-96 overflow-y-auto">
          {rows.map(r => {
            const inner = (
              <>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700 group-hover:text-blue-700">{r.name}</span>
                  <span className="font-semibold text-slate-900">{r.views}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full mt-1.5"><div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${(r.views / max) * 100}%` }} /></div>
              </>
            );
            return (
              <li key={r.name}>
                {linkBase && r.path
                  ? <a href={linkBase + r.path} target="_blank" rel="noopener noreferrer" className="group block rounded-lg -mx-2 px-2 py-1 hover:bg-slate-50" title="Open this page">{inner}</a>
                  : <div className="group">{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const SearchTable = ({ title, icon, rows, empty, linkBase }) => (
  <Card>
    <SectionTitle icon={icon} title={title} />
    {rows.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500 text-center">{empty}</p> : (
      <div className="max-h-96 overflow-y-auto pb-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white"><tr className="text-xs text-slate-400 text-left"><th className="px-5 py-2 font-medium">&nbsp;</th><th className="py-2 font-medium text-right">Clicks</th><th className="py-2 font-medium text-right">Shown</th><th className="px-5 py-2 font-medium text-right">Rank</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-5 py-2.5 text-slate-700 max-w-[240px] truncate" title={r.name}>
                {linkBase && r.path ? <a href={linkBase + r.path} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 hover:underline">{r.name}</a> : r.name}
              </td>
              <td className="py-2.5 text-right font-semibold text-slate-900">{r.clicks}</td>
              <td className="py-2.5 text-right text-slate-600">{r.impressions}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{r.position}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}
  </Card>
);

// One visit as a single full-width clickable line with every detail; click it to open the page-by-page timeline.
const VisitTile = ({ v, onOpen }) => {
  const Dev = v.device === "mobile" ? Smartphone : Monitor;
  const quick = v.seconds === 0;
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left bg-white border border-slate-200/80 rounded-xl px-4 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-1.5 transition shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:shadow-md hover:border-blue-300">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 whitespace-nowrap md:w-44 shrink-0"><Dev size={15} className="text-slate-500" />{v.started}</span>
      <span className={`flex items-center gap-1.5 text-sm font-bold whitespace-nowrap md:w-36 shrink-0 ${quick ? "text-slate-400" : "text-slate-900"}`} style={FONT}><Clock size={13} className="text-slate-400" />{fmtDuration(v.seconds)}</span>
      <span className="text-xs text-slate-500 whitespace-nowrap md:w-16 shrink-0">{v.pages} {v.pages === 1 ? "page" : "pages"}</span>
      <span className="text-xs text-slate-600 truncate flex-1 min-w-[140px] basis-full md:basis-0" title={v.paths.join(", ")}>{v.paths.join("  ›  ")}</span>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap shrink-0 max-w-[140px] truncate">{v.source}</span>
      <span className="text-[11px] text-slate-500 capitalize whitespace-nowrap shrink-0 md:w-16">{v.device}</span>
      <span className="font-mono text-[11px] text-slate-400 shrink-0">{v.visitor}</span>
    </button>
  );
};

const VisitModal = ({ v, onClose }) => {
  const Dev = v.device === "mobile" ? Smartphone : Monitor;
  useEffect(() => {
    const h = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5"><Dev size={13} />{v.started} · from {v.source} · visitor <span className="font-mono">{v.visitor}</span></div>
            <div className="text-2xl font-bold text-slate-900 mt-1" style={FONT}>{fmtDuration(v.seconds)}</div>
            <div className="text-xs text-slate-400">time on site · {v.pages} {v.pages === 1 ? "page" : "pages"}</div>
          </div>
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Close</button>
        </div>
        <ol className="mt-5">
          {(v.steps || []).map((st, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5" />{i < v.steps.length - 1 && <span className="flex-1 w-px bg-slate-200" />}</div>
              <div className="pb-3 min-w-0">
                <div className="text-sm text-slate-800 break-words">{st.label || st.path}</div>
                <div className="text-xs text-slate-400">{st.time}{i > 0 && ` · ${fmtDuration(st.after)} after the previous page`}</div>
              </div>
            </li>
          ))}
          {v.pages > (v.steps || []).length && <li className="text-xs text-slate-400 pl-5">+ {v.pages - v.steps.length} more pages</li>}
        </ol>
      </div>
    </div>
  );
};

// Storefront traffic: page views and unique visitors reported by the site's visit beacon.
export default function Visits() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(null);
  const [searchErr, setSearchErr] = useState("");
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/visits/summary", { params: { days } });
      setData(data);
    } catch {
      toast.error("Failed to load visits");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); setOpen(null); setShown(PAGE_SIZE); }, [load]);

  useEffect(() => {
    setSearchErr("");
    api.get("/visits/search", { params: { days } })
      .then(r => setSearch(r.data))
      .catch(e => { setSearch(null); setSearchErr(e.response?.data?.detail || "Could not load Google Search data"); });
  }, [days]);

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  const devTotal = data.devices.mobile + data.devices.desktop;
  const pct = n => (devTotal ? Math.round((n / devTotal) * 100) : 0);
  const eng = data.engagement;
  const visitList = data.visit_list || [];
  const base = data.storefront_url;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900" style={FONT}>Website visits</h2>
          <a href={base} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">{base.replace(/^https?:\/\//, "")} <ExternalLink size={12} /></a>
          <span className="ml-2 text-xs text-slate-400">{data.source === "google_analytics" ? "Data: Google Analytics" : "Data: site visit tracker"}</span>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)} className={`h-8 px-4 rounded-lg text-sm font-medium transition ${days === r.days ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat icon={Users} value={data.today_visitors} label="Visitors today" />
        <Stat icon={Eye} value={data.today_views} label="Page views today" />
        <Stat icon={Users} value={data.unique_visitors} label={`Visitors, ${days} days`} />
        <Stat icon={Layers} value={data.total_views} label={`Page views, ${days} days`} />
        {eng && <Stat icon={Clock} value={`${eng.avg_minutes} min`} label="Avg time, visits with 2+ pages" />}
      </div>

      <Card>
        <SectionTitle icon={TrendingUp} title="Daily visits" hint={`Page views each day by source${search?.configured ? ", with Google search clicks as the red line. Search Console data lags by 2 to 3 days" : ""}. Hover a day for the numbers.`}
          right={search?.configured && <span className="text-sm text-slate-600"><b className="text-slate-900">{search.total_clicks.toLocaleString()}</b> Google clicks · <b className="text-slate-900">{search.total_impressions.toLocaleString()}</b> times shown</span>} />
        <div className="px-5 pb-5">
          {data.total_views === 0 && !search?.configured
            ? <p className="py-10 text-center text-sm text-slate-500">No visits recorded yet. Once the storefront sends visits (see DEPLOYMENT.md), they appear here.</p>
            : <CombinedChart daily={data.daily} clicksByDate={search?.configured ? Object.fromEntries(search.daily.map(d => [d.date, d.clicks])) : null} />}
          {search?.configured && (
            <table className="w-full text-sm mt-5">
              <thead><tr className="text-xs text-slate-400 text-left"><th className="py-2 font-medium">Month (Google search)</th><th className="py-2 font-medium text-right">Clicks</th><th className="py-2 font-medium text-right">Shown</th></tr></thead>
              <tbody>{search.months.map(m => <tr key={m.month} className="border-t border-slate-100"><td className="py-2 text-slate-700">{m.month}</td><td className="py-2 text-right font-semibold text-slate-900">{m.clicks}</td><td className="py-2 text-right text-slate-600">{m.impressions}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <RankList title="Top pages" icon={FileText} rows={data.top_pages} empty="No pages yet" linkBase={base} />
        <RankList title="Where visitors come from" icon={Globe} rows={data.sources} empty="No traffic yet" />
        <Card>
          <SectionTitle icon={Users} title="Devices" />
          <div className="px-5 pb-5 space-y-5 text-sm">
            {[["Mobile", Smartphone, data.devices.mobile, "from-blue-500 to-indigo-500"], ["Desktop", Monitor, data.devices.desktop, "from-slate-400 to-slate-500"]].map(([label, Icon, n, grad]) => (
              <div key={label}>
                <div className="flex items-center gap-2"><Icon size={16} className="text-slate-500" /><span className="flex-1 text-slate-700">{label}</span><b className="text-slate-900">{pct(n)}%</b></div>
                <div className="h-2 bg-slate-100 rounded-full mt-2"><div className={`h-2 rounded-full bg-gradient-to-r ${grad}`} style={{ width: `${pct(n)}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}
      {search?.configured && (
        <div className="grid lg:grid-cols-2 gap-4">
          <SearchTable title="What people searched on Google" icon={Search} rows={search.queries} empty="No search data yet" />
          <SearchTable title="Countries (Google Search)" icon={Globe} rows={search.countries.map(c => ({ ...c, name: countryName(c.name) }))} empty="No search data yet" />
        </div>
      )}

      {visitList.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={FONT}><Clock size={18} className="text-blue-600" />Every visit</h3>
              <p className="text-xs text-slate-400 mt-1">Newest first, Nepal time. Tap a row for its page-by-page timeline. Time is first to last page opened, so a one-page visit shows as under a minute.</p>
            </div>
            {eng && <span className="text-xs text-slate-500">{eng.visits} visits · {eng.pages_per_visit} pages each · longest {eng.longest_minutes} min · {eng.quick_visit_pct}% left after one page</span>}
          </div>
          <div className="space-y-2">
            {visitList.slice(0, shown).map((v, i) => <VisitTile key={`${v.visitor}-${v.started}-${i}`} v={v} onOpen={() => setOpen(i)} />)}
          </div>
          {shown < visitList.length && (
            <div className="text-center"><button onClick={() => setShown(shown + PAGE_SIZE)} className="h-9 px-5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700">Show more visits ({visitList.length - shown} left)</button></div>
          )}
        </div>
      )}

      {open !== null && visitList[open] && <VisitModal v={visitList[open]} onClose={() => setOpen(null)} />}
    </div>
  );
}
