// The Finance section of the main side panel, laid out like FINANCE-NEPAL's: Day Book, Ledger, Statement,
// Stock and Inventory, Bank Accounts, Rent, and Report with its family of reports nested under it.
// Received, Payment Out, Sales, Purchase and Expense are not in the panel: they open from the Day Book's
// "New entry" button (and from the Statement's; so are Journal Voucher and Contra), and Import from the
// Statement's Import button.
import {
  PieChart, LayoutDashboard, BookOpen, Users, FileText, Package, Landmark, Car, BarChart3, TrendingUp,
  ShoppingCart, Receipt, Store, Scale,
} from "lucide-react";

export const FINANCE_NAV = [
  { key: "summary", label: "Business Summary", icon: PieChart },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "balance-sheet", label: "Balance Sheet", icon: Scale },
  { key: "daybook", label: "Day Book", icon: BookOpen },
  { key: "ledger", label: "Ledger", icon: Users },
  { key: "statement", label: "Statement", icon: FileText },
  { key: "inventory", label: "Stock and Inventory", icon: Package },
  { key: "banks", label: "Bank Accounts", icon: Landmark },
  { key: "rent", label: "Rent", icon: Car },
  {
    key: "report", label: "Report", icon: BarChart3,
    children: [
      { key: "sales-report", label: "Sales Report", icon: TrendingUp },
      { key: "purchase-report", label: "Purchase Report", icon: ShoppingCart },
      { key: "expense-report", label: "Expenses Report", icon: Receipt },
      { key: "receivable-report", label: "Receivable Report", icon: Users },
      { key: "payable-report", label: "Payable Report", icon: Store },
    ],
  },
];

// Pages that are reached from a button, not from the panel, and the panel item each one belongs under.
export const FINANCE_HIDDEN_TABS = {
  received: "daybook", paid: "daybook", sales: "daybook", purchases: "daybook", expenses: "daybook", voucher: "daybook", contra: "daybook",
  import: "statement", totals: "report",
};

export const FINANCE_DEFAULT_TAB = "summary";
export const REPORT_FAMILY = FINANCE_NAV.find((i) => i.key === "report").children.map((c) => c.key);
export const FINANCE_TABS = [
  ...FINANCE_NAV.flatMap((i) => [i.key, ...(i.children || []).map((c) => c.key)]),
  ...Object.keys(FINANCE_HIDDEN_TABS),
];

// The tab a ?tab= value really opens, falling back to the default for anything unknown.
export const financeTab = (requested) => (FINANCE_TABS.includes(requested) ? requested : FINANCE_DEFAULT_TAB);
// The panel item to light up for a tab.
export const financeNavKey = (tab) => FINANCE_HIDDEN_TABS[tab] || tab;
