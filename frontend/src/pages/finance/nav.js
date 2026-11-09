// The Finance section of the main side panel, laid out like Jageer Nepal's: Day Book (with every entry form
// under it), Statement, Ledger, Bank Accounts, Quotation, and Report with its family of reports nested under it.
// Expenses, Import, and the Total Received / Total Paid pages are not in the panel: they open from buttons on
// the pages they belong to.
import {
  BookOpen, FileText, Users, Landmark, FileSignature, BarChart3, TrendingUp, ShoppingCart, Receipt, Store, Clock,
  ArrowDownCircle, ArrowUpCircle, ShoppingBag, NotebookPen, ArrowLeftRight,
} from "lucide-react";

export const FINANCE_NAV = [
  {
    key: "daybook", label: "Day Book", icon: BookOpen,
    hideChildren: true, // for now the panel shows Day Book alone, without its dropdown; the pages still open from the Day Book's buttons and ?tab= links
    children: [
      { key: "received", label: "Received", icon: ArrowDownCircle },
      { key: "paid", label: "Paid", icon: ArrowUpCircle },
      { key: "sales", label: "Sales", icon: ShoppingBag },
      { key: "purchases", label: "Purchase", icon: ShoppingCart },
      { key: "voucher", label: "Voucher", icon: NotebookPen },
      { key: "contra", label: "Contra", icon: ArrowLeftRight },
    ],
  },
  { key: "statement", label: "Statement", icon: FileText },
  { key: "ledger", label: "Ledger", icon: Users },
  { key: "banks", label: "Bank Accounts", icon: Landmark },
  { key: "quotation", label: "Quotation", icon: FileSignature },
  {
    key: "report", label: "Report", icon: BarChart3,
    children: [
      { key: "sales-report", label: "Sales Report", icon: TrendingUp },
      { key: "purchase-report", label: "Purchase Report", icon: ShoppingCart },
      { key: "expense-report", label: "Expenses Report", icon: Receipt },
      { key: "receivable-report", label: "Receivable Report", icon: Users },
      { key: "payable-report", label: "Payable Report", icon: Store },
      { key: "ageing-report", label: "Ageing Report", icon: Clock },
    ],
  },
];

// Pages that are reached from a button, not from the panel, and the panel item each one belongs under.
// The Balance Sheet is Finance itself (what clicking Finance opens, as in Jageer Nepal), so no item lights up for it.
export const FINANCE_HIDDEN_TABS = {
  "balance-sheet": "", expenses: "daybook", import: "statement", totals: "report", "total-received": "ledger", "total-paid": "ledger",
};

export const FINANCE_DEFAULT_TAB = "balance-sheet";
export const FINANCE_TABS = [
  ...FINANCE_NAV.flatMap((i) => [i.key, ...(i.children || []).map((c) => c.key)]),
  ...Object.keys(FINANCE_HIDDEN_TABS),
];

// The tab a ?tab= value really opens, falling back to the default for anything unknown.
export const financeTab = (requested) => (FINANCE_TABS.includes(requested) ? requested : FINANCE_DEFAULT_TAB);
// The panel item to light up for a tab.
export const financeNavKey = (tab) => FINANCE_HIDDEN_TABS[tab] || tab;
