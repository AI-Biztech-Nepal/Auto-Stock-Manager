import { useEffect, useState, useCallback } from "react";
import { Eye, Users, Smartphone, Monitor, Globe, FileText, ExternalLink, Search, Clock, TrendingUp, Layers, Bike, Mail } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

const RANGES = [
  { key: "today", days: 1, skip: 0, label: "Today", short: "today" },
  { key: "yesterday", days: 1, skip: 1, label: "Yesterday", short: "yesterday" },
  { key: "week", days: 7, skip: 0, label: "7 days", short: "the last 7 days" },
  { key: "month", days: 30, skip: 0, label: "Month", short: "the last 30 days" },
  { key: "year", days: 365, skip: 0, label: "Year", short: "the last year" },
];
const PAGE_SIZE = 16;
const FONT = { fontFamily: "Manrope" };

// The website's front page is the path "/"; show it as Home.
const pageName = p => (p === "/" ? "Home" : p);

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
  const [sel, setSel] = useState(null);
  const split = daily.some(d => d.direct !== undefined);
  const clicks = daily.map(d => (clicksByDate ? clicksByDate[d.date] ?? null : null));
  const max = Math.max(1, ...daily.map(d => d.views), ...clicks.map(c => c || 0));
  const pts = clicks.map((c, i) => (c === null ? null : [((i + 0.5) / daily.length) * 100, 100 - (c / max) * 100]));
  const line = pts.filter(Boolean).map(p => p.join(",")).join(" ");
  // The chart always fits its card (no sideways scroll); detail that cannot fit a bar moves to a tap-to-read panel.
  const dense = daily.length > 10;
  const labelled = daily.length <= 45; // every bar carries its number; wider ranges rely on tap
  const step = dense ? Math.ceil(daily.length / 8) : 1;
  const fmtDay = d => new Date(d.date + "T00:00:00").toLocaleDateString("en", { day: "numeric", month: "short" });
  const seg = (d, n, key) => (
    <div className={`w-full ${COLORS[key]}`} style={{ height: `${d.views ? (n / d.views) * 100 : 0}%` }} />
  );
  const cur = sel !== null ? daily[sel] : null;
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
        {split ? <>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Direct</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />From Google</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Other sites</span>
        </> : <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />Page views</span>}
        {clicksByDate && <span className="flex items-center gap-1.5"><i className="w-4 h-0.5 bg-rose-500" />Google search clicks</span>}
      </div>
      <div className="min-h-[2.75rem] mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {cur ? (
          <span><b className="text-slate-900">{fmtDay(cur)}</b>: {cur.views} views, {cur.visitors} visitors
            {split && <> · <span className="text-indigo-600 font-semibold">{cur.direct} direct</span> · <span className="text-emerald-600 font-semibold">{cur.google} Google</span> · <span className="text-amber-500 font-semibold">{cur.other} other</span></>}
            {clicks[sel] !== null && <> · <span className="text-rose-500 font-semibold">{clicks[sel]} search clicks</span></>}</span>
        ) : "Tap a bar to see that day's split."}
      </div>
      <div className="relative h-44 sm:h-52">
        <div className="absolute inset-x-0 top-7 bottom-0">
          {[0.25, 0.5, 0.75].map(f => <div key={f} className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${f * 100}%` }} />)}
          <div className={`relative flex items-end h-full ${dense ? "gap-px" : "gap-1"}`}>
            {daily.map((d, i) => (
              <button type="button" key={d.date} onClick={() => setSel(sel === i ? null : i)} aria-label={`${fmtDay(d)}: ${d.views} views`}
                className={`flex-1 min-w-0 h-full flex items-end group ${sel === i ? "bg-blue-50 rounded" : ""}`}>
                <div className="w-full relative" style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 3 : 0 }}>
                  {labelled && d.views > 0 && (dense
                    ? <span className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 text-xs font-semibold text-slate-700 leading-none" style={{ writingMode: "vertical-rl", transform: "translateX(-50%) rotate(180deg)" }}>{d.views}</span>
                    : <span className="absolute -top-4 inset-x-0 text-center text-xs font-semibold text-slate-700">{d.views}</span>)}
                  <div className="absolute inset-0 flex flex-col-reverse rounded-t-sm overflow-hidden">
                    {split ? <>{seg(d, d.direct, "direct")}{seg(d, d.google, "google")}{seg(d, d.other, "other")}</> : seg(d, d.views, "views")}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {line && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={line} fill="none" stroke="#f43f5e" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div className={`flex mt-1.5 ${dense ? "gap-px" : "gap-1"}`}>
        {daily.map((d, i) => (
          <div key={d.date} className="flex-1 min-w-0 text-center leading-tight text-xs text-slate-500">
            {i % step === 0 ? <span className="whitespace-nowrap inline-block">{fmtDay(d)}</span> : <span>&nbsp;</span>}
            {!dense && split && (
              <div className="mt-1 flex flex-col sm:flex-row justify-center sm:gap-1 text-xs font-semibold">
                <span className="text-indigo-600">{d.direct}</span><span className="text-emerald-600">{d.google}</span><span className="text-amber-500">{d.other}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const RankList = ({ title, icon, rows, empty, linkBase }) => {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 8);
  const max = Math.max(1, ...rows.map(r => r.views));
  return (
    <Card>
      <SectionTitle icon={icon} title={title} />
      {rows.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500 text-center">{empty}</p> : (
        <ul className="px-5 pb-5 space-y-3">
          {list.map(r => {
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
      {rows.length > 8 && <button onClick={() => setAll(!all)} className="w-full pb-4 text-xs font-medium text-blue-600 hover:underline">{all ? "Show less" : `Show all ${rows.length}`}</button>}
    </Card>
  );
};

const SearchTable = ({ title, icon, rows: allRows, empty, linkBase }) => {
  const [all, setAll] = useState(false);
  const rows = all ? allRows : allRows.slice(0, 8);
  return (
  <Card>
    <SectionTitle icon={icon} title={title} />
    {allRows.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500 text-center">{empty}</p> : (
      <div className="pb-2">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-400 text-left"><th className="px-5 py-2 font-medium">&nbsp;</th><th className="py-2 font-medium text-right" title="People who clicked through from Google to your website">Visitors</th><th className="py-2 font-medium text-right" title="How many times your website was shown in Google results">Shown Page</th><th className="px-5 py-2 font-medium text-right" title="Your average position in Google results: 1 is the very top, 10 is the bottom of the first page">Rank</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-5 py-2.5 text-slate-700 max-w-[150px] sm:max-w-[240px] truncate" title={r.name}>
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
    {allRows.length > 8 && <button onClick={() => setAll(!all)} className="w-full pb-4 text-xs font-medium text-blue-600 hover:underline">{all ? "Show less" : `Show all ${allRows.length}`}</button>}
  </Card>
  );
};

// The bikes people opened most, with how many different customers (browsers) looked at each one.
const TopBikes = ({ rows, linkBase }) => {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 8);
  const max = Math.max(1, ...rows.map(r => r.views));
  const hasCustomers = rows.some(r => r.customers != null);
  return (
    <Card>
      <SectionTitle icon={Bike} title="Most viewed bikes" hint="Which bikes customers open most. Customers = different people who looked at that bike." />
      {rows.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-500 text-center">No bike pages were opened in this period.</p> : (
        <div className="pb-2">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-400 text-left">
              <th className="pl-5 py-2 font-medium w-8">#</th>
              <th className="py-2 font-medium">Bike</th>
              <th className="py-2 font-medium text-right">Views</th>
              {hasCustomers && <th className="px-5 py-2 font-medium text-right" title="Different people (browsers) who opened this bike's page">Customers</th>}
            </tr></thead>
            <tbody>{list.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50" data-testid="top-bike-row">
                <td className="pl-5 py-2.5 text-slate-400 font-semibold">{i + 1}</td>
                <td className="py-2.5 pr-3 max-w-[180px] sm:max-w-[320px]">
                  <a href={linkBase + r.path} target="_blank" rel="noopener noreferrer" title="Open this bike on the website" className="block truncate text-slate-700 hover:text-blue-700 hover:underline">{r.name}</a>
                  <div className="h-1 bg-slate-100 rounded-full mt-1.5"><div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${(r.views / max) * 100}%` }} /></div>
                </td>
                <td className="py-2.5 text-right font-semibold text-slate-900">{r.views}</td>
                {hasCustomers && <td className="px-5 py-2.5 text-right text-slate-600"><span className="inline-flex items-center gap-1"><Users size={12} className="text-slate-400" />{r.customers}</span></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {rows.length > 8 && <button onClick={() => setAll(!all)} className="w-full pb-4 text-xs font-medium text-blue-600 hover:underline">{all ? "Show less" : `Show all ${rows.length}`}</button>}
    </Card>
  );
};

