import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import api from "../../utils/api";
import { useBooks } from "./BooksContext";
import { Card, Notice, ExportBar, exportXlsx, inputCls } from "./ui";
import { todayStr, COLORS } from "./money";
import { formatBSDate } from "../../utils/nepali-date";
import { AS_ON, COMPARE, asOnDay, compareDay, monthEnds, sheetAt, changePct } from "./sheetMath";

// 2316130 -> "23,16,130" (South Asian grouping), with paise when there are some; a minus sign for a negative.
const inr = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [s, paise] = Math.abs(v).toFixed(2).split(".");
  const dec = paise === "00" ? "" : `.${paise}`;
  const grouped = s.length <= 3 ? s : `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${s.slice(-3)}`;
  return `${v < 0 ? "-" : ""}${grouped}${dec}`;
};
const lakh = (n) => {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)}k`;
  return `${sign}${Math.round(a)}`;
};

function Pick({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3.5 pr-1.5 py-1">
      <span className="text-xs text-slate-500 whitespace-nowrap">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} !border-0 !h-8 !w-auto font-semibold text-slate-900 focus:!ring-0`}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

// One line of the sheet: its figure now, the figure on the comparison day, and the change.
function SheetLine({ label, now, then, sub, onOpen, compare, strong }) {
  const pct = compare ? changePct(now, then) : null;
  return (
    <tr className={`border-t border-slate-100 ${onOpen ? "cursor-pointer hover:bg-slate-50" : ""} ${strong ? "bg-slate-50 font-bold" : ""}`} onClick={onOpen}>
      <td className="px-4 py-2.5 text-slate-900">{onOpen ? "▸ " : ""}{label}{sub ? <span className="text-slate-400 font-normal">  ·  {sub}</span> : null}</td>
      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: now < 0 ? COLORS.out : undefined }}>{inr(now)}</td>
      {compare && <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{inr(then)}</td>}
      {compare && <td className="px-3 py-2.5 text-right text-xs tabular-nums" style={{ color: pct == null ? "#94A3B8" : pct < 0 ? COLORS.out : COLORS.in }}>{pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}</td>}
    </tr>
  );
}

const Head = ({ children, span }) => <tr><td colSpan={span} className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{children}</td></tr>;

