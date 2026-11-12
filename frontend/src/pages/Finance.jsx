import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BooksProvider, useBooks } from "./finance/BooksContext";
import DayBook from "./finance/DayBook";
import Payment from "./finance/Payment";
import Bills from "./finance/Bills";
import Ledger from "./finance/Ledger";
import Statement from "./finance/Statement";
import Journal from "./finance/Journal";
import Contra from "./finance/Contra";
import BankAccounts from "./finance/BankAccounts";
import ImportStatement from "./finance/ImportStatement";
import { Report, Totals, MoneyMoved } from "./finance/Reports";
import { SalesReport, PurchaseReport, ExpenseReport, ReceivableReport, PayableReport, AgeingReport } from "./finance/ReportPages";
import Quotation from "./finance/Quotation";
import BalanceSheet from "./finance/BalanceSheet";
import { financeTab, FINANCE_NAV } from "./finance/nav";
import { Card, Notice } from "./finance/ui";
import { todayStr } from "./finance/money";

// Finance books, laid out like Jageer Nepal's Finance: Day Book (and its entry forms), Statement, Ledger, Bank
// Accounts, Quotation and Report. The sections are listed in the main side panel under Finance (see
// components/FinanceNavGroup.jsx and finance/nav.js); this page shows the one picked by ?tab=.

// Printing a screen should print the screen, not the app around it.
const PRINT_CSS = "@media print { aside, header, .fin-no-print { display: none !important; } main { padding: 0 !important; overflow: visible !important; } }";

// Every Finance table drawn as Jageer Nepal's BookTable: one bordered table, a grey header row of small bold
// titles, a rule between every cell, and compact rows. Scoped to the Finance page so nothing else changes.
const BOOK_CSS = `
.fin-book table { border-collapse: collapse; width: 100%; font-size: 13px; color: #111827; }
.fin-book thead th { background: #F9FAFB; color: #4B5563; font-size: 11.5px; font-weight: 700; text-transform: none; letter-spacing: 0;
  padding: 8px 10px; border-bottom: 1px solid #D1D5DB; white-space: nowrap; }
.fin-book tbody td, .fin-book tfoot td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; vertical-align: middle; }
.fin-book thead th + th, .fin-book tbody td + td, .fin-book tfoot td + td { border-left: 1px solid #E5E7EB; }
.fin-book tbody tr:last-child td { border-bottom: none; }
.fin-book tfoot td { background: #F9FAFB; font-weight: 700; border-top: 1px solid #D1D5DB; border-bottom: none; }
.fin-book tbody tr:hover td { background-color: #F8FAFC; }
`;

// The page's own name, as Jageer's top bar shows it.
const HIDDEN_TITLES = { "balance-sheet": "Balance Sheet", expenses: "Expenses", import: "Import Statement", totals: "Money In and Out", "total-received": "Total Received", "total-paid": "Total Paid" };
const titleOf = (tab) => {
  for (const item of FINANCE_NAV) {
    if (item.key === tab) return item.label;
    const child = (item.children || []).find((c) => c.key === tab);
    if (child) return child.label;
  }
  return HIDDEN_TITLES[tab] || "Finance";
};

function SetupNotice({ message }) {
  // The message names the file to run (the first migration, or the later rent one).
  const file = (message.match(/backend\/migration_[a-z_]+\.sql/) || ["backend/migration_add_finance_books.sql"])[0];
  const rentFile = file.includes("rent");
  return (
    <Card className="p-6 space-y-3 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">Finance books are not set up yet</h2>
      <p className="text-sm text-slate-600">{message}</p>
      <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
        <li>Open the file <code className="bg-slate-100 px-1 rounded">{file}</code> from the project.</li>
        <li>Run it once on the database. {rentFile ? "It only adds two tables and two columns for Rent and bill services, and changes nothing that exists." : <>It only adds nine new tables named <code className="bg-slate-100 px-1 rounded">fin_*</code> and changes nothing that exists.</>}</li>
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
  // A sales / purchase / expenses report of one person, from their ledger (?party= narrows the report).
  const openReport = (kind, id) => setParams({ tab: `${kind}-report`, party: id });
  const showEveryone = () => setParams({ tab: tab });

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (setupMessage) return <SetupNotice message={setupMessage} />;
  if (loadError) return <Notice tone="red">{loadError}</Notice>;

  const screens = {
    "balance-sheet": <BalanceSheet goTab={goTab} openParty={openParty} />,
    daybook: <DayBook date={bookDate} setDate={setBookDate} goTab={goTab} />,
    statement: <Statement goTab={goTab} openParty={openParty} />,
    voucher: <Journal onDone={() => goTab("daybook")} />,
    contra: <Contra />,
    received: <Payment direction="received" />,
    paid: <Payment direction="paid" />,
    sales: <Bills type="sale" />,
    purchases: <Bills type="purchase" />,
    expenses: <Bills type="expense" />,
    ledger: <Ledger partyId={partyId} setPartyId={setPartyId} openReport={openReport} goTab={goTab} />,
    banks: <BankAccounts />,
    import: <ImportStatement />,
    report: <Report goTab={goTab} />,
    totals: <Totals />,
    "total-received": <MoneyMoved dir="in" openParty={openParty} />,
    "total-paid": <MoneyMoved dir="out" openParty={openParty} />,
    "sales-report": <SalesReport partyId={partyId} onShowAll={showEveryone} />,
    "purchase-report": <PurchaseReport partyId={partyId} onShowAll={showEveryone} />,
    "expense-report": <ExpenseReport partyId={partyId} onShowAll={showEveryone} />,
    "receivable-report": <ReceivableReport openParty={openParty} />,
    "payable-report": <PayableReport openParty={openParty} />,
    "ageing-report": <AgeingReport openParty={openParty} />,
    quotation: <Quotation />,
  };

  return (
    <div className="min-w-0 w-full space-y-3.5">
      <h1 className="text-xl font-bold text-gray-900">{titleOf(tab)}</h1>
      {screens[tab]}
    </div>
  );
}

export default function Finance() {
  return (
    <BooksProvider>
      <style>{PRINT_CSS + BOOK_CSS}</style>
      <div className="fin-book animate-fade-in -m-4 lg:-m-6 p-3 lg:p-6 min-h-full bg-gray-50" data-testid="finance-page">
        <FinanceInner />
      </div>
    </BooksProvider>
  );
}
