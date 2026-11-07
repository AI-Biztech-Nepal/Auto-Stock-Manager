import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import api from "../../utils/api";
import { useBooks } from "./BooksContext";
import { Card, Notice, Empty, inputCls, btnPrimary, btnGhost } from "./ui";
import { npr, COLORS } from "./money";

const KINDS = [["expense", "Expense"], ["out", "Payment out"], ["in", "Payment in"], ["withdraw", "Withdraw"], ["deposit", "Deposit"]];

// Classify a statement line from its description and direction. Adapt the patterns to whatever your
// banks export; the STRUCTURE (parse, dedupe by reference, classify, review, commit with a marker)
// is the part to keep.
export function classify(description, isDebit) {
  const d = (description || "").trim();
  const m = (re) => d.match(re)?.[1]?.trim();
  if (isDebit) {
    if (m(/^Fund Transferred to\s+(.+)/i)) return { kind: "out", party: m(/^Fund Transferred to\s+(.+)/i) };
    if (/^Money transferred to/i.test(d)) return { kind: "withdraw" };
    const topup = m(/^(.+?)\s+topup to\b/i) || m(/^Paid for\s+(.+)/i);
    if (topup) return { kind: "expense", party: topup };
    if (/charge|fee|commission/i.test(d)) return { kind: "withdraw" };
    return { kind: "expense", party: d };
  }
  if (m(/^Fund Transferred by\s+(.+)/i)) return { kind: "in", party: m(/^Fund Transferred by\s+(.+)/i) };
  if (/^Money transferred from/i.test(d) || /^Loan Disbursement from/i.test(d) || /cashback|charge|fee/i.test(d)) return { kind: "deposit" };
  return { kind: "in", party: d };
}

const toNumber = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

