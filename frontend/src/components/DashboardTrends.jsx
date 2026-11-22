/**
 * DashboardTrends.jsx — the Dashboard's two charts, after the Finance dashboard in sagaritnepal/JAGEERNEPAL:
 *   SalesTrendCard  a smooth area line of sales with a 1 day / 1 week / 1 month switch (today is by the hour)
 *   NetTrendCard    bars of what came in minus what went out, week by week, green above zero and red below
 * Both read the last 90 days of sales and vehicle purchases once, and bucket them in the browser. Axis amounts are
 * written the Nepali way (25k, 1.5L, 2Cr).
 */
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import { adToBsDate, BS_MONTHS } from "../utils/nepali-date";

const GREEN = "#059669";
const RED = "#DC2626";
const DAY = 86400000;
const HISTORY_DAYS = 90; // 12 weeks of the net chart, with room for the week that is under way

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const bsShort = (d) => { const b = adToBsDate(ymd(d)); return b ? `${BS_MONTHS[b.month - 1].slice(0, 3)} ${b.day}` : ymd(d); };
const hourLabel = (h) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

// 25k, 1.5L (lakh), 2Cr (crore)
export function compactNpr(v) {
  const a = Math.abs(v), trim = (n) => String(Math.round(n * 10) / 10);
  if (a >= 1e7) return `${trim(v / 1e7)}Cr`;
  if (a >= 1e5) return `${trim(v / 1e5)}L`;
  if (a >= 1e3) return `${trim(v / 1e3)}k`;
  return String(Math.round(v));
}

// A sale counts what it brought in: a returned one only what the shop kept.
const revenue = (s) => (s.returned ? s.retained_amount || 0 : s.sale_price || 0);

// When a sale happened: its date has no hour, so for the hourly view use the time it was entered when that was the same day.
function saleMoment(s) {
  const [y, m, d] = (s.sale_date || "").split("-").map(Number);
  if (!y) return null;
  const day = new Date(y, m - 1, d).getTime();
  const made = s.created_at ? new Date(s.created_at) : null;
  return made && dayStart(made).getTime() === day ? made.getTime() : day;
}

// Sales and purchases of the last 90 days. `ok` is false when the purchases could not be read (not an admin): the net chart then stays away.
function useBooks() {
  const [books, setBooks] = useState(null);
  useEffect(() => {
    const end = new Date(), start = new Date(end.getTime() - HISTORY_DAYS * DAY);
    const q = `start_date=${ymd(start)}&end_date=${ymd(end)}`;
    Promise.all([
      api.get(`/sales?${q}`).then((r) => r.data).catch(() => []),
      api.get(`/reports/purchases?${q}`, { suppressErrorToast: true }).then((r) => r.data).catch(() => null),
    ]).then(([sales, purchases]) => setBooks({ sales, purchases }));
  }, []);
  return books;
}

const PERIODS = [["1d", "1 day", "today"], ["1w", "1 week", "in the last 7 days"], ["1m", "1 month", "in the last 30 days"]];

function Card({ title, subtitle, right, children, testid }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" data-testid={testid}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const tip = (label, value, color) => ({ active, payload }) => (active && payload?.length ? (
  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
    <div className="font-semibold text-slate-500 mb-0.5">{payload[0].payload.label}</div>
    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: color(payload[0].value) }} />{label}<b className="ml-3 text-slate-900">{value(payload[0].value)}</b></div>
  </div>
) : null);

export function SalesTrendCard({ books }) {
  const [period, setPeriod] = useState("1m");
  const { data, total } = useMemo(() => {
    if (!books) return { data: [], total: 0 };
    const now = new Date();
    let buckets;
    if (period === "1d") {
      const t0 = dayStart(now).getTime();
      buckets = Array.from({ length: now.getHours() + 1 }, (_, h) => ({ label: hourLabel(h), from: t0 + h * 3600000, to: t0 + (h + 1) * 3600000 }));
    } else {
      const n = period === "1w" ? 7 : 30;
      buckets = Array.from({ length: n }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
        return { label: bsShort(d), from: d.getTime(), to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() };
      });
    }
    const out = buckets.map((b) => ({ label: b.label, value: 0, from: b.from, to: b.to }));
    for (const s of books.sales) {
      const t = saleMoment(s);
      const b = t == null ? null : out.find((x) => t >= x.from && t < x.to);
      if (b) b.value += revenue(s);
    }
    return { data: out, total: out.reduce((n, b) => n + b.value, 0) };
  }, [books, period]);
  const caption = PERIODS.find((p) => p[0] === period)[2];

  return (
    <Card testid="sales-trend" title="Sales trend" subtitle={books ? `${formatNPR(total)} ${caption}` : "Loading…"}
      right={(
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Sales trend period">
          {PERIODS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} data-testid={`trend-${k}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === k ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>
          ))}
        </div>
      )}>
      <div className="relative h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={GREEN} stopOpacity={0.22} /><stop offset="1" stopColor={GREEN} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF0F3" strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={{ stroke: "#D9DDE3" }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={compactNpr} allowDecimals={false} width={46} />
            <Tooltip content={tip("Sales", formatNPR, () => GREEN)} cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 4, fill: "#fff", stroke: GREEN, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
        {books && total <= 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 pointer-events-none">No sales recorded in this period yet</p>}
      </div>
    </Card>
  );
}

export function NetTrendCard({ books }) {
  const data = useMemo(() => {
    if (!books?.purchases) return [];
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (11 - i) * 7);
      return { label: bsShort(from), from: from.getTime(), to: from.getTime() + 7 * DAY, net: 0 };
    });
    const add = (iso, amount) => {
      const [y, m, d] = (iso || "").split("-").map(Number);
      const w = y ? weeks.find((x) => new Date(y, m - 1, d).getTime() >= x.from && new Date(y, m - 1, d).getTime() < x.to) : null;
      if (w) w.net += amount;
    };
    books.sales.forEach((s) => add(s.sale_date, revenue(s)));
    books.purchases.forEach((p) => add(p.purchase_date, -(p.purchase_price || 0)));
    return weeks.map((w) => ({ ...w, value: w.net }));
  }, [books]);
  if (books && !books.purchases) return null; // purchases are admin-only

  return (
    <Card testid="net-trend" title="Net trend" subtitle="Sales minus vehicle purchases, week by week · last 12 weeks">
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF0F3" strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 10.5, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={compactNpr} width={46} />
            <ReferenceLine y={0} stroke="#D9DDE3" />
            <Tooltip content={tip("Net", (v) => `${v < 0 ? "− " : ""}${formatNPR(Math.abs(v))}`, (v) => (v < 0 ? RED : GREEN))} cursor={{ fill: "#F1F5F9" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.value < 0 ? "#FCA5A5" : "#6EE7B7"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />Net in</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-300" />Net out</span>
      </div>
    </Card>
  );
}

// The two charts together, sharing one fetch.
export default function DashboardTrends({ children }) {
  const books = useBooks();
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><SalesTrendCard books={books} /></div>
        {children}
      </div>
    </>
  );
}