// The Finance page of FINANCE-NEPAL: the company's balance sheet as on a day, against another day, with the
// last six month ends charted. Equity is the balancing figure, so the sheet always balances.
export default function BalanceSheet({ goTab }) {
  const { books } = useBooks();
  const today = todayStr();
  const [asOnKey, setAsOnKey] = useState("today");
  const [compareKey, setCompareKey] = useState("fy_start");
  const [stock, setStock] = useState(null);   // the vehicles in stock at cost, from the app's own finance summary

  useEffect(() => {
    let live = true;
    api.get("/finance/summary").then((r) => live && setStock(Number(r.data?.inventory_value) || 0)).catch(() => live && setStock(0));
    return () => { live = false; };
  }, []);

  const asOn = asOnDay(asOnKey, today);
  const thenDay = compareDay(compareKey, asOn);
  const compare = thenDay != null;
  const now = useMemo(() => sheetAt(books, asOn, stock || 0), [books, asOn, stock]);
  const then = useMemo(() => (thenDay ? sheetAt(books, thenDay, stock || 0) : now), [books, thenDay, stock, now]);
  const trend = useMemo(() => monthEnds(today).map(({ label, day }) => { const s = sheetAt(books, day, stock || 0); return { label, assets: s.assets, liabilities: s.liabilities }; }), [books, today, stock]);
  const cols = compare ? 4 : 2;

  const rows = [
    ["Assets", "Cash", now.cash, then.cash],
    ...now.banks.map((b, i) => ["Assets", b.name, b.balance, then.banks[i]?.balance ?? 0]),
    ["Assets", "Debtors", now.debtorsTotal, then.debtorsTotal, `${now.debtors.length} owe you`],
    ["Assets", "Advances to vendors", now.vendorAdvancesTotal, then.vendorAdvancesTotal],
    ["Assets", "Stock (vehicles at cost)", now.stock, then.stock],
    ["Assets", "Total assets", now.assets, then.assets],
    ["Liabilities", "Creditors", now.creditorsTotal, then.creditorsTotal, `you owe ${now.creditors.length}`],
    ["Liabilities", "Customer advances", now.customerAdvancesTotal, then.customerAdvancesTotal],
    ["Liabilities", "Total liabilities", now.liabilities, then.liabilities],
    ["Equity", "Owner's equity", now.equity, then.equity],
  ];
  const xlsxCols = [{ header: "Section", value: (r) => r[0] }, { header: "Particulars", value: (r) => r[1] }, { header: `As on ${asOn}`, value: (r) => r[2] }, ...(compare ? [{ header: `As on ${thenDay}`, value: (r) => r[3] }] : [])];

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Pick label="As on" value={asOnKey} onChange={setAsOnKey} options={AS_ON} />
          <Pick label="Compare with" value={compareKey} onChange={setCompareKey} options={COMPARE} />
        </div>
        <ExportBar onXlsx={() => exportXlsx(`balance-sheet-${asOn}`, xlsxCols, rows)} />
      </div>
      <p className="text-xs text-slate-500">As on {asOn} · {formatBSDate(asOn)} BS{compare ? ` · compared with ${thenDay} (${formatBSDate(thenDay)} BS)` : ""}</p>
      {stock === null && <Notice tone="blue">Reading your vehicle stock…</Notice>}

      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total assets</div><div className="text-xl font-bold mt-1" style={{ fontFamily: "Manrope" }}>NPR {inr(now.assets)}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total liabilities</div><div className="text-xl font-bold mt-1" style={{ fontFamily: "Manrope" }}>NPR {inr(now.liabilities)}</div>{now.ratio != null && <div className="text-xs text-slate-400 mt-0.5">Assets are {now.ratio.toFixed(2)}× liabilities</div>}</Card>
        <Card className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner's equity</div><div className="text-xl font-bold mt-1" style={{ fontFamily: "Manrope", color: now.equity < 0 ? COLORS.out : COLORS.balance }}>NPR {inr(now.equity)}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 text-left bg-slate-50">
              <th className="px-4 py-2.5 font-semibold">Particulars</th>
              <th className="px-3 py-2.5 font-semibold text-right">{asOn}</th>
              {compare && <th className="px-3 py-2.5 font-semibold text-right">{thenDay}</th>}
              {compare && <th className="px-3 py-2.5 font-semibold text-right">Change</th>}
            </tr>
          </thead>
          <tbody>
            <Head span={cols}>Assets</Head>
            <SheetLine label="Cash" now={now.cash} then={then.cash} compare={compare} />
            {now.banks.map((b, i) => <SheetLine key={b.id} label={b.name} sub="bank" now={b.balance} then={then.banks[i]?.balance ?? 0} compare={compare} />)}
            <SheetLine label="Debtors" sub={`${now.debtors.length} ${now.debtors.length === 1 ? "customer owes" : "customers owe"} you`} now={now.debtorsTotal} then={then.debtorsTotal} compare={compare} onOpen={() => goTab("receivable-report")} />
            {now.vendorAdvancesTotal > 0 || then.vendorAdvancesTotal > 0 ? <SheetLine label="Advances to vendors" now={now.vendorAdvancesTotal} then={then.vendorAdvancesTotal} compare={compare} onOpen={() => goTab("payable-report")} /> : null}
            <SheetLine label="Stock" sub="vehicles in stock, at cost" now={now.stock} then={then.stock} compare={compare} />
            <SheetLine label="Total assets" now={now.assets} then={then.assets} compare={compare} strong />
            <Head span={cols}>Liabilities</Head>
            <SheetLine label="Creditors" sub={`you owe ${now.creditors.length} ${now.creditors.length === 1 ? "vendor" : "vendors"}`} now={now.creditorsTotal} then={then.creditorsTotal} compare={compare} onOpen={() => goTab("payable-report")} />
            {now.customerAdvancesTotal > 0 || then.customerAdvancesTotal > 0 ? <SheetLine label="Customer advances" sub="paid more than billed" now={now.customerAdvancesTotal} then={then.customerAdvancesTotal} compare={compare} onOpen={() => goTab("ledger")} /> : null}
            <SheetLine label="Total liabilities" now={now.liabilities} then={then.liabilities} compare={compare} strong />
            <Head span={cols}>Equity</Head>
            <SheetLine label="Owner's equity" sub="assets less liabilities" now={now.equity} then={then.equity} compare={compare} strong />
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-200 text-sm flex flex-wrap justify-between gap-2 bg-slate-50">
          <span className="text-slate-600">Liabilities {inr(now.liabilities)} + Equity {inr(now.equity)}</span>
          <span className="font-bold" style={{ color: COLORS.in }}>= Assets {inr(now.assets)} ✓ balanced</span>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-base font-bold text-slate-900 mb-3">Assets against liabilities, month end by month end</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={lakh} />
              <Tooltip formatter={(v) => `NPR ${inr(v)}`} />
              <Legend />
              <Line type="monotone" dataKey="assets" name="Assets" stroke="#1D4ED8" strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="#93C5FD" strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-slate-400">
        Cash and bank are the available balance up to the day; debtors and creditors come from the two party ledgers up to the day; stock is your vehicles in stock at cost
        (it has no history, so every column uses today's stock). Equity is the balancing figure. Tap a ▸ line for the list behind it.
      </p>
    </div>
  );
}