function toDate(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` : ""; }
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

// Find the header row (the first column reads "Reference Code") and read each line.
function parseStatement(buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const at = grid.findIndex((r) => /reference/i.test(String(r[0] || "")));
  if (at < 0) throw new Error("Could not find the header row. The first column should be “Reference Code”.");
  const head = grid[at].map((h) => String(h).toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const ix = { ref: 0, date: col(/date|time/), desc: col(/descr|narration|particular/), debit: col(/debit|withdraw/), credit: col(/credit|deposit/), status: col(/status/) };
  const rows = [];
  for (const r of grid.slice(at + 1)) {
    const reference = String(r[ix.ref] ?? "").trim();
    if (!reference) continue;
    const status = ix.status >= 0 ? String(r[ix.status] || "").trim().toUpperCase() : "COMPLETE";
    rows.push({ reference, date: toDate(r[ix.date]), description: String(r[ix.desc] ?? "").trim(), debit: toNumber(r[ix.debit]), credit: toNumber(r[ix.credit]), status });
  }
  return rows;
}

export default function ImportStatement() {
  const { books, reload } = useBooks();
  const fileRef = useRef(null);
  const [account, setAccount] = useState(books.accounts[0]?.id || "");
  const [rows, setRows] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseStatement(await file.arrayBuffer());
      // Pending and failed lines were never real money; lines already imported are skipped.
      const complete = parsed.filter((r) => r.status === "COMPLETE" && (r.debit > 0 || r.credit > 0));
      const { data } = await api.post("/fin/statement/check", { references: complete.map((r) => r.reference) });
      const known = new Set(data.known);
      const fresh = complete.filter((r) => !known.has(r.reference));
      setRows(fresh.map((r) => {
        const isDebit = r.debit > 0;
        const c = classify(r.description, isDebit);
        return { ...r, amount: isDebit ? r.debit : r.credit, isDebit, kind: c.kind, party: c.party || "", category: "", checked: true };
      }));
      setInfo({ total: parsed.length, notComplete: parsed.length - complete.length, already: known.size });
    } catch (e) {
      toast.error(e.message || e.response?.data?.detail || "Could not read that file");
      setRows(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setRow = (ref, patch) => setRows((rs) => rs.map((r) => (r.reference === ref ? { ...r, ...patch } : r)));
  const picked = useMemo(() => (rows || []).filter((r) => r.checked), [rows]);

  const commit = async () => {
    for (const r of picked) {
      if ((r.kind === "in" || r.kind === "out") && !r.party.trim()) return toast.error(`Line ${r.reference} needs a party name`);
    }
    setBusy(true);
    try {
      const { data } = await api.post("/fin/statement/commit", {
        bank_account_id: account || null,
        rows: picked.map((r) => ({ reference: r.reference, kind: r.kind, amount: r.amount, entry_date: r.date, party: r.party || null, category: r.category || null, note: r.description })),
      });
      toast.success(`${data.imported} imported${data.skipped ? `, ${data.skipped} already there` : ""}`);
      setRows(null); setInfo(null);
      await reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed. Nothing is lost: run it again and finished lines are skipped.");
      await reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div><h3 className="text-base font-bold text-slate-900">Import a bank statement</h3><p className="text-xs text-slate-500">Choose an .xls or .xlsx export. Nothing is saved until you review the lines and press Import. Importing the same statement twice, or two that overlap, never double-counts: each line is remembered by its reference code.</p></div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="block"><span className="block text-xs font-semibold text-slate-600 mb-1">This statement belongs to</span>
            <select value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls}>
              <option value="">Cash in hand</option>
              {books.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className={btnPrimary}><Upload size={16} /> Choose file</button>
          </div>
        </div>
        {books.accounts.length === 0 && <Notice>Add your bank under Bank Accounts first, so the imported lines go to the right account.</Notice>}
      </Card>

      {info && (
        <Notice tone="blue">
          Read {info.total} lines. {info.notComplete > 0 && `${info.notComplete} skipped (not completed). `}{info.already > 0 && `${info.already} already imported. `}{rows?.length || 0} new to review.
        </Notice>
      )}

      {rows && (
        <Card>
          {rows.length === 0 ? <Empty>Nothing new in this file.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-xs text-slate-500 text-left"><th className="px-3 py-2" /><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Description</th><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Party / payee</th><th className="px-3 py-2 font-semibold">Category</th><th className="px-3 py-2 font-semibold text-right">Amount</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.reference} className={`border-t border-slate-100 align-top ${r.checked ? "" : "opacity-40"}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={r.checked} onChange={(e) => setRow(r.reference, { checked: e.target.checked })} /></td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.date}</td>
                    <td className="px-3 py-2 max-w-[260px] text-slate-700"><div className="truncate" title={r.description}>{r.description}</div><div className="text-xs text-slate-400">{r.reference}</div></td>
                    <td className="px-3 py-2"><select value={r.kind} onChange={(e) => setRow(r.reference, { kind: e.target.value })} className={`${inputCls} h-9 w-36`}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                    <td className="px-3 py-2"><input value={r.party} onChange={(e) => setRow(r.reference, { party: e.target.value })} disabled={r.kind === "withdraw" || r.kind === "deposit"} className={`${inputCls} h-9 w-44`} /></td>
                    <td className="px-3 py-2">
                      {r.kind === "expense" ? <input list="fin-statement-cats" value={r.category} onChange={(e) => setRow(r.reference, { category: e.target.value })} className={`${inputCls} h-9 w-36`} placeholder="Category" /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: r.isDebit ? COLORS.out : COLORS.in }}>{r.isDebit ? "−" : "+"}{npr(r.amount).replace("NPR ", "")}</td>
                  </tr>
                ))}</tbody>
              </table>
              <datalist id="fin-statement-cats">{books.categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
          )}
          {rows.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-600">{picked.length} of {rows.length} selected. Withdraw and Deposit are your own money moving, so they are only marked as imported.</span>
              <div className="flex gap-2"><button onClick={() => { setRows(null); setInfo(null); }} className={btnGhost}>Cancel</button><button onClick={commit} disabled={busy || picked.length === 0} className={btnPrimary}>{busy ? "Importing…" : `Import ${picked.length}`}</button></div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
