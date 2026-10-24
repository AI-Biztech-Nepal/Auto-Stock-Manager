import { useEffect, useState, useCallback } from "react";
import { Eye, Users, Smartphone, Monitor, Globe, FileText, ExternalLink, Search, Clock } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";

const RANGES = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];

const Stat = ({ value, label, cls }) => (
  <div className={`border rounded-xl p-4 text-center ${cls}`}>
    <div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{value.toLocaleString()}</div>
    <div className="text-xs mt-0.5 opacity-80">{label}</div>
  </div>
);

const RankList = ({ title, icon: Icon, rows, empty }) => {
  const max = Math.max(1, ...rows.map(r => r.views));
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Icon size={17} className="text-blue-600" />{title}</h3>
      </div>
      {rows.length === 0 ? <p className="p-6 text-sm text-slate-500 text-center">{empty}</p> : (
        <ul className="p-4 space-y-2.5 max-h-96 overflow-y-auto">
          {rows.map(r => (
            <li key={r.name} className="text-sm">
              <div className="flex justify-between gap-3"><span className="truncate text-slate-700">{r.name}</span><span className="font-semibold text-slate-900">{r.views}</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${(r.views / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const fmtDuration = s => (s < 60 ? (s ? `${s} sec` : "under 1 min") : `${Math.floor(s / 60)} min ${s % 60} sec`);

// Search Console reports countries as ISO alpha-3 codes; Intl.DisplayNames wants alpha-2.
const A3 = "afg:AF,alb:AL,dza:DZ,arg:AR,arm:AM,aus:AU,aut:AT,aze:AZ,bhr:BH,bgd:BD,blr:BY,bel:BE,btn:BT,bol:BO,bih:BA,bra:BR,brn:BN,bgr:BG,khm:KH,cmr:CM,can:CA,chl:CL,chn:CN,col:CO,hrv:HR,cyp:CY,cze:CZ,dnk:DK,egy:EG,est:EE,eth:ET,fin:FI,fra:FR,deu:DE,gha:GH,grc:GR,gin:GN,hkg:HK,hun:HU,isl:IS,ind:IN,idn:ID,irn:IR,irq:IQ,irl:IE,isr:IL,ita:IT,jpn:JP,jor:JO,kaz:KZ,ken:KE,kwt:KW,kgz:KG,lao:LA,lva:LV,lbn:LB,ltu:LT,lux:LU,mac:MO,mys:MY,mdv:MV,mlt:MT,mus:MU,mex:MX,mng:MN,mar:MA,mmr:MM,npl:NP,nld:NL,nzl:NZ,nga:NG,nor:NO,omn:OM,pak:PK,per:PE,phl:PH,pol:PL,prt:PT,qat:QA,rou:RO,rus:RU,sau:SA,srb:RS,sgp:SG,svk:SK,svn:SI,zaf:ZA,kor:KR,esp:ES,lka:LK,swe:SE,che:CH,twn:TW,tza:TZ,tha:TH,tur:TR,uga:UG,ukr:UA,are:AE,gbr:GB,usa:US,uzb:UZ,ven:VE,vnm:VN,yem:YE,zmb:ZM,zwe:ZW".split(",").reduce((m, p) => { const [k, v] = p.split(":"); m[k] = v; return m; }, {});
const countryName = code => {
  const a2 = A3[code.toLowerCase()];
  try { return a2 ? new Intl.DisplayNames(["en"], { type: "region" }).of(a2) : code.toUpperCase(); } catch { return code.toUpperCase(); }
};

// Google Search Console table (keywords / countries). Shown only once the backend has it configured.
const SearchTable = ({ title, icon: Icon, rows, empty }) => (
  <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
    <div className="p-4 border-b border-slate-100">
      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Icon size={17} className="text-blue-600" />{title}</h3>
    </div>
    {rows.length === 0 ? <p className="p-6 text-sm text-slate-500 text-center">{empty}</p> : (
      <div className="max-h-96 overflow-y-auto"><table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-400 text-left"><th className="px-4 py-2 font-medium">&nbsp;</th><th className="py-2 font-medium text-right">Clicks</th><th className="py-2 font-medium text-right">Shown</th><th className="px-4 py-2 font-medium text-right">Rank</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.name} className="border-t border-slate-100">
            <td className="px-4 py-2 text-slate-700 max-w-[220px] truncate">{r.name}</td>
            <td className="py-2 text-right font-semibold text-slate-900">{r.clicks}</td>
            <td className="py-2 text-right text-slate-600">{r.impressions}</td>
            <td className="px-4 py-2 text-right text-slate-600">{r.position}</td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
  </div>
);

// Storefront traffic: page views and unique visitors reported by the site's visit beacon.
export default function Visits() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(null);
  const [searchErr, setSearchErr] = useState("");

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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSearchErr("");
    api.get("/visits/search", { params: { days } })
      .then(r => setSearch(r.data))
      .catch(e => { setSearch(null); setSearchErr(e.response?.data?.detail || "Could not load Google Search data"); });
  }, [days]);

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  const maxViews = Math.max(1, ...data.daily.map(d => d.views));
  const devTotal = data.devices.mobile + data.devices.desktop;
  const pct = n => (devTotal ? Math.round((n / devTotal) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={data.storefront_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">{data.storefront_url.replace(/^https?:\/\//, "")} <ExternalLink size={12} /></a>
        <span className="text-xs text-slate-400">{data.source === "google_analytics" ? "Data: Google Analytics" : "Data: site visit beacon"}</span>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)} className={`h-8 px-3 rounded-md text-sm font-medium ${days === r.days ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat value={data.today_visitors} label="Visitors today" cls="bg-white border-slate-200 text-slate-900 shadow-sm" />
        <Stat value={data.today_views} label="Page views today" cls="bg-white border-slate-200 text-slate-900 shadow-sm" />
        <Stat value={data.unique_visitors} label={`Visitors, ${days} days`} cls="bg-green-50 border-green-100 text-green-700" />
        <Stat value={data.total_views} label={`Page views, ${days} days`} cls="bg-blue-50 border-blue-100 text-blue-700" />
      </div>

      {data.engagement && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1" style={{ fontFamily: "Manrope" }}><Clock size={17} className="text-blue-600" />Time on site</h3>
          <p className="text-xs text-slate-400 mb-4">Estimated from page opens: first to last page of a visit (a break of over 30 minutes starts a new visit). A one-page visit has no measurable time.</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
            <div><div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{data.engagement.avg_minutes} min</div><div className="text-xs text-slate-500">Average, visits with 2+ pages</div></div>
            <div><div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{data.engagement.longest_minutes} min</div><div className="text-xs text-slate-500">Longest visit</div></div>
            <div><div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{data.engagement.pages_per_visit}</div><div className="text-xs text-slate-500">Pages per visit</div></div>
            <div><div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{data.engagement.visits}</div><div className="text-xs text-slate-500">Visits ({data.engagement.multi_page_visits} with 2+ pages)</div></div>
            <div><div className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>{data.engagement.quick_visit_pct}%</div><div className="text-xs text-slate-500">Left after one page</div></div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4" style={{ fontFamily: "Manrope" }}><Eye size={17} className="text-blue-600" />Daily page views</h3>
        {data.total_views === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No visits recorded yet. Once the storefront sends visits (see DEPLOYMENT.md), they appear here.</p>
        ) : (
          <div className="flex items-end gap-px h-40">
            {data.daily.map(d => (
              <div key={d.date} className="flex-1 h-full flex items-end group relative" title={`${d.date}: ${d.views} views, ${d.visitors} visitors`}>
                <div className="w-full bg-blue-500 group-hover:bg-blue-700 rounded-t-sm" style={{ height: `${(d.views / maxViews) * 100}%`, minHeight: d.views ? 2 : 0 }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between text-xs text-slate-400 mt-1"><span>{data.daily[0]?.date}</span><span>{data.daily[data.daily.length - 1]?.date}</span></div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <RankList title="Top pages" icon={FileText} rows={data.top_pages} empty="No pages yet" />
        <RankList title="Where visitors come from" icon={Globe} rows={data.sources} empty="No traffic yet" />
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-slate-100"><h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Users size={17} className="text-blue-600" />Devices</h3></div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2"><Smartphone size={16} className="text-slate-500" /><span className="flex-1">Mobile</span><b>{pct(data.devices.mobile)}%</b></div>
            <div className="flex items-center gap-2"><Monitor size={16} className="text-slate-500" /><span className="flex-1">Desktop</span><b>{pct(data.devices.desktop)}%</b></div>
          </div>
        </div>
      </div>

      {data.visit_list && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}><Clock size={17} className="text-blue-600" />Every visit, with its time</h3>
            <p className="text-xs text-slate-400 mt-1">Newest first, Nepal time. Time is first to last page opened, so a one-page visit shows as under a minute.</p>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="text-xs text-slate-400 text-left"><th className="px-4 py-2 font-medium">Started</th><th className="py-2 font-medium">Time</th><th className="py-2 font-medium text-right">Pages</th><th className="py-2 pl-4 font-medium">Pages viewed</th><th className="py-2 font-medium">From</th><th className="py-2 font-medium">Device</th><th className="px-4 py-2 font-medium">Visitor</th></tr></thead>
              <tbody>{data.visit_list.map((v, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700">{v.started}</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-slate-900">{fmtDuration(v.seconds)}</td>
                  <td className="py-2 text-right text-slate-600">{v.pages}</td>
                  <td className="py-2 pl-4 text-slate-600 max-w-[280px] truncate" title={v.paths.join(", ")}>{v.paths.join(", ")}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{v.source}</td>
                  <td className="py-2 text-slate-600 capitalize">{v.device}</td>
                  <td className="px-4 py-2 text-slate-400 font-mono text-xs">{v.visitor}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {searchErr && <p className="text-sm text-red-600">{searchErr}</p>}
      {search?.configured && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Google Search, last {days} days. Search Console data lags by 2 to 3 days.</p>
          <div className="grid grid-cols-2 gap-4">
            <Stat value={search.total_clicks} label={`Clicks from Google, ${days} days`} cls="bg-green-50 border-green-100 text-green-700" />
            <Stat value={search.total_impressions} label={`Times shown in Google, ${days} days`} cls="bg-blue-50 border-blue-100 text-blue-700" />
          </div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4" style={{ fontFamily: "Manrope" }}><Search size={17} className="text-blue-600" />Google clicks per day</h3>
            <div className="flex items-end gap-px h-32">
              {search.daily.map(d => {
                const mx = Math.max(1, ...search.daily.map(x => x.clicks));
                return <div key={d.date} className="flex-1 h-full flex items-end" title={`${d.date}: ${d.clicks} clicks, shown ${d.impressions}`}><div className="w-full bg-green-500 hover:bg-green-700 rounded-t-sm" style={{ height: `${(d.clicks / mx) * 100}%`, minHeight: d.clicks ? 2 : 0 }} /></div>;
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1"><span>{search.daily[0]?.date}</span><span>{search.daily[search.daily.length - 1]?.date}</span></div>
            <table className="w-full text-sm mt-4"><thead><tr className="text-xs text-slate-400 text-left"><th className="py-2 font-medium">Month</th><th className="py-2 font-medium text-right">Clicks</th><th className="py-2 font-medium text-right">Shown</th></tr></thead>
              <tbody>{search.months.map(m => <tr key={m.month} className="border-t border-slate-100"><td className="py-2 text-slate-700">{m.month}</td><td className="py-2 text-right font-semibold text-slate-900">{m.clicks}</td><td className="py-2 text-right text-slate-600">{m.impressions}</td></tr>)}</tbody></table>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <SearchTable title="What people searched on Google" icon={Search} rows={search.queries} empty="No search data yet" />
            <SearchTable title="Pages Google sends people to" icon={FileText} rows={search.pages} empty="No search data yet" />
            <SearchTable title="Countries (Google Search)" icon={Globe} rows={search.countries.map(c => ({ ...c, name: countryName(c.name) }))} empty="No search data yet" />
          </div>
        </div>
      )}
    </div>
  );
}
