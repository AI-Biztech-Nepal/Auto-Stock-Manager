import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Download, Printer, CheckCircle2, AlertCircle } from "lucide-react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useBooks } from "./BooksContext";
import { balances, entryDate, todayStr, addDays } from "./money";
import { adToBsDate, bsToAdDate, BS_MONTHS, formatBSDateNumeric } from "../../utils/nepali-date";

// The Finance tab's landing page, as Jageer Nepal's: the company's Balance Sheet - what the business owns (cash
// and bank, what customers owe, stock) against what it owes (vendors, customer advances) and the owner's equity
// that balances the two, as on a chosen day and compared with an earlier one. Everything is read from the books;
// nothing is typed here. Stock is the vehicles in Inventory not yet sold, at purchase cost (it has no history, so
// earlier dates use today's stock). Equity is the balancing figure, so the sheet always balances.

const INK = "#0F172A", MUTED = "#64748B", LINE = "#E2E8F0", BRAND_DARK = "#1E3A8A", BRAND = "#2563EB", BRAND_TINT = "#EFF6FF";

// 2316130 -> "23,16,130" (the South Asian grouping)
const inr = (n) => Math.round(n).toLocaleString("en-IN");
const lakh = (n) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}k`;
  return `${s}${Math.round(a)}`;
};
const pct = (now, before) => (Math.abs(before) < 1 ? null : ((now - before) / Math.abs(before)) * 100);

// BS months, 1-based here. The first day of the month `back` months before the one holding `day`.
function monthStart(day, back) {
  const bs = adToBsDate(day);
  if (!bs) return day.slice(0, 8) + "01";
  let y = bs.year, m = bs.month - back;
  while (m < 1) { m += 12; y -= 1; }
  return bsToAdDate(y, m, 1) || day;
}
// The Nepali fiscal year starts on Shrawan 1.
function fiscalStart(day) {
  const bs = adToBsDate(day);
  if (!bs) return `${day.slice(0, 4)}-07-16`;
  return bsToAdDate(bs.month >= 4 ? bs.year : bs.year - 1, 4, 1) || day;
}
const monthLabel = (day) => { const bs = adToBsDate(day); return bs ? BS_MONTHS[bs.month - 1].slice(0, 3) : day.slice(5, 7); };

const AS_ON = [["today", "Today"], ["last_month", "End of last month"], ["last_fy", "End of last fiscal year"]];
const COMPARE = [["fy_start", "Start of fiscal year"], ["month_start", "Start of this month"], ["year_ago", "Same day last year"], ["none", "No comparison"]];
// A ledger typed Director, Owner, Partner, Proprietor, Shareholder, Investor or Capital holds what that person has
// put into the business: the owner's capital (equity), not money owed to or by a customer or vendor.
const CAPITAL_TYPE = /\b(directors?|owners?|partners?|proprietors?|shareholders?|investors?|capital)\b/i;

function Select({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-[13px] font-semibold text-gray-900">{options.find(([k]) => k === value)?.[1]}</span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-[260px] rounded-2xl bg-white py-2 shadow-lg border border-gray-100">
          <div className="px-4 pb-2 pt-1 text-xs font-bold uppercase text-gray-500">{label}</div>
          {options.map(([k, l]) => (
            <button key={k} onClick={() => { onChange(k); setOpen(false); }} className={`w-full flex items-center px-4 py-3 text-left text-sm ${k === value ? "bg-blue-50 text-blue-700 font-bold" : "text-slate-900 font-medium hover:bg-gray-50"}`}>
              <span className="flex-1">{l}</span>{k === value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetRow({ r }) {
  const Tag = r.onClick ? "button" : "div";
  return (
    <Tag onClick={r.onClick} className={`w-full flex items-center gap-2 border-b border-gray-100 py-2.5 text-left ${r.onClick ? "hover:bg-gray-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900">{r.onClick ? "▸ " : ""}{r.label}{r.sub && <span className="text-gray-400">  ·  {r.sub}</span>}</div>
        {r.note && <div className="mt-0.5 text-[11.5px]" style={{ color: BRAND_DARK }}>{r.note}</div>}
      </div>
      <div className="text-sm font-bold tabular-nums" style={{ color: r.amount < 0 ? BRAND_DARK : INK }}>{inr(r.amount)}</div>
    </Tag>
  );
}

