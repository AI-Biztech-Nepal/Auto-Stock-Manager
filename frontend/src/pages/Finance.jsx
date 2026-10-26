import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, ArrowDownCircle, ArrowUpCircle, Receipt, ShoppingCart, Wallet, Users, Landmark,
  FileSpreadsheet, BarChart3, TrendingUp, Package, PieChart,
} from "lucide-react";
import { BooksProvider, useBooks } from "./finance/BooksContext";
import Dashboard from "./finance/Dashboard";
import DayBook from "./finance/DayBook";
import Payment from "./finance/Payment";
import Bills from "./finance/Bills";
import Ledger from "./finance/Ledger";
import BankAccounts from "./finance/BankAccounts";
import ImportStatement from "./finance/ImportStatement";
import Inventory from "./finance/Inventory";
import BusinessSummary from "./finance/BusinessSummary";
import { Report, Totals } from "./finance/Reports";
import { Card, Notice } from "./finance/ui";
import { todayStr } from "./finance/money";

// Finance books, ported from the FINANCE project. The whole side panel is visible at once, no dropdowns.
const GROUPS = [
  { title: "Overview", items: [["summary", "Business Summary", PieChart], ["dashboard", "Dashboard", LayoutDashboard], ["daybook", "Day Book", BookOpen]] },
  { title: "Entries", items: [["received", "Received", ArrowDownCircle], ["paid", "Payment Out", ArrowUpCircle], ["sales", "Sales", Receipt], ["purchases", "Purchases", ShoppingCart], ["expenses", "Expenses", Wallet]] },
  { title: "Accounts", items: [["ledger", "Ledger", Users], ["banks", "Bank Accounts", Landmark], ["import", "Import Statement", FileSpreadsheet]] },
  { title: "Reports", items: [["report", "Report", BarChart3], ["totals", "Totals", TrendingUp], ["inventory", "Inventory", Package]] },
];
const TAB_KEYS = GROUPS.flatMap((g) => g.items.map((i) => i[0]));

// Printing a screen should print the screen, not the app around it.
const PRINT_CSS = "@media print { aside, header, .fin-no-print { display: none !important; } main { padding: 0 !important; overflow: visible !important; } }";

function SetupNotice({ message }) {
  return (
    <Card className="p-6 space-y-3 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">Finance books are not set up yet</h2>
      <p className="text-sm text-slate-600">{message}</p>
      <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
        <li>Open the file <code className="bg-slate-100 px-1 rounded">backend/migration_add_finance_books.sql</code> from the project.</li>
        <li>Run it once on the database. It only adds nine new tables named <code className="bg-slate-100 px-1 rounded">fin_*</code> and changes nothing that exists.</li>
        <li>Reload this page.</li>
      </ol>
    </Card>
  );
}

function FinanceInner() {
  const { loading, setupMessage, loadError } = useBooks();
  const [params, setParams] = useSearchParams();
  const [bookDate, setBookDate] = useState(todayStr());
  const requested = params.get("tab");
  const tab = TAB_KEYS.includes(requested) ? requested : "summary";
  const partyId = params.get("party");

  const goTab = (t) => setParams({ tab: t }, { replace: false });
  const openParty = (id) => setParams({ tab: "ledger", party: id });
  const setPartyId = (id) => setParams(id ? { tab: "ledger", party: id } : { tab: "ledger" });

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (setupMessage) return <SetupNotice message={setupMessage} />;
  if (loadError) return <Notice tone="red">{loadError}</Notice>;

  const screens = {
    summary: <BusinessSummary />,
    dashboard: <Dashboard goTab={goTab} openParty={openParty} />,
    daybook: <DayBook date={bookDate} setDate={setBookDate} goTab={goTab} />,
    received: <Payment direction="received" />,
    paid: <Payment direction="paid" />,
    sales: <Bills type="sale" />,
    purchases: <Bills type="purchase" />,
    expenses: <Bills type="expense" />,
    ledger: <Ledger partyId={partyId} setPartyId={setPartyId} />,
    banks: <BankAccounts />,
    import: <ImportStatement />,
    report: <Report />,
    totals: <Totals />,
    inventory: <Inventory />,
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Pinned while the page scrolls: a bar under the header on phones, a left rail on desktop.
          The rail has its own scroll so every section stays reachable on a short screen. */}
      <nav className="fin-no-print w-[calc(100%+2rem)] lg:w-52 shrink-0 sticky top-0 z-20 bg-slate-50 -mx-4 px-4 py-2 lg:mx-0 lg:px-0 lg:py-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto border-b border-slate-200 lg:border-0" aria-label="Finance sections">
        <div className="flex lg:flex-col gap-x-1 overflow-x-auto lg:overflow-visible lg:pb-0 -mx-1 px-1">
          {GROUPS.map((g) => (
            <div key={g.title} className="flex lg:flex-col gap-1 lg:mb-3 shrink-0">
              <div className="hidden lg:block text-xs font-bold uppercase tracking-wider text-slate-400 px-3 mb-0.5">{g.title}</div>
              {g.items.map(([key, label, Icon]) => (
                <button key={key} onClick={() => goTab(key)} data-testid={`finance-tab-${key}`}
                  className={`flex items-center gap-2.5 h-10 px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0 w-full">{screens[tab]}</div>
    </div>
  );
}

export default function Finance() {
  return (
    <BooksProvider>
      <style>{PRINT_CSS}</style>
      <div className="space-y-5 animate-fade-in" data-testid="finance-page">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
          <p className="text-sm text-slate-500">Your books: who owes whom, where the money sits, and what came in and went out each day.</p>
        </div>
        <FinanceInner />
      </div>
    </BooksProvider>
  );
}
