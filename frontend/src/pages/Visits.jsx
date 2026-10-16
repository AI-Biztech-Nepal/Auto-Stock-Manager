import { useEffect, useState, useCallback } from "react";
import { Eye, Users, Smartphone, Monitor, Globe, FileText, ExternalLink } from "lucide-react";
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
        <ul className="p-4 space-y-2.5">
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

// Storefront traffic: page views and unique visitors reported by the site's visit beacon.
export default function Visits() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  const maxViews = Math.max(1, ...data.daily.map(d => d.views));
  const devTotal = data.devices.mobile + data.devices.desktop;
  const pct = n => (devTotal ? Math.round((n / devTotal) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={data.storefront_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">{data.storefront_url.replace(/^https?:\/\//, "")} <ExternalLink size={12} /></a>
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
    </div>
  );
}