function Group({ title, rows, subtotalLabel, subtotal }) {
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase text-gray-500 tracking-[0.05em]">{title}</div>
      {rows.length === 0 ? <div className="py-3 text-[13px] text-gray-400">Nothing recorded</div> : rows.map((r, i) => <SheetRow key={`${r.label}${i}`} r={r} />)}
      <div className="flex items-center gap-2 pt-2">
        <span className="flex-1 text-[12.5px] font-semibold text-gray-600">{subtotalLabel}</span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: subtotal < 0 ? BRAND_DARK : "#1F2937" }}>{inr(subtotal)}</span>
      </div>
    </div>
  );
}

function TrendChart({ labels, assets, liabilities }) {
  const W = 720, H = 230, left = 50, right = 16, top = 18, bottom = 30;
  const hi = Math.max(...assets, ...liabilities, 1), lo = Math.min(...assets, ...liabilities, 0), span = hi - lo || 1;
  const n = Math.max(labels.length - 1, 1);
  const x = (i) => left + (i / n) * (W - left - right);
  const y = (v) => top + (1 - (v - lo) / span) * (H - top - bottom);
  const path = (vs) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const gap = assets[assets.length - 1] - liabilities[liabilities.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
      <defs>
        <linearGradient id="bsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1D4ED8" stopOpacity="0.18" /><stop offset="1" stopColor="#1D4ED8" stopOpacity="0.01" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map((t) => {
        const gy = top + (t / 3) * (H - top - bottom);
        return <g key={t}><line x1={left} x2={W - right} y1={gy} y2={gy} stroke={LINE} strokeDasharray="4 5" /><text x={left - 8} y={gy + 4} fontSize="11" fill={MUTED} textAnchor="end">{lakh(hi - (t / 3) * span)}</text></g>;
      })}
      <path d={`${path(assets)} L${x(assets.length - 1)},${H - bottom} L${x(0)},${H - bottom} Z`} fill="url(#bsFill)" />
      <path d={path(liabilities)} fill="none" stroke="#93C5FD" strokeWidth="3" strokeLinejoin="round" />
      <path d={path(assets)} fill="none" stroke="#1D4ED8" strokeWidth="3" strokeLinejoin="round" />
      {assets.map((v, i) => <circle key={`a${i}`} cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke="#1D4ED8" strokeWidth="2.5" />)}
      {liabilities.map((v, i) => <circle key={`l${i}`} cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke="#93C5FD" strokeWidth="2.5" />)}
      <g transform="translate(-8 0)">
        <rect x={W - right - 178} y={top} width="186" height="50" rx="8" fill="#0F172A" />
        <text x={W - right - 166} y={top + 19} fontSize="11" fill="#CBD5E1">Latest month end</text>
        <text x={W - right - 166} y={top + 38} fontSize="12.5" fontWeight="700" fill="#fff">{`Gap  ${gap < 0 ? "-" : "+"}${lakh(Math.abs(gap))}`}</text>
      </g>
      {labels.map((l, i) => <text key={`${l}${i}`} x={x(i)} y={H - 9} fontSize="11.5" fill={MUTED} textAnchor="middle">{l}</text>)}
    </svg>
  );
}

