import { useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { notify } from "../../utils/notify";
import api from "../../utils/api";
import { Modal, btnPrimary, btnGhost } from "./ui";

// Add many customers from a .csv or .xlsx. The file is checked first, row by row, and nothing is added until
// the result looks right and it is confirmed. A phone that already belongs to a customer is skipped, never doubled.
const TEMPLATE = [
  ["Name", "Phone", "Address", "Interested Vehicle", "Lead Source", "Referred By", "Lead Status", "Assigned To", "Notes", "Next Follow-up"],
  ["Ram Sharma", "9841234567", "Jorpati", "Honda Dio 2020", "Walk-in", "", "New", "", "Wants a red one", new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)],
];
const ROW_TONE = {
  ok: { Icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700", label: "Will add" },
  duplicate: { Icon: Copy, cls: "bg-slate-100 text-slate-600", label: "Skipped" },
  error: { Icon: AlertCircle, cls: "bg-red-50 text-red-700", label: "Problem" },
};

const downloadTemplate = () => {
  const csv = "﻿" + TEMPLATE.map(r => r.map(v => `"${v}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "crm-customers-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};

export default function ImportModal({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (f, confirm) => {
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true); setError("");
    try {
      const { data } = await api.post(`/crm/import?confirm=${confirm}`, fd, { suppressErrorToast: true });
      setResult(data);
      if (confirm) { notify.success(data.message); onImported(); }
    } catch (ex) {
      setResult(null);
      setError(typeof ex.response?.data?.detail === "string" ? ex.response.data.detail : "Couldn't read that file. Please try again.");
    } finally { setBusy(false); }
  };

  const pick = (f) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) { setError("Use a .csv or .xlsx file."); return; }
    setFile(f); setResult(null);
    send(f, false);
  };

  const committed = result?.committed;
  return (
    <Modal title="Import customers" subtitle="From a CSV or Excel file" size="xl" onClose={onClose} testid="import-modal"
      footer={<>
        <button type="button" onClick={downloadTemplate} className={`${btnGhost} mr-auto`} data-testid="import-template"><Download size={15} /> Template</button>
        <button type="button" onClick={onClose} className={btnGhost}>{committed ? "Close" : "Cancel"}</button>
        {!committed && <button type="button" disabled={busy || !result || result.ok === 0} onClick={() => send(file, true)} className={btnPrimary} data-testid="import-confirm">
          {busy && result ? "Importing..." : `Import ${result ? result.ok : ""} customer${result?.ok === 1 ? "" : "s"}`}</button>}
      </>}>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
        className="rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/60 px-4 py-6 text-center">
        <UploadCloud className="mx-auto text-slate-400" size={28} />
        <p className="mt-2 text-sm text-slate-700"><button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-blue-600 hover:underline" data-testid="import-choose">Choose a file</button> or drop it here</p>
        <p className="mt-0.5 text-xs text-slate-400">.csv or .xlsx · needs a Name and a Phone column · dates in English (AD) like 2026-11-15 · up to 2,000 rows</p>
        <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} data-testid="import-file" />
        {file && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><FileSpreadsheet size={14} /> {file.name}</p>}
      </div>

      {busy && !result && <p className="mt-4 text-sm text-slate-500 text-center" role="status">Checking the file...</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2" role="alert" data-testid="import-error">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3" data-testid="import-result">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold" data-testid="import-ok">{result.ok} {committed ? "added" : "ready to add"}</span>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold" data-testid="import-dup">{result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped</span>
            <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-semibold" data-testid="import-err">{result.errors} with problems</span>
          </div>
          <p className="text-sm text-slate-600">{result.message}</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr><th className="px-3 py-2 text-left font-semibold w-12">Row</th><th className="px-3 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">Phone</th><th className="px-3 py-2 text-left font-semibold">Result</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map(r => {
                    const t = ROW_TONE[r.status];
                    return (
                      <tr key={r.row} data-testid="import-row">
                        <td className="px-3 py-2 text-slate-400 tabular-nums">{r.row}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600 tabular-nums">{r.phone || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${t.cls}`}><t.Icon size={12} />{t.label}</span>
                          {r.reason && <span className="ml-2 text-slate-500">{r.reason}</span>}
                          {r.warnings?.map((w, i) => <span key={i} className="block text-amber-600 mt-0.5">{w}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
