/**
 * FinanceOverview.jsx — the Dashboard's finance and work blocks, laid out as in Jageer Nepal's finance dashboard:
 *   Sales & Purchases (+ Recent Activity) · In Cash & Banks (+ Receivable Ageing) · Receivable & Payable · Received & Paid ·
 *   Expense Diagram · Top Customers · Work: Jobs by Stage (+ Recent Updates)
 * Every figure is read off the Finance books with the same functions the Finance pages use (finance/money.js), so the
 * Dashboard and Finance always agree. Fiscal year = Shrawan 1 to Ashadh end (BS). Admin only; shows nothing until the
 * Finance books are set up.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, ShoppingCart, Receipt, ArrowDownCircle, ArrowUpCircle, Download, Upload, Clock, ChevronRight, ClipboardCheck } from "lucide-react";
import api from "../utils/api";
import { BooksProvider, useBooks } from "../pages/finance/BooksContext";
import { balances, accountName, billDate, cashMovements, isJournal, npr, owedTotals, partyName, profitLoss, receivableAgeing, receivedPaid, AGEING_BUCKETS, entryDate } from "../pages/finance/money";
import { bsToAdDate, formatBSDate, getBSMonthMaxDays, getBSMonthRange, getCurrentBSDate, BS_MONTHS } from "../utils/nepali-date";
import { compactNpr } from "./DashboardTrends";
import { SOURCE_LABEL } from "../utils/crm";

const BLUE = "#2563EB", RED = "#DC2626", AMBER = "#F59E0B", GREEN = "#047857";
const PALETTE = ["#2563EB", "#0F766E", "#F59E0B", "#7C3AED", "#E11D48", "#94A3B8"];

// ── time: the fiscal year and the twelve BS months ending this one ──
function useCalendar() {
  return useMemo(() => {
    const bs = getCurrentBSDate();
    if (!bs) return null;
    const fy = bs.month >= 4 ? bs.year : bs.year - 1;
    const endMax = getBSMonthMaxDays(fy + 1, 3);
    const fyRange = { start: bsToAdDate(fy, 4, 1), end: bsToAdDate(fy + 1, 3, endMax), label: `01/04/${fy} → ${endMax}/03/${fy + 1}` };
    const months = [];
    for (let i = 11; i >= 0; i--) {
      let m = bs.month - i, y = bs.year;
      while (m < 1) { m += 12; y -= 1; }
      const r = getBSMonthRange(y, m);
      if (r) months.push({ label: BS_MONTHS[m - 1].slice(0, 3), ...r });
    }
    return { fyRange, months };
  }, []);
}

const inRange = (d, r) => d >= r.start && d <= r.end;
const timeOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// ── shared pieces ──
function Card({ title, subtitle, link, onLink, children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 min-w-0 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {link && <button onClick={onLink} className="shrink-0 text-xs font-bold text-blue-600 hover:underline">{link}</button>}
      </div>
      {children}
    </div>
  );
}

function Tile({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="rounded-xl p-4 min-w-0" style={{ background: tone.bg }}>
      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-700"><span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center" style={{ color: tone.fg }}><Icon size={14} /></span>{label}</div>
      <div className="text-xl font-extrabold truncate" style={{ color: tone.fg, fontFamily: "Manrope, sans-serif" }}>{value}</div>
      {note && <div className="text-[11px] text-slate-500 mt-1 truncate">{note}</div>}
    </div>
  );
}
const TONES = { blue: { bg: "#EFF6FF", fg: "#1D4ED8" }, red: { bg: "#FEF2F2", fg: "#B91C1C" }, green: { bg: "#ECFDF5", fg: "#047857" }, amber: { bg: "#FFFBEB", fg: "#B45309" } };

const Net = ({ label, value, good = true }) => (
  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 mt-3 text-sm">
    <span className="font-medium text-slate-700">{label}</span>
    <span className={`font-extrabold ${value < 0 ? "text-red-600" : good ? "text-emerald-700" : "text-slate-900"}`}>{value < 0 ? "−" : ""}{npr(Math.abs(value))}</span>
  </div>
);

const Legend = ({ items }) => (
  <div className="flex items-center gap-4 text-xs text-slate-500">{items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}</div>
);

// Two lines over the twelve months, the first with a soft fill.
function TwoLine({ data, a, b }) {
  const tip = ({ active, payload }) => (active && payload?.length ? (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-500 mb-1">{payload[0].payload.label}</div>
      {[a, b].map((s) => <div key={s.key} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name}</span><b className="text-slate-900">{npr(payload[0].payload[s.key])}</b></div>)}
    </div>
  ) : null);
  return (
    <div className="h-[230px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs><linearGradient id={`fill-${a.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a.color} stopOpacity={0.22} /><stop offset="1" stopColor={a.color} stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#EEF0F3" strokeDasharray="3 4" />
          <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={{ stroke: "#D9DDE3" }} interval={0} />
          <YAxis tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={compactNpr} width={46} />
          <Tooltip content={tip} cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }} />
          <Area type="monotone" dataKey={a.key} stroke={a.color} strokeWidth={2.5} fill={`url(#fill-${a.key})`} dot={{ r: 3, fill: "#fff", stroke: a.color, strokeWidth: 2 }} />
          <Area type="monotone" dataKey={b.key} stroke={b.color} strokeWidth={2} fill="none" dot={{ r: 3, fill: "#fff", stroke: b.color, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── the finance blocks ──
// `bought`: the vehicles bought (GET /reports/purchases). A vehicle's purchase price is never posted to the Finance books as a
// purchase bill, so it is added to the purchase bills here; otherwise Purchases would read 0 for a dealership.
const boughtIn = (bought, r) => bought.reduce((sum, v) => (v.purchase_date && inRange(v.purchase_date.slice(0, 10), r) ? sum + (v.purchase_price || 0) : sum), 0);

// `dues`: GET /reports/vendor-dues, the Vendors module's purchases and payments as dated events. They are not in the Finance
// books either, so To Pay and Paid add them. Owed to a vendor on a day = what was bought from them up to then, less what was
// paid them up to then (never below 0 for one vendor, like Vendors' remaining due).
const dueAt = (dues, upTo) => {
  const by = new Map();
  for (const e of dues) { if (upTo && e.date > upTo) continue; by.set(e.vendor_id, (by.get(e.vendor_id) || 0) + (e.kind === "paid" ? -e.amount : e.amount)); }
  return [...by.values()].reduce((t, v) => t + Math.max(0, v), 0);
};
const paidToVendors = (dues, r) => dues.reduce((t, e) => (e.kind === "paid" && e.date && inRange(e.date.slice(0, 10), r) ? t + e.amount : t), 0);

function SalesAndPurchases({ books, cal, bought }) {
  const fy = useMemo(() => { const p = profitLoss(books, cal.fyRange.start, cal.fyRange.end); return { ...p, purchase: p.purchase + boughtIn(bought, cal.fyRange) }; }, [books, cal, bought]);
  const series = useMemo(() => cal.months.map((m) => { const p = profitLoss(books, m.start, m.end); return { label: m.label, sales: p.sale, purchases: p.purchase + boughtIn(bought, m) }; }), [books, cal, bought]);
  const best = (k) => series.reduce((b, s) => (s[k] > (b?.[k] ?? 0) ? s : b), null);
  const bs = best("sales"), bp = best("purchases");
  return (
    <Card title="Sales and Purchases" subtitle="What you sold and what you bought · this fiscal year">
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={TrendingUp} label="Sales" value={npr(fy.sale)} note={bs ? `Best month ${bs.label} · ${compactNpr(bs.sales)}` : "No sales yet"} tone={TONES.blue} />
        <Tile icon={ShoppingCart} label="Purchases" value={npr(fy.purchase)} note={bp ? `Best month ${bp.label} · ${compactNpr(bp.purchases)}` : "No purchases yet"} tone={TONES.red} />
      </div>
      <Net label="Sales − Purchases" value={fy.sale - fy.purchase} />
      <div className="flex items-center justify-between mt-4 mb-1"><p className="text-xs font-semibold text-slate-500">Sales and purchases · last 12 months</p><Legend items={[[BLUE, "Sales"], [RED, "Purchases"]]} /></div>
      <TwoLine data={series} a={{ key: "sales", name: "Sales", color: BLUE }} b={{ key: "purchases", name: "Purchases", color: RED }} />
    </Card>
  );
}

const KIND = { sale: { Icon: TrendingUp, color: GREEN, sign: "+", label: "Sale" }, purchase: { Icon: ShoppingCart, color: RED, sign: "−", label: "Purchase" }, expense: { Icon: Receipt, color: RED, sign: "−", label: "Expense" } };

function RecentActivity({ books, go }) {
  const rows = useMemo(() => books.transactions.filter((t) => !isJournal(t))
    .sort((a, b) => (billDate(a) === billDate(b) ? (b.created_at || "").localeCompare(a.created_at || "") : billDate(a) < billDate(b) ? 1 : -1)).slice(0, 8), [books]);
  return (
    <Card title="Recent Activity" subtitle="Latest sales, purchases and expenses" link="View All" onLink={() => go("/finance?tab=statement")}>
      {rows.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">Nothing recorded yet</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((t) => {
            const k = KIND[t.type] || KIND.expense;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${k.color}1A`, color: k.color }}><k.Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-900 truncate">{t.party_name || partyName(books, t.customer_id) || k.label}</div>
                  <div className="text-[11px] text-slate-400 truncate">{formatBSDate(billDate(t))} · {timeOf(t.created_at)}</div>
                </div>
                <div className="text-[13px] font-bold shrink-0" style={{ color: k.color }}>{k.sign} {npr(t.amount)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function CashAndBanks({ books, go }) {
  const { total, buckets } = useMemo(() => balances(books), [books]);
  const rows = useMemo(() => {
    const list = Object.entries(buckets).map(([k, b]) => ({ name: k === "cash" ? "Cash In Hand" : accountName(books, k), amount: b.total }));
    books.accounts.forEach((a) => { if (!list.some((r) => r.name === a.name)) list.push({ name: a.name, amount: 0 }); });
    return list.sort((a, b) => b.amount - a.amount);
  }, [books, buckets]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <Card title="In Cash and Banks" link="Open Balances" onLink={() => go("/finance?tab=banks")}>
      <div className={`text-3xl font-extrabold mb-4 ${total < 0 ? "text-red-600" : "text-emerald-700"}`} style={{ fontFamily: "Manrope, sans-serif" }}>{total < 0 ? "−" : ""}{npr(Math.abs(total))}</div>
      <div className="flex justify-between text-[11px] font-semibold text-slate-500 border-b border-slate-200 pb-1.5"><span>Account</span><span>Balance</span></div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.name} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-800 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.amount < 0 ? RED : "#16A34A" }} /><span className="truncate">{r.name}</span></span>
              <span className={`text-[13px] font-bold shrink-0 ${r.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{r.amount < 0 ? "−" : ""}{npr(Math.abs(r.amount))}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 mt-1.5"><div className="h-full rounded-full" style={{ width: `${(Math.abs(r.amount) / max) * 100}%`, background: r.amount < 0 ? RED : "#16A34A" }} /></div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No accounts yet</li>}
      </ul>
    </Card>
  );
}

function ReceivableAgeing({ books, go }) {
  const { ageing } = useMemo(() => receivableAgeing(books), [books]);
  const max = Math.max(1, ...ageing);
  return (
    <Card title="Receivable Ageing" subtitle="How long what you are owed has been waiting" link="Ageing Report" onLink={() => go("/finance?tab=ageing-report")}>
      <div className="grid grid-cols-3 gap-3 items-end flex-1 min-h-[170px]">
        {AGEING_BUCKETS.map((b, i) => (
          <div key={b.label} className="flex flex-col items-center justify-end h-full min-w-0">
            <div className="text-xs font-bold text-slate-900 mb-1">{compactNpr(ageing[i])}</div>
            <div className="w-full rounded-lg" style={{ height: `${Math.max(8, (ageing[i] / max) * 120)}px`, background: i === 0 ? "#0F766E" : i === 1 ? "#F59E0B" : "#DC2626" }} />
            <div className="text-[11px] text-slate-500 mt-2 whitespace-nowrap">{b.label.replace(" days", " Days")}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReceivablePayable({ books, cal, dues }) {
  const now = useMemo(() => { const o = owedTotals(books); return { ...o, totalPayable: o.totalPayable + dueAt(dues) }; }, [books, dues]);
  const series = useMemo(() => cal.months.map((m) => {
    const t = owedTotals({ ...books, customer_ledger: books.customer_ledger.filter((e) => entryDate(e) <= m.end), vendor_ledger: books.vendor_ledger.filter((e) => entryDate(e) <= m.end) });
    return { label: m.label, receive: t.totalReceivable, pay: t.totalPayable + dueAt(dues, m.end) };
  }), [books, cal, dues]);
  return (
    <Card title="Receivable & Payable" subtitle="What is owed to you and by you">
      <p className="text-xs font-semibold text-slate-500 mb-2">Owed right now</p>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={ArrowDownCircle} label="To Receive" value={npr(now.totalReceivable)} note={`From ${now.owingMe.length} part${now.owingMe.length === 1 ? "y" : "ies"}`} tone={TONES.blue} />
        <Tile icon={ArrowUpCircle} label="To Pay" value={npr(now.totalPayable)} note="Owed to vendors and suppliers" tone={TONES.red} />
      </div>
      <Net label="Net Owed (To Receive − To Pay)" value={now.totalReceivable - now.totalPayable} />
      <div className="flex items-center justify-between mt-4 mb-1"><p className="text-xs font-semibold text-slate-500">Receivable and payable · last 12 months</p><Legend items={[[BLUE, "To Receive"], [RED, "To Pay"]]} /></div>
      <TwoLine data={series} a={{ key: "receive", name: "To Receive", color: BLUE }} b={{ key: "pay", name: "To Pay", color: RED }} />
    </Card>
  );
}

function ReceivedPaid({ books, cal, dues }) {
  const fy = useMemo(() => { const r = receivedPaid(books, cal.fyRange.start, cal.fyRange.end); return { ...r, paid: r.paid + paidToVendors(dues, cal.fyRange) }; }, [books, cal, dues]);
  const billed = useMemo(() => profitLoss(books, cal.fyRange.start, cal.fyRange.end).sale, [books, cal]);
  const series = useMemo(() => {
    const moves = cashMovements(books);
    return cal.months.map((m) => {
      let received = 0, paid = 0;
      for (const x of moves) if (inRange(x.date, m)) { if (x.dir === "in") received += x.amount; else paid += x.amount; }
      return { label: m.label, received, paid: paid + paidToVendors(dues, m) };
    });
  }, [books, cal, dues]);
  return (
    <Card title="Received & Paid" subtitle="What came in and what went out · this fiscal year">
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={Download} label="Received" value={npr(fy.received)} note={billed > 0 ? `${Math.round((fy.received / billed) * 100)}% of ${npr(billed)} billed` : "Nothing billed yet"} tone={TONES.green} />
        <Tile icon={Upload} label="Paid" value={npr(fy.paid)} note="Expenses and payments to vendors" tone={TONES.amber} />
      </div>
      <Net label="Net Movement (Received − Paid)" value={fy.received - fy.paid} />
      <div className="flex items-center justify-between mt-4 mb-1"><p className="text-xs font-semibold text-slate-500">Received and paid · last 12 months</p><Legend items={[[BLUE, "Received"], [AMBER, "Paid"]]} /></div>
      <TwoLine data={series} a={{ key: "received", name: "Received", color: BLUE }} b={{ key: "paid", name: "Paid", color: AMBER }} />
    </Card>
  );
}

function ExpenseDiagram({ books, cal }) {
  const { rows, total } = useMemo(() => {
    const names = new Map(books.categories.map((c) => [c.id, c.name]));
    const by = new Map();
    for (const t of books.transactions) {
      if (t.type !== "expense" || isJournal(t) || !inRange(billDate(t), cal.fyRange)) continue;
      const n = (t.expense_category_id && names.get(t.expense_category_id)) || "Other";
      by.set(n, (by.get(n) || 0) + t.amount);
    }
    const all = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 5), rest = all.slice(5).reduce((s, [, v]) => s + v, 0);
    const list = [...top, ...(rest > 0 ? [["Other", rest]] : [])];
    return { rows: list.map(([name, value]) => ({ name, value })), total: all.reduce((s, [, v]) => s + v, 0) };
  }, [books, cal]);
  return (
    <Card title="Expense Diagram" subtitle="Expenses by category · this fiscal year">
      {total <= 0 ? <p className="text-sm text-slate-400 text-center py-10">No expenses this fiscal year</p> : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-[170px] h-[170px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={rows} dataKey="value" innerRadius={58} outerRadius={82} startAngle={90} endAngle={-270} stroke="none">{rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip formatter={(v) => npr(v)} /></PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-[11px] text-slate-400">Total</span><span className="text-lg font-extrabold text-slate-900">{compactNpr(total)}</span></div>
          </div>
          <ul className="flex-1 w-full space-y-2">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate text-slate-700">{r.name}</span></span><b className="text-slate-900">{Math.round((r.value / total) * 100)}%</b></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TopCustomers({ books, cal }) {
  const { rows, total } = useMemo(() => {
    const by = new Map();
    for (const t of books.transactions) {
      if (t.type !== "sale" || isJournal(t) || !inRange(billDate(t), cal.fyRange)) continue;
      const n = t.customer_id ? partyName(books, t.customer_id, t.party_name || "Customer") : t.party_name || "Walk-in";
      by.set(n, (by.get(n) || 0) + t.amount);
    }
    const all = [...by.entries()].sort((a, b) => b[1] - a[1]);
    return { rows: all.slice(0, 8), total: all.reduce((s, [, v]) => s + v, 0) };
  }, [books, cal]);
  return (
    <Card title="Top Customers" subtitle="Sales · this fiscal year">
      {rows.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">No sales this fiscal year</p> : (
        <>
          <div className="grid grid-cols-[24px_1fr_auto_52px] gap-x-3 text-[11px] font-semibold text-slate-500 border-b border-slate-200 pb-1.5"><span>#</span><span>Customer</span><span className="text-right">Sales</span><span className="text-right">Share</span></div>
          <ul className="divide-y divide-slate-100">
            {rows.map(([name, v], i) => (
              <li key={name} className="grid grid-cols-[24px_1fr_auto_52px] gap-x-3 items-center py-2.5">
                <span className="text-xs text-slate-400">{i + 1}</span>
                <div className="min-w-0"><div className="text-[13px] font-medium text-slate-900 truncate">{name}</div><div className="h-1.5 rounded-full bg-slate-100 mt-1.5"><div className="h-full rounded-full bg-blue-600" style={{ width: `${(v / rows[0][1]) * 100}%` }} /></div></div>
                <span className="text-[13px] text-slate-800 text-right">{npr(v)}</span>
                <span className="text-[13px] font-bold text-blue-600 text-right">{((v / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[24px_1fr_auto_52px] gap-x-3 pt-2.5 border-t border-slate-200 text-[13px] font-bold text-slate-800"><span /><span>All Customers</span><span className="text-right">{npr(total)}</span><span className="text-right">100%</span></div>
        </>
      )}
    </Card>
  );
}

// ── who sells, and where the buyers come from (the fiscal year's vehicle sales, from GET /sales) ──
const bikesSold = (sales) => sales.filter((x) => !x.returned && x.vehicle_id);

function TopSellers({ sales }) {
  const rows = useMemo(() => {
    const by = new Map();
    for (const x of bikesSold(sales)) {
      const n = x.sold_by_name || "Not recorded";
      const r = by.get(n) || { name: n, bikes: 0, revenue: 0 };
      r.bikes += 1; r.revenue += x.sale_price || 0; by.set(n, r);
    }
    return [...by.values()].sort((a, b) => b.bikes - a.bikes || b.revenue - a.revenue).slice(0, 8);
  }, [sales]);
  const tip = ({ active, payload }) => (active && payload?.length ? (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-900 mb-1">{payload[0].payload.name}</div>
      <div className="text-slate-500">{payload[0].payload.bikes} bike{payload[0].payload.bikes === 1 ? "" : "s"} · {npr(payload[0].payload.revenue)}</div>
    </div>
  ) : null);
  return (
    <Card title="Top Sellers" subtitle="Bikes sold by each person · this fiscal year">
      {rows.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">No bikes sold this fiscal year</p> : (
        <div style={{ height: Math.max(150, rows.length * 38 + 20) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="#EEF0F3" strokeDasharray="3 4" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11.5, fill: "#334155" }} tickLine={false} axisLine={false} />
              <Tooltip content={tip} cursor={{ fill: "#F1F5F9" }} />
              <Bar dataKey="bikes" fill={BLUE} radius={[0, 6, 6, 0]} barSize={18} label={{ position: "right", fontSize: 11, fill: "#334155" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function LeadSources({ sales }) {
  const { rows, total, walkIn, sold } = useMemo(() => {
    const by = new Map();
    let walkIn = 0;
    for (const x of bikesSold(sales)) {
      const n = SOURCE_LABEL[x.lead_source];
      // Untagged sales are mostly walk-ins, so they are counted with the Walk-in tag and kept out of the chart.
      if (!n || n === "Walk-in") walkIn++;
      else by.set(n, (by.get(n) || 0) + 1);
    }
    const all = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const tagged = all.reduce((t, [, v]) => t + v, 0);
    return { rows: all.map(([name, value]) => ({ name, value })), total: tagged, walkIn, sold: tagged + walkIn };
  }, [sales]);
  return (
    <Card title="Sales by Lead Source" subtitle="Where the buyers came from · this fiscal year">
      {sold > 0 && <p className="text-xs text-slate-500 mb-3">Walk-in &amp; untagged: <b className="text-slate-800">{walkIn}</b> of {sold} bikes ({Math.round((walkIn / sold) * 100)}%), left out of the chart so it shows only the sources that brought buyers in.</p>}
      {total <= 0 ? <p className="text-sm text-slate-400 text-center py-10">{sold > 0 ? "No tagged lead sources yet" : "No bikes sold this fiscal year"}</p> : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-[170px] h-[170px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={rows} dataKey="value" innerRadius={58} outerRadius={82} startAngle={90} endAngle={-270} stroke="none">{rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip formatter={(v, n) => [`${v} bike${v === 1 ? "" : "s"}`, n]} /></PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-[11px] text-slate-400">Excl. walk-in</span><span className="text-lg font-extrabold text-slate-900">{total}</span></div>
          </div>
          <ul className="flex-1 w-full space-y-2">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate text-slate-700">{r.name}</span></span><span className="text-slate-900"><b>{r.value}</b> <span className="text-xs text-slate-400">· {Math.round((r.value / total) * 100)}%</span></span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ── Work: the job cards ──
// Vehicles in repair, by how far their job cards have got: Pending (nothing started), In progress, or Done (every job is
// finished but the vehicle has not been put back in stock). A vehicle with several jobs sits at its furthest-behind open one.
const STAGES = [["pending", "Pending", "#F59E0B"], ["in_progress", "In Progress", "#16A34A"], ["done", "Done, Not Restocked", "#7C3AED"]];
// The workshop and stock feed: vehicles bought, vehicles sold, jobs completed.
const EVENT = { bought: { label: "Bought", color: "#2563EB", Icon: ShoppingCart }, sold: { label: "Sold", color: "#047857", Icon: TrendingUp }, job: { label: "Job completed", color: "#6D28D9", Icon: ClipboardCheck } };
const jobAmount = (j) => Number(j.actual_cost) || Number(j.estimated_cost) || 0;
const stageOf = (jobs) => (jobs.some((j) => j.status === "in_progress") ? "in_progress" : jobs.some((j) => j.status === "pending") ? "pending" : "done");

function Work({ go }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const end = new Date(), start = new Date(end.getTime() - 30 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10), q = `start_date=${iso(start)}&end_date=${iso(end)}`;
    const get = (url, fallback) => api.get(url, { suppressErrorToast: true }).then((r) => r.data).catch(() => fallback);
    Promise.all([get("/jobs", []), get("/vehicles?status=in_repair", []), get(`/sales?${q}`, []), get(`/reports/purchases?${q}`, [])])
      .then(([jobs, vehicles, sales, purchases]) => setData({ jobs, vehicles, sales, purchases }));
  }, []);
  const stats = useMemo(() => {
    const { jobs = [], vehicles = [], sales = [], purchases = [] } = data || {};
    const limit = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const rows = STAGES.map(([k, label, color]) => ({ k, label, color, n: 0, amount: 0 }));
    let overdue = 0;
    for (const v of vehicles) {
      const mine = jobs.filter((j) => j.vehicle_id === v.id);
      const r = rows.find((x) => x.k === stageOf(mine));
      r.n += 1;
      r.amount += mine.reduce((s, j) => s + jobAmount(j), 0);
      if (mine.some((j) => j.status !== "completed" && (j.job_date || "9999") < limit)) overdue += 1;
    }
    const count = vehicles.length;
    rows.forEach((r) => { r.share = count ? (r.n / count) * 100 : 0; });
    // Newest first. A sale or job has a real time; a purchase only its date, so it sorts at the start of that day.
    const events = [
      ...purchases.map((p) => ({ key: `b${p.id}`, type: "bought", at: p.purchase_date || "", title: p.vehicle_info, reg: p.registration_number, sub: p.purchase_source || "", amount: p.purchase_price })),
      ...sales.filter((x) => !x.returned).map((x) => ({ key: `s${x.id}`, type: "sold", at: x.created_at || x.sale_date || "", day: x.sale_date, title: x.vehicle_info, sub: x.customer_name || "", amount: x.sale_price })),
      ...jobs.filter((j) => j.status === "completed" && j.completed_at).map((j) => ({ key: `j${j.id}`, type: "job", at: j.completed_at, title: [j.vehicle_brand, j.vehicle_model, j.vehicle_year].filter(Boolean).join(" ") || j.work_description, reg: j.registration_number, sub: [j.work_description, j.customer_name || j.mechanic_name].filter(Boolean).join(" · "), amount: jobAmount(j) })),
    ].sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : 0)).slice(0, 8);
    return { rows, count, total: rows.reduce((s, r) => s + r.amount, 0), overdue, events };
  }, [data]);
  if (!data) return null;
  const max = Math.max(1, ...stats.rows.map((r) => r.share));
  return (
    <>
      <div className="flex items-center gap-3"><h2 className="text-sm font-bold text-slate-700">Work</h2><div className="flex-1 h-px bg-slate-200" /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Vehicles in Repair" subtitle="Where each vehicle in the workshop stands" link="Open Jobs" onLink={() => go("/jobs")}>
          <div className="grid grid-cols-[1fr_52px_96px_56px] gap-x-3 text-[11px] font-semibold text-slate-500 border-b border-slate-200 pb-1.5"><span>Stage</span><span className="text-right">Vehicles</span><span className="text-right">Job cost</span><span className="text-right">Share</span></div>
          <ul className="divide-y divide-slate-100">
            {stats.rows.map((r) => (
              <li key={r.k} className="grid grid-cols-[1fr_52px_96px_56px] gap-x-3 items-center py-2.5">
                <div className="min-w-0"><span className="inline-flex items-center gap-2 text-[13px] text-slate-800"><span className="w-2 h-2 rounded-sm" style={{ background: r.color }} />{r.label}</span><div className="h-1.5 rounded-full bg-slate-100 mt-1.5"><div className="h-full rounded-full" style={{ width: `${(r.share / max) * 100}%`, background: r.color }} /></div></div>
                <span className="text-[13px] text-slate-600 text-right">{r.n}</span>
                <span className="text-[13px] font-semibold text-slate-800 text-right">{npr(r.amount)}</span>
                <span className="text-[13px] font-bold text-blue-600 text-right">{r.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_52px_96px_56px] gap-x-3 pt-2.5 border-t border-slate-200 text-[13px] font-bold text-slate-800"><span>All Stages</span><span className="text-right">{stats.count}</span><span className="text-right">{npr(stats.total)}</span><span className="text-right">{stats.count ? "100%" : "0%"}</span></div>
          {stats.overdue > 0 && (
            <button onClick={() => go("/jobs?status=pending")} className="mt-4 w-full flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 hover:bg-red-100 text-left">
              <Clock size={16} /> {stats.overdue} Vehicle{stats.overdue === 1 ? "" : "s"} Waiting Over 7 Days<ChevronRight size={16} className="ml-auto text-red-400" />
            </button>
          )}
        </Card>

        <Card title="Recent Updates" subtitle="Vehicles bought and sold, jobs completed" link="View All" onLink={() => go("/jobs")}>
          {stats.events.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">Nothing in the last 30 days</p> : (
            <ul className="divide-y divide-slate-100">
              {stats.events.map((e) => {
                const k = EVENT[e.type];
                const day = e.day || e.at.slice(0, 10);
                return (
                  <li key={e.key} className="flex items-center gap-3 py-2.5">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${k.color}1A`, color: k.color }}><k.Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 min-w-0"><span className="text-sm font-bold text-slate-900 truncate">{e.title}</span>{e.reg && <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-500">{e.reg}</span>}</div>
                      <div className="text-[11px] font-semibold" style={{ color: k.color }}>{k.label}</div>
                      <div className="text-[11px] text-slate-400 truncate">{formatBSDate(day)}{e.at.length > 10 ? ` · ${timeOf(e.at)}` : ""}{e.sub ? ` · ${e.sub}` : ""}</div>
                    </div>
                    {e.amount > 0 && <div className="text-[13px] font-bold text-slate-900 shrink-0">{npr(e.amount)}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Inner({ jobsOn }) {
  const { books, loading, setupMessage, loadError } = useBooks();
  const navigate = useNavigate();
  const cal = useCalendar();
  // What the Finance books do not hold: vehicle purchases, and the sales with who sold them and how the buyer came. Each
  // read fails quietly (e.g. not allowed) into an empty list, so a block never takes the others down with it.
  const [stock, setStock] = useState({ bought: [], sales: [], dues: [] });
  useEffect(() => {
    if (!cal) return;
    const start = [cal.months[0]?.start, cal.fyRange.start].filter(Boolean).sort()[0];
    const end = [cal.months[cal.months.length - 1]?.end, cal.fyRange.end].filter(Boolean).sort().pop();
    const get = (url, pick = (d) => d) => api.get(url, { suppressErrorToast: true }).then((r) => { const d = pick(r.data); return Array.isArray(d) ? d : []; }).catch(() => []);
    Promise.all([get(`/reports/purchases?start_date=${start}&end_date=${end}`), get(`/sales?start_date=${cal.fyRange.start}&end_date=${cal.fyRange.end}`), get("/reports/vendor-dues", (d) => d?.events)])
      .then(([bought, sales, dues]) => setStock({ bought, sales, dues }));
  }, [cal]);
  if (loading) return <div className="h-48 rounded-2xl bg-white border border-slate-200 animate-pulse" />;
  const finance = !setupMessage && !loadError && cal;
  return (
    <div className="space-y-6" data-testid="finance-overview">
      {finance && (
        <>
          <div className="flex items-center gap-3"><h2 className="text-sm font-bold text-slate-700">Finance</h2><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400">This Fiscal Year · {cal.fyRange.label}</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SalesAndPurchases books={books} cal={cal} bought={stock.bought} /><RecentActivity books={books} go={navigate} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><CashAndBanks books={books} go={navigate} /><ReceivableAgeing books={books} go={navigate} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ReceivablePayable books={books} cal={cal} dues={stock.dues} /><ReceivedPaid books={books} cal={cal} dues={stock.dues} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><ExpenseDiagram books={books} cal={cal} /><TopCustomers books={books} cal={cal} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><TopSellers sales={stock.sales} /><LeadSources sales={stock.sales} /></div>
        </>
      )}
      {jobsOn && <Work go={navigate} />}
    </div>
  );
}

// Admin only: the Finance books and the job totals are the owner's.
export default function FinanceOverview({ jobsOn }) {
  return <BooksProvider><Inner jobsOn={jobsOn} /></BooksProvider>;
}