// The "Every visit" table: one column per detail, so the emails of registered visitors line up in their own column.
const VISIT_COLS = "md:grid md:grid-cols-[10.5rem_8rem_4.5rem_minmax(0,1fr)_9rem_5rem_15rem_4.5rem] md:gap-x-3";
const VISIT_HEAD = ["Time", "Time on site", "Pages", "Pages visited", "Source", "Device", "Email", "Visitor"];

const VisitHeader = () => (
  <div className={`hidden ${VISIT_COLS} sticky top-0 z-10 items-center rounded-xl bg-slate-100 border border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500`} role="row">
    {VISIT_HEAD.map(h => <span key={h} role="columnheader">{h}</span>)}
  </div>
);

// One visit as a row of the table (a compact card on a phone); click it to open the page-by-page timeline.
const VisitTile = ({ v, onOpen }) => {
  const Dev = v.device === "mobile" ? Smartphone : Monitor;
  const quick = v.seconds === 0;
  const route = v.paths.map(pageName).join("  ›  ");
  const email = v.email
    ? <span className="inline-flex items-center gap-1 min-w-0 text-xs font-semibold text-emerald-700" title={`Registered: ${v.email}`} data-testid="visit-email"><Mail size={12} className="shrink-0" /><span className="truncate">{v.email}</span></span>
    : <span className="text-xs text-slate-300" title="Not signed in">Guest</span>;
  return (
    <button type="button" onClick={onOpen} role="row"
      className="block w-full text-left bg-white border border-slate-200/80 rounded-xl px-4 py-3 min-w-0 transition shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:shadow-md hover:border-blue-300">
      {/* Phone: time and duration on top, the pages opened, then source, pages and device, then who it was. */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Dev size={15} className="text-slate-500 shrink-0" />{v.started}</span>
          <span className={`flex items-center gap-1 text-sm font-bold whitespace-nowrap ${quick ? "text-slate-400" : "text-slate-900"}`} style={FONT}><Clock size={13} className="text-slate-400" />{fmtDuration(v.seconds)}</span>
        </div>
        <p className="text-xs text-slate-600 line-clamp-2 break-words" title={route}>{route}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="max-w-[60%] truncate px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{v.source}</span>
          <span>{v.pages} {v.pages === 1 ? "page" : "pages"}</span>
          <span className="capitalize">{v.device}</span>
          <span className="ml-auto font-mono text-slate-400">{v.visitor}</span>
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">{email}</div>
      </div>
      {/* Laptop: one table row. */}
      <div className={`hidden items-center ${VISIT_COLS}`}>
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 whitespace-nowrap"><Dev size={15} className="text-slate-500 shrink-0" />{v.started}</span>
        <span className={`flex items-center gap-1.5 text-sm font-bold whitespace-nowrap ${quick ? "text-slate-400" : "text-slate-900"}`} style={FONT}><Clock size={13} className="text-slate-400 shrink-0" />{fmtDuration(v.seconds)}</span>
        <span className="text-xs text-slate-500 whitespace-nowrap">{v.pages} {v.pages === 1 ? "page" : "pages"}</span>
        <span className="text-xs text-slate-600 truncate" title={route}>{route}</span>
        <span className="min-w-0"><span className="inline-block max-w-full truncate align-middle text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{v.source}</span></span>
        <span className="text-xs text-slate-500 capitalize whitespace-nowrap">{v.device}</span>
        {email}
        <span className="font-mono text-xs text-slate-400">{v.visitor}</span>
      </div>
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
            {v.email && <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><Mail size={11} />{v.email}</div>}
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
                <div className="text-sm text-slate-800 break-words">{pageName(st.label || st.path)}</div>
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
export default function Visits({ embedded = false }) {
  const [rangeKey, setRangeKey] = useState("month");
  const range = RANGES.find(r => r.key === rangeKey);
  const { days, skip } = range;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(null);
  const [searchErr, setSearchErr] = useState("");
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/visits/summary", { params: { days, skip } });
      setData(data);
    } catch {
      toast.error("Failed to load visits");
    } finally {
      setLoading(false);
    }
  }, [days, skip]);

  useEffect(() => { load(); setOpen(null); setShown(PAGE_SIZE); }, [load]);

  useEffect(() => {
    setSearchErr("");
    api.get("/visits/search", { params: { days, skip } })
      .then(r => setSearch(r.data))
      .catch(e => { setSearch(null); setSearchErr(e.response?.data?.detail || "Could not load Google Search data"); });
  }, [days, skip]);

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  // Google reports search data 2 to 3 days late, so a short range ending today or yesterday is always empty there.
  const searchEmpty = days <= 2 && skip <= 2 ? "Google shows search data 2 to 3 days late, so there is none for this day yet. Pick 7 days or Month." : "No search data for this period.";
  const devTotal = data.devices.mobile + data.devices.desktop;
  const pct = n => (devTotal ? Math.round((n / devTotal) * 100) : 0);
  const eng = data.engagement;
  const visitList = data.visit_list || [];
  const base = data.storefront_url;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="visits-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded && <h1 className="text-2xl font-bold text-slate-900">Visits</h1>}
          <p className="text-sm text-slate-500">Who visits {base.replace(/^https?:[/][/]/, "")}, where they come from, and how long they stay.</p>
          <p className="text-xs text-slate-400 mt-1">
            <a href={base} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Open the website <ExternalLink size={11} /></a>
            <span className="mx-2">·</span>{data.source === "google_analytics" ? "Data: Google Analytics" : "Data: site visit tracker"}
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-full sm:w-auto">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRangeKey(r.key)} className={`flex-1 sm:flex-none h-9 sm:h-8 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition ${rangeKey === r.key ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Stat icon={Users} value={data.unique_visitors} label={`Visitors, ${range.short}`} />
        <Stat icon={Layers} value={data.total_views} label={`Page views, ${range.short}`} />
        {eng && <Stat icon={Clock} value={`${eng.avg_minutes} min`} label="Avg time, visits with 2+ pages" />}
      </div>

      {days > 1 && <Card>
        <SectionTitle icon={TrendingUp} title="Visits graph" hint={`Page views each day by source${search?.configured ? ", with Google search clicks as the red line. Search Console data lags by 2 to 3 days" : ""}. Tap a bar for that day's full split.`}
          right={search?.configured && <span className="text-sm text-slate-600"><b className="text-slate-900">{search.total_clicks.toLocaleString()}</b> Google clicks · <b className="text-slate-900">{search.total_impressions.toLocaleString()}</b> times shown</span>} />
        <div className="px-3 sm:px-5 pb-5">
          {data.total_views === 0 && !search?.configured
            ? <p className="py-10 text-center text-sm text-slate-500">No visits recorded yet. Once the storefront sends visits (see DEPLOYMENT.md), they appear here.</p>
            : <CombinedChart daily={data.daily} clicksByDate={search?.configured ? Object.fromEntries(search.daily.map(d => [d.date, d.clicks])) : null} />}
        </div>
      </Card>}

      <div className="grid lg:grid-cols-3 gap-4">
        <RankList title="Top pages" icon={FileText} rows={data.top_pages.map(r => ({ ...r, name: pageName(r.name) }))} empty="No pages yet" linkBase={base} />
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

      <TopBikes rows={data.top_bikes || []} linkBase={base} />

      {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}
      {search?.configured && (
        <div className="grid lg:grid-cols-2 gap-4">
          <SearchTable title="What people searched on Google" icon={Search} rows={search.queries} empty={searchEmpty} />
          <SearchTable title="Countries (Google Search)" icon={Globe} rows={search.countries.map(c => ({ ...c, name: countryName(c.name) }))} empty={searchEmpty} />
        </div>
      )}

      {visitList.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={FONT}><Clock size={18} className="text-blue-600" />Every visit</h3>
              <p className="text-xs text-slate-400 mt-1">Newest first, Nepal time. Registered visitors show their email, the rest show Guest. Tap a row for its page-by-page timeline. Time is first to last page opened, so a one-page visit shows as under a minute.</p>
            </div>
            {eng && <span className="text-xs text-slate-500">{eng.visits} visits · {eng.pages_per_visit} pages each · longest {eng.longest_minutes} min · {eng.quick_visit_pct}% left after one page</span>}
          </div>
          <div className="space-y-2" role="table" aria-label="Every visit">
            <VisitHeader />
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
