import { useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useOutletContext } from "react-router-dom";
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
import { todayStr, CASH } from "./finance/money";

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
  const { loading, setupMessage, loadError, books } = useBooks();
  const { titleSlot } = useOutletContext() || {}; // the app's top bar, where the page's name goes
  const [params, setParams] = useSearchParams();
  const [bookDate, setBookDate] = useState(todayStr());
  const tab = financeTab(params.get("tab"));
  const partyId = params.get("party");
  const accountId = params.get("account");
  const editId = params.get("edit"); // a saved sale / purchase bill opened in its form to be changed (?tab=sales&edit=<id>)

  const goTab = (t) => setParams({ tab: t }, { replace: false });
  const editBill = (type, id) => setParams({ tab: type === "sale" ? "sales" : "purchases", edit: id });
  const openParty = (id) => setParams({ tab: "ledger", party: id });
  const setPartyId = (id) => setParams(id ? { tab: "ledger", party: id } : { tab: "ledger" });
  const setAccountId = (id) => setParams(id ? { tab: "banks", account: id } : { tab: "banks" });
  // A sales / purchase / expenses report of one person, from their ledger (?party= narrows the report).
  const openReport = (kind, id) => setParams({ tab: `${kind}-report`, party: id });
  // The Payment form with this person already picked (the Payment button on their ledger page).
  const payParty = (id) => setParams({ tab: "paid", party: id });
  const onPartyPage = tab === "ledger" && !!partyId && !!books?.parties?.some((p) => p.id === partyId);
  // An account's own page (?tab=banks&account=cash or a bank account's id), opened from its card on Bank Accounts.
  const onAccountPage = tab === "banks" && !!accountId && (accountId === CASH || !!books?.accounts?.some((a) => a.id === accountId));
  const showEveryone = () => setParams({ tab: tab });

  // The page's name sits in the app's top bar, like every other page's. A person's ledger page and an account's page put their own
  // there instead (a back arrow and a name: see PartyDetail in finance/Ledger.jsx and finance/AccountDetail.jsx).
  const heading = titleSlot && !onPartyPage && !onAccountPage
    ? createPortal(<h1 className="min-w-0 truncate text-2xl font-bold text-slate-900" data-testid="header-title">{titleOf(tab)}</h1>, titleSlot)
    : null;
  const wrap = (node) => <>{heading}{node}</>;

  if (loading) return wrap(<div className="flex items-center justify-center h-48"><div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" /></div>);
  if (setupMessage) return wrap(<SetupNotice message={setupMessage} />);
  if (loadError) return wrap(<Notice tone="red">{loadError}</Notice>);

  const screens = {
    "balance-sheet": <BalanceSheet goTab={goTab} openParty={openParty} />,
    daybook: <DayBook date={bookDate} setDate={setBookDate} goTab={goTab} openParty={openParty} editBill={editBill} />,
    statement: <Statement goTab={goTab} openParty={openParty} />,
    voucher: <Journal onDone={() => goTab("daybook")} />,
    contra: <Contra />,
    received: <Payment direction="received" />,
    paid: <Payment direction="paid" partyId={partyId} />,
    sales: <Bills type="sale" editId={editId} onDone={() => goTab("daybook")} />,
    purchases: <Bills type="purchase" editId={editId} onDone={() => goTab("daybook")} />,
    expenses: <Bills type="expense" />,
    ledger: <Ledger partyId={partyId} setPartyId={setPartyId} openReport={openReport} payParty={payParty} goTab={goTab} />,
    banks: <BankAccounts accountId={accountId} setAccountId={setAccountId} openParty={openParty} />,
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
      {heading}
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
