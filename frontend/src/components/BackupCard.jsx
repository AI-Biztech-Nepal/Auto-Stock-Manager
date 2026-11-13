import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import api from "../utils/api";

// Automatic backups (backend/auto_backup.py): the app backs up the Supabase data by itself every night. This card shows
// whether that is working, and has a "Back up now" button. Hidden for anyone who may not manage backups.
const ago = (hours) => {
  if (hours == null) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes ago`;
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "–");

export default function BackupCard() {
  const [s, setS] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try { setS((await api.get("/admin/backups")).data); }
    catch (e) { if (e.response?.status === 403) setHidden(true); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // while a backup is running, look again every few seconds
  useEffect(() => {
    clearTimeout(timer.current);
    if (s?.running) timer.current = setTimeout(load, 4000);
    return () => clearTimeout(timer.current);
  }, [s, load]);

  const backUpNow = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/backups/run");
      toast[r.data.started ? "success" : "info"](r.data.started ? "Backup started" : "A backup is already running");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not start a backup");
    } finally { setBusy(false); }
  };

  if (hidden || !s) return null;
  const good = s.last_ok && !s.problem;
  const Icon = s.problem ? ShieldAlert : ShieldCheck;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" data-testid="backup-card">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope" }}>
          <Icon size={18} className={s.problem ? "text-red-600" : good ? "text-emerald-600" : "text-slate-400"} />
          Automatic Backups
        </h2>
        <button type="button" onClick={backUpNow} disabled={busy || s.running || !s.available} data-testid="backup-now-btn"
          className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60 shrink-0">
          {s.running ? "Backing up..." : "Back up now"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {s.enabled ? `The app backs up all your data by itself ${s.schedule}, and keeps the last 14 days plus one a week for 8 weeks.` : "Automatic backups are switched off on this server."}
      </p>

      {s.problem && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4 text-sm text-red-800" data-testid="backup-problem">
          {s.last_ok ? `No backup has worked for ${ago(s.last_ok_hours_ago).replace(" ago", "")}.` : "No backup has worked yet."}
          {s.error ? ` Last problem: ${s.error}` : ""} Press “Back up now” to try again; if it keeps failing, tell whoever looks after the server.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Last good backup</p>
          <p className="text-sm font-bold text-slate-900">{ago(s.last_ok_hours_ago)}</p>
          <p className="text-xs text-slate-400">{when(s.last_ok)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Copies kept</p>
          <p className="text-sm font-bold text-slate-900">{s.copies}</p>
          <p className="text-xs text-slate-400">{s.latest ? `newest: ${s.latest.tables} tables, ${s.latest.rows.toLocaleString()} rows, ${s.latest.mb} MB` : "none yet"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Next automatic backup</p>
          <p className="text-sm font-bold text-slate-900">{s.running ? "running now" : s.next_run ? when(s.next_run) : "–"}</p>
          <p className="text-xs text-slate-400">{s.disk_free_gb != null ? `${s.disk_free_gb} GB free on the server` : ""}</p>
        </div>
      </div>

      {(s.notes || []).map((n, i) => <p key={i} className="text-xs text-amber-700 mb-1">{n}</p>)}
      {s.last_ok && s.storage_files != null && (
        <p className="text-xs text-slate-500">
          Photos and documents ({s.storage_files} files) {s.with_files ? "are copied too, new ones each night." : "were not copied on the last run."}
        </p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Saved on the server in <span className="font-mono">{s.dir}</span>. It holds customers' details and password hashes, so keep it private.
        For extra safety, copy that folder somewhere else now and then.
      </p>
    </div>
  );
}
