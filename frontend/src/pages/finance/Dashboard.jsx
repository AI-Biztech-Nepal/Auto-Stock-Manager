import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { BookOpen, Users, ArrowDownCircle, ArrowUpCircle, ShoppingCart, Receipt, Wallet, Landmark, FileSpreadsheet, Package, BarChart3 } from "lucide-react";
import { useBooks } from "./BooksContext";
import { AccountLines } from "./BankAccounts";
import { Card, Stat, Modal, Empty } from "./ui";
import { balances, owedTotals, profitLoss, receivedPaid, cashMovements, todayStr, addDays, npr, COLORS, CASH } from "./money";
import { getCurrentBSMonthRange, getCurrentBSYearRange } from "../../utils/nepali-date";

const SHORTCUTS = [
  ["daybook", "Day Book", BookOpen], ["ledger", "Ledger", Users], ["received", "Received", ArrowDownCircle], ["paid", "Payment Out", ArrowUpCircle],
  ["sales", "Sales", Receipt], ["purchases", "Purchase", ShoppingCart], ["expenses", "Expenses", Wallet], ["banks", "Bank Accounts", Landmark],
  ["import", "Import Statement", FileSpreadsheet], ["inventory", "Inventory", Package], ["report", "Report", BarChart3],
];

function OwedList({ title, rows, color, onOpen, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      {rows.length === 0 ? <Empty>Nobody. All settled.</Empty> : rows.map(({ party, amount }) => (
        <button key={party.id} onClick={() => onOpen(party.id)} className="w-full text-left py-2.5 border-t border-slate-100 first:border-t-0 flex items-center gap-3 hover:bg-slate-50 px-1 rounded">
          <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{party.name}</span>
          <span className="text-sm font-semibold" style={{ color }}>{npr(amount)}</span>
        </button>
      ))}
    </Modal>
  );
}

export default function Dashboard({ goTab, openParty }) {
  const { books } = useBooks();
  const [panel, setPanel] = useState(null);   // "balance" | "receive" | "give"
  const [lines, setLines] = useState(null);
  const [span, setSpan] = useState("7d");
  const bal = useMemo(() => balances(books), [books]);
  const owed = useMemo(() => owedTotals(books), [books]);
  const month = getCurrentBSMonthRange();
  const year = getCurrentBSYearRange();
  const pl = useMemo(() => profitLoss(books, month?.start, month?.end), [books, month?.start, month?.end]);
  const rp = useMemo(() => receivedPaid(books, year?.start, year?.end), [books, year?.start, year?.end]);

  const chart = useMemo(() => {
    const moves = cashMovements(books);
    if (span === "7d") {
      const days = Array.from({ length: 7 }, (_, i) => addDays(todayStr(), i - 6));
      return days.map((d) => ({ label: d.slice(5), in: moves.filter((m) => m.date === d && m.dir === "in").reduce((s, m) => s + m.amount, 0), out: moves.filter((m) => m.date === d && m.dir === "out").reduce((s, m) => s + m.amount, 0) }));
    }
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { label: d.toLocaleString("en", { month: "short" }), in: moves.filter((m) => m.date.startsWith(key) && m.dir === "in").reduce((s, m) => s + m.amount, 0), out: moves.filter((m) => m.date.startsWith(key) && m.dir === "out").reduce((s, m) => s + m.amount, 0) };
    });
  }, [books, span]);

  const accountRows = [{ id: CASH, name: "Cash in hand" }, ...books.accounts];

  return (
    <div className="space-y-5">
      <div onClick={() => setPanel("balance")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setPanel("balance")}
        className="rounded-2xl p-6 text-white cursor-pointer shadow-md bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-700">
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Available balance</div>
        <div className="text-3xl font-bold mt-1" style={{ fontFamily: "Manrope" }}>{npr(bal.total)}</div>
        <div className="text-xs opacity-80 mt-1">Cash and every bank account. Tap for the breakdown.</div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button onClick={() => setPanel("receive")} className="text-left rounded-xl p-4 border-2 border-emerald-200 bg-emerald-50 hover:border-emerald-400 transition">
          <div className="text-xs font-semibold uppercase text-emerald-700">To receive</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1" style={{ fontFamily: "Manrope" }}>{npr(owed.totalReceivable)}</div>
          <div className="text-xs text-emerald-700/70">{owed.owingMe.length} {owed.owingMe.length === 1 ? "person owes" : "people owe"} you</div>
        </button>
        <button onClick={() => setPanel("give")} className="text-left rounded-xl p-4 border-2 border-red-200 bg-red-50 hover:border-red-400 transition">
          <div className="text-xs font-semibold uppercase text-red-700">To give</div>
          <div className="text-2xl font-bold text-red-700 mt-1" style={{ fontFamily: "Manrope" }}>{npr(owed.totalPayable)}</div>
          <div className="text-xs text-red-700/70">You owe {owed.iOwe.length} {owed.iOwe.length === 1 ? "person" : "people"}</div>
        </button>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label={month ? "Sales (this month)" : "Sales"} value={pl.sale} color={COLORS.sale} />
        <Stat label={month ? "Purchase (this month)" : "Purchase"} value={pl.purchase} color={COLORS.purchase} />
        <Stat label={month ? "Expense (this month)" : "Expense"} value={pl.expense} color={COLORS.out} />
        <Stat label="Total received (year)" value={rp.received} color={COLORS.in} />
        <Stat label="Total paid (year)" value={rp.paid} color={COLORS.out} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Cashflow</h3>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[["7d", "7 days"], ["6m", "6 months"]].map(([k, l]) => <button key={k} onClick={() => setSpan(k)} className={`h-7 px-3 rounded-md text-xs font-semibold ${span === k ? "bg-white shadow-sm text-blue-700" : "text-slate-500"}`}>{l}</button>)}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} width={40} />
              <Tooltip formatter={(v) => npr(v)} />
              <Legend />
              <Bar dataKey="in" name="Money in" fill={COLORS.in} radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Money out" fill={COLORS.out} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {SHORTCUTS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => goTab(k)} className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-md transition flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Icon size={18} /></span>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
          </button>
        ))}
      </div>

      {panel === "balance" && (
        <Modal title="Available balance" onClose={() => setPanel(null)}>
          {accountRows.map((a) => {
            const total = bal.buckets[a.id]?.total || 0;
            return (
              <button key={a.id} onClick={() => { setPanel(null); setLines({ title: a.name, bucket: bal.buckets[a.id] }); }} className="w-full flex justify-between py-2.5 border-t border-slate-100 first:border-t-0 hover:bg-slate-50 px-1 rounded text-sm">
                <span className="text-slate-800">{a.name}</span><span className="font-semibold" style={{ color: total < 0 ? COLORS.out : COLORS.balance }}>{npr(total)}</span>
              </button>
            );
          })}
          <div className="flex justify-between pt-3 mt-1 border-t-2 border-slate-200 text-sm font-bold"><span>Total</span><span style={{ color: COLORS.balance }}>{npr(bal.total)}</span></div>
        </Modal>
      )}
      {panel === "receive" && <OwedList title="Who owes you" rows={owed.owingMe} color={COLORS.in} onOpen={(id) => { setPanel(null); openParty(id); }} onClose={() => setPanel(null)} />}
      {panel === "give" && <OwedList title="Who you owe" rows={owed.iOwe} color={COLORS.out} onOpen={(id) => { setPanel(null); openParty(id); }} onClose={() => setPanel(null)} />}
      {lines && <AccountLines title={lines.title} bucket={lines.bucket} onClose={() => setLines(null)} />}
    </div>
  );
}