export default function BalanceSheet({ goTab, openParty }) {
  const { books } = useBooks();
  const { user } = useAuth();
  const [asOnKey, setAsOnKey] = useState("today");
  const [compareKey, setCompareKey] = useState("fy_start");
  const [vehicles, setVehicles] = useState(null);
  useEffect(() => { api.get("/vehicles").then((r) => setVehicles(r.data || [])).catch(() => setVehicles([])); }, []);

  const today = todayStr();
  const asOn = asOnKey === "last_month" ? addDays(monthStart(today, 0), -1) : asOnKey === "last_fy" ? addDays(fiscalStart(today), -1) : today;
  const compareOn = compareKey === "none" ? null : compareKey === "fy_start" ? addDays(fiscalStart(asOn), -1) : compareKey === "month_start" ? addDays(monthStart(asOn, 0), -1) : addDays(asOn, -365);

  // Stock in hand: every vehicle still in Inventory (not sold), at what it was bought for.
  const stock = useMemo(() => (vehicles || []).filter((v) => v.status !== "sold").reduce((s, v) => s + (Number(v.purchase_price) || 0), 0), [vehicles]);
  const stockCount = useMemo(() => (vehicles || []).filter((v) => v.status !== "sold").length, [vehicles]);
  const capitalParties = useMemo(() => {
    const names = new Map((books.party_types || []).map((t) => [t.id, t.name]));
    return new Map(books.parties.filter((p) => p.party_type_id && CAPITAL_TYPE.test(names.get(p.party_type_id) || "")).map((p) => [p.id, p.name]));
  }, [books.parties, books.party_types]);

  // The whole sheet as it stood at the end of `day`.
  const snapshot = useMemo(() => (day) => {
    const bal = balances(books, { upTo: day });
    const cash = bal.cash;
    const banks = books.accounts.map((a) => ({ id: a.id, name: a.name, balance: bal.buckets[a.id]?.total || 0 }));
    const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
    const cust = new Map(), vend = new Map();
    for (const e of books.customer_ledger) if (entryDate(e) <= day) cust.set(e.customer_id, (cust.get(e.customer_id) || 0) + (e.entry_type === "debit" ? e.amount : -e.amount));
    for (const e of books.vendor_ledger) if (entryDate(e) <= day) vend.set(e.vendor_id, (vend.get(e.vendor_id) || 0) + (e.entry_type === "debit" ? e.amount : -e.amount));
    // An owner's two ledgers are their capital (what they put in less what they took out), not debts or advances.
    const capital = [...capitalParties].map(([id, name]) => ({ id, name, amount: Math.round(((vend.get(id) || 0) - (cust.get(id) || 0)) * 100) / 100 }));
    for (const id of capitalParties.keys()) { cust.delete(id); vend.delete(id); }
    const capitalTotal = capital.reduce((s, c) => s + c.amount, 0);
    let debtors = 0, debtorCount = 0, customerAdvances = 0, creditors = 0, creditorCount = 0, vendorAdvances = 0;
    cust.forEach((v) => { if (v > 0.5) { debtors += v; debtorCount += 1; } else if (v < -0.5) customerAdvances += -v; });
    vend.forEach((v) => { if (v > 0.5) { creditors += v; creditorCount += 1; } else if (v < -0.5) vendorAdvances += -v; });
    const assets = cash + bankTotal + debtors + vendorAdvances + stock;
    const liabilities = creditors + customerAdvances;
    return { cash, banks, bankTotal, debtors, debtorCount, vendorAdvances, stock, creditors, creditorCount, customerAdvances, capital, capitalTotal,
      assets, liabilities, equity: assets - liabilities, currentRatio: liabilities > 0 ? assets / liabilities : null };
  }, [books, stock, capitalParties]);

  const now = useMemo(() => snapshot(asOn), [snapshot, asOn]);
  const before = useMemo(() => (compareOn ? snapshot(compareOn) : null), [snapshot, compareOn]);
  // month ends for the trend: the last seven months up to the day shown
  const trend = useMemo(() => {
    const points = [];
    for (let back = 6; back >= 0; back--) {
      const start = monthStart(asOn, back);
      const end = back === 0 ? asOn : addDays(monthStart(asOn, back - 1), -1);
      const s = snapshot(end);
      points.push({ label: monthLabel(start), assets: s.assets, liabilities: s.liabilities });
    }
    return points;
  }, [snapshot, asOn]);
  // receivables older than 60 days: a customer's balance counts when their last bill is that old
  const overdue = useMemo(() => {
    const lastDebit = new Map(), net = new Map();
    for (const e of books.customer_ledger) {
      const d = entryDate(e);
      if (d > asOn) continue;
      net.set(e.customer_id, (net.get(e.customer_id) || 0) + (e.entry_type === "debit" ? e.amount : -e.amount));
      if (e.entry_type === "debit" && d > (lastDebit.get(e.customer_id) || "")) lastDebit.set(e.customer_id, d);
    }
    const limit = addDays(asOn, -60);
    let total = 0;
    net.forEach((v, id) => { if (v > 0.5 && (lastDebit.get(id) || "9999") < limit) total += v; });
    return total;
  }, [books.customer_ledger, asOn]);

  const company = user?.company_name || "Your company";
  const compareLabel = COMPARE.find(([k]) => k === compareKey)?.[1] || "";

  const cashRows = [
    { label: "Cash in hand", amount: now.cash, onClick: () => goTab("banks"), note: now.cash < 0 ? "Negative cash: check entries" : undefined },
    ...now.banks.map((b) => ({ label: b.name, amount: b.balance, onClick: () => goTab("banks"), note: b.balance < 0 ? "Overdrawn: more has gone out than came in" : undefined })),
  ];
  const cashTotal = now.cash + now.bankTotal;
  const receivableRows = [
    { label: "Sundry debtors", sub: `${now.debtorCount} ${now.debtorCount === 1 ? "party" : "parties"}`, amount: now.debtors, onClick: () => goTab("receivable-report") },
    ...(now.vendorAdvances > 0 ? [{ label: "Advances paid to vendors", amount: now.vendorAdvances, onClick: () => goTab("payable-report") }] : []),
    { label: "Stock in hand", sub: `${stockCount} ${stockCount === 1 ? "vehicle" : "vehicles"} at cost`, amount: now.stock },
  ];
  const receivableTotal = now.debtors + now.vendorAdvances + now.stock;
  const liabilityRows = [
    { label: "Sundry creditors", sub: `${now.creditorCount} ${now.creditorCount === 1 ? "vendor" : "vendors"}`, amount: now.creditors, onClick: () => goTab("payable-report") },
    ...(now.customerAdvances > 0 ? [{ label: "Advances received from customers", amount: now.customerAdvances, onClick: () => goTab("receivable-report") }] : []),
  ];
  const equityRows = [
    ...now.capital.map((c) => ({ label: "Capital invested", sub: c.name, amount: c.amount, onClick: () => openParty(c.id) })),
    { label: now.capital.length ? "Retained earnings" : "Owner's capital & retained earnings", sub: "balancing figure", amount: Math.round((now.equity - now.capitalTotal) * 100) / 100,
      note: now.equity < 0 ? "Deficit: liabilities are more than assets" : undefined },
  ];

  // ---- watch list ----
  const alerts = [];
  if (now.equity < 0) alerts.push(["critical", `Liabilities exceed total assets by NPR ${inr(-now.equity)} (negative net worth)`]);
  if (overdue > 0) alerts.push(["warning", `NPR ${inr(overdue)} of receivables is more than 60 days old`]);
  now.banks.filter((b) => b.balance < 0).forEach((b) => alerts.push(["warning", `${b.name} is overdrawn by NPR ${inr(-b.balance)}`]));
  if (now.cash < 0) alerts.push(["warning", `Cash in hand is negative (NPR ${inr(now.cash)})`]);
  if (now.currentRatio != null && now.currentRatio < 1) alerts.push(["warning", `Current ratio is ${now.currentRatio.toFixed(2)}: below 1.0`]);
  if (now.creditors > 0) {
    const cover = (Math.max(0, cashTotal) / now.creditors) * 100;
    alerts.push([cover >= 100 ? "ok" : "warning", `Cash & bank cover ${cover.toFixed(0)}% of what you owe vendors`]);
  }
  if (alerts.every(([t]) => t === "ok")) alerts.unshift(["ok", "No problems found in the balance sheet"]);
  const toneColor = { critical: BRAND_DARK, warning: BRAND, ok: "#93C5FD" };

  const exportCsv = () => {
    const rows = [
      [company, "Balance sheet", `As on ${asOn}`], [],
      ["Side", "Group", "Item", "Amount (NPR)"],
      ...cashRows.map((r) => ["Assets", "Cash & bank", r.label, Math.round(r.amount)]),
      ...receivableRows.map((r) => ["Assets", "Receivables & stock", r.label, Math.round(r.amount)]),
      ["Assets", "", "Total assets", Math.round(now.assets)],
      ...liabilityRows.map((r) => ["Liabilities", "Current liabilities", r.label, Math.round(r.amount)]),
      ...equityRows.map((r) => ["Equity", "Capital", [r.label, r.sub].filter(Boolean).join(" · "), Math.round(r.amount)]),
      ["", "", "Total liabilities & equity", Math.round(now.liabilities + now.equity)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `balance-sheet-${asOn}.csv`;
    a.click();
  };

  const side = (title, groups, totalLabel, total) => (
    <div className="flex-1 min-w-0 py-1">
      <div className="flex justify-between border-b-2 pb-2.5" style={{ borderColor: BRAND_DARK }}>
        <span className="text-sm font-bold text-gray-900">{title}</span><span className="text-xs font-semibold text-gray-500">NPR</span>
      </div>
      {groups}
      <div className="mt-4 flex border-t-2 pt-3" style={{ borderColor: BRAND_DARK }}>
        <span className="flex-1 text-[15px] font-bold text-gray-900">{totalLabel}</span>
        <span className="text-[15px] font-bold text-gray-900 tabular-nums">{inr(total)}</span>
      </div>
    </div>
  );
  const balanced = Math.abs(now.assets - (now.liabilities + now.equity)) < 0.5;
  const card = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]";

  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] text-xs font-semibold text-gray-500">Choose the date and what to compare with</div>
        <Select label="As on" value={asOnKey} options={AS_ON} onChange={setAsOnKey} />
        <Select label="Compare" value={compareKey} options={COMPARE} onChange={setCompareKey} />
        <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-[13px] font-semibold text-slate-900" style={{ borderColor: LINE }}><Download size={15} className="text-blue-700" /> Export CSV</button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-white bg-[#1D4ED8]"><Printer size={15} /> Print / PDF</button>
      </div>

      {vehicles === null && <p className="py-2 text-center text-sm text-gray-400">Reading your books…</p>}

      {/* the heading band */}
      <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: BRAND_DARK }}>
        <div className="p-5 space-y-1">
          <div className="text-[11.5px] font-bold tracking-[0.12em]" style={{ color: "#BFDBFE" }}>{company.toUpperCase()} · FINANCE REPORT</div>
          <div className="text-2xl font-extrabold text-white tracking-wide">BALANCE SHEET</div>
          <div className="text-[13px]" style={{ color: "#DBEAFE" }}>{company}  ·  as on {formatBSDateNumeric(asOn)}</div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
          {[
            ["Total assets", `NPR ${inr(now.assets)}`, before ? pct(now.assets, before.assets) : null],
            ["Total liabilities", `NPR ${inr(now.liabilities)}`, before ? pct(now.liabilities, before.liabilities) : null],
            [now.equity < 0 ? "Owner's equity (deficit)" : "Owner's equity", `NPR ${inr(now.equity)}`, before ? pct(now.equity, before.equity) : null],
            ["Current ratio", now.currentRatio == null ? "–" : now.currentRatio.toFixed(2), null],
          ].map(([label, value, delta], i) => (
            <div key={label} className={`px-5 py-4 ${i ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""}`} style={{ borderColor: "rgba(255,255,255,0.18)" }}>
              <div className="text-[11.5px] font-semibold" style={{ color: "#BFDBFE" }}>{label}</div>
              <div className="mt-0.5 text-[19px] font-bold text-white tabular-nums">{value}</div>
              {delta != null && <div className="text-[11.5px]" style={{ color: "#93C5FD" }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta) > 999 ? "999%+" : `${Math.abs(delta).toFixed(1)}%`} vs {compareLabel.toLowerCase()}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* the sheet */}
      <div className={`${card} overflow-hidden`}>
        <div className="lg:flex">
          <div className="flex-1 p-5 border-b lg:border-b-0 lg:border-r" style={{ borderColor: LINE }}>
            {side("LIABILITIES & CAPITAL", <>
              <Group title="Current liabilities" rows={liabilityRows} subtotalLabel="Total liabilities" subtotal={now.liabilities} />
              <Group title="Capital & reserves" rows={equityRows} subtotalLabel="Total equity" subtotal={now.equity} />
            </>, "Total liabilities & equity", now.liabilities + now.equity)}
          </div>
          <div className="flex-1 p-5">
            {side("ASSETS", <>
              <Group title="Cash & bank" rows={cashRows} subtotalLabel="Total cash & bank" subtotal={cashTotal} />
              <Group title="Receivables & stock" rows={receivableRows} subtotalLabel="Total receivables & stock" subtotal={receivableTotal} />
            </>, "Total assets", now.assets)}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: LINE, backgroundColor: BRAND_TINT }}>
          {balanced ? <CheckCircle2 size={18} style={{ color: BRAND }} /> : <AlertCircle size={18} style={{ color: BRAND }} />}
          <span className="flex-1 text-[13px] font-semibold" style={{ color: BRAND_DARK }}>
            {balanced ? "Balanced: Assets = Liabilities + Equity" : "Out of balance"}  ·  {inr(now.assets)} = {inr(now.liabilities)} + ({inr(now.equity)})
          </span>
        </div>
      </div>

      {/* trend and watch list */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-3.5">
        <div className={`${card} p-5 min-w-0`}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex-1 text-[15px] font-bold text-gray-900">Assets vs liabilities</div>
            <div className="flex gap-3.5 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-[3px]" style={{ backgroundColor: "#1D4ED8" }} />Assets</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-[3px]" style={{ backgroundColor: "#93C5FD" }} />Liabilities</span>
            </div>
          </div>
          <div className="mb-1 text-xs text-gray-500">Month end, last 7 months</div>
          <TrendChart labels={trend.map((t) => t.label)} assets={trend.map((t) => t.assets)} liabilities={trend.map((t) => t.liabilities)} />
        </div>
        <div className={`${card} p-5 min-w-0`}>
          <div className="mb-3 text-[15px] font-bold text-gray-900">Watch list</div>
          <div className="space-y-3">
            {alerts.map(([tone, text], i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-[5px] w-[9px] h-[9px] rounded-full shrink-0" style={{ backgroundColor: toneColor[tone] }} />
                <span className="flex-1 text-[13px] text-gray-800">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11.5px] text-gray-400">Stock is the vehicles in Inventory not yet sold, valued at purchase cost (today's stock). Equity is the balancing figure: assets minus liabilities. Tap a line to open its detail.</p>
    </div>
  );
}
