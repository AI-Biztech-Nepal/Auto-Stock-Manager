import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BooksProvider, useBooks } from "./finance/BooksContext";
import Dashboard from "./finance/Dashboard";
import DayBook from "./finance/DayBook";
import Payment from "./finance/Payment";
import Bills from "./finance/Bills";
import Ledger from "./finance/Ledger";
import Statement from "./finance/Statement";
import BankAccounts from "./finance/BankAccounts";
import ImportStatement from "./finance/ImportStatement";
import Inventory from "./finance/Inventory";
import BusinessSummary from "./finance/BusinessSummary";
import Rent from "./finance/Rent";
import { Report, Totals } from "./finance/Reports";
import { SalesReport, PurchaseReport, ExpenseReport, ReceivableReport, PayableReport } from "./finance/ReportPages";
import { financeTab } from "./finance/nav";
import { Card, Notice } from "./finance/ui";
import { todayStr } from "./finance/money";

// Finance books, ported from the FINANCE project (and its later Rent and service-charge additions from FINANCE-NEPAL).
// The sections are listed in the main side panel under Finance (see components/FinanceNavGroup.jsx and
// finance/nav.js); this page shows the one picked by ?tab=.

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
  const tab = financeTab(params.get("tab"));
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
    statement: <Statement goTab={goTab} />,
    received: <Payment direction="received" />,
    paid: <Payment direction="paid" />,
    sales: <Bills type="sale" />,
    purchases: <Bills type="purchase" />,
    expenses: <Bills type="expense" />,
    rent: <Rent openParty={openParty} />,
    ledger: <Ledger partyId={partyId} setPartyId={setPartyId} />,
    banks: <BankAccounts />,
    import: <ImportStatement />,
    report: <Report />,
    totals: <Totals />,
    "sales-report": <SalesReport />,
    "purchase-report": <PurchaseReport />,
    "expense-report": <ExpenseReport />,
    "receivable-report": <ReceivableReport openParty={openParty} />,
    "payable-report": <PayableReport openParty={openParty} />,
    inventory: <Inventory />,
  };

  return <div className="min-w-0 w-full">{screens[tab]}</div>;
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
