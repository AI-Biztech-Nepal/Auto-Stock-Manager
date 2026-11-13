import { useState } from "react";
import { toast } from "sonner";
import api from "../utils/api";

// Real timings (backend/perf_stats.py): per screen, how long staff devices waited (the trip over the internet and the
// download included) next to how long the app itself took and how many database questions it asked. The gap between the
// two is the network. Kept in the server's memory, so it starts over whenever the app restarts.
const fmt = (ms) => (ms == null ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const tone = (ms) => (ms == null ? "text-slate-400" : ms >= 1500 ? "text-red-600 font-semibold" : ms >= 700 ? "text-amber-600 font-medium" : "text-slate-700");

export default function SpeedReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData((await api.get("/admin/performance")).data); }
    catch { toast.error("Could not load the speed report"); }
    finally { setLoading(false); }
  };

  const rows = data ? (all ? data.routes : data.routes.slice(0, 15)) : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" data-testid="speed-report-card">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Speed Report</h2>
        <button type="button" onClick={load} disabled={loading} data-testid="speed-report-btn"
          className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60 shrink-0">
          {loading ? "Loading..." : data ? "Refresh" : "Show"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        How long each screen really takes: what staff devices waited for (including the internet trip) next to what the app itself took.
        Numbers are kept since the app last restarted{data ? ` (${data.minutes_running} min ago)` : ""}.
      </p>

      {data && (
        <>
          {data.boot && (
            <div className="rounded-lg bg-slate-50 p-3 mb-4 text-sm text-slate-700" data-testid="speed-report-boot">
              <span className="font-semibold">Opening the app</span> ({data.boot.opens} opens): first byte {fmt(data.boot.first_byte_p50)},
              ready {fmt(data.boot.ready_p50)}, fully loaded {fmt(data.boot.loaded_p50)}
              {data.boot.script_kb_downloaded_p50 != null ? `, ${data.boot.script_kb_downloaded_p50} KB of scripts downloaded on a fresh open` : ""}
              {data.boot.opened_from_cache ? `; ${data.boot.opened_from_cache} opened from the browser's saved copy` : ""}.
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing recorded yet. Use the app for a bit, then press Refresh.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-3">Screen</th>
                    <th className="py-2 pr-3 text-right">Calls</th>
                    <th className="py-2 pr-3 text-right">Staff waited (typical)</th>
                    <th className="py-2 pr-3 text-right">Worst 5%</th>
                    <th className="py-2 pr-3 text-right">App took</th>
                    <th className="py-2 pr-3 text-right">DB questions</th>
                    <th className="py-2 text-right">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.route} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs text-slate-700 break-all">{r.route.replace(" /api", " ")}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-500">{r.staff?.calls ?? r.server?.calls ?? 0}</td>
                      <td className={`py-1.5 pr-3 text-right ${tone(r.staff?.p50)}`}>{fmt(r.staff?.p50)}</td>
                      <td className={`py-1.5 pr-3 text-right ${tone(r.staff?.p95)}`}>{fmt(r.staff?.p95)}</td>
                      <td className={`py-1.5 pr-3 text-right ${tone(r.server?.p50)}`}>{fmt(r.server?.p50)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-500">{r.server ? `${r.server.queries} (${fmt(r.server.db_p50)})` : "–"}</td>
                      <td className="py-1.5 text-right text-slate-500">{r.staff?.kb != null ? `${r.staff.kb} KB` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.routes.length > 15 && (
                <button type="button" onClick={() => setAll(a => !a)} className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800">
                  {all ? "Show fewer" : `Show all ${data.routes.length} screens`}
                </button>
              )}
            </div>
          )}

          {data.slow.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Slowest recent requests (app side, over 1.5 s)</p>
              <div className="space-y-1">
                {data.slow.slice(0, 8).map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    <span className="font-mono break-all">{s.route.replace(" /api", " ")}</span>
                    <span className="shrink-0">{fmt(s.ms)} · {s.queries} questions · {new Date(s.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
