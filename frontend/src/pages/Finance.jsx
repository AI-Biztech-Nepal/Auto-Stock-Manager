import { Wallet } from "lucide-react";

// Finance, emptied: its pages were taken out of the app to be rebuilt. The books themselves are untouched:
// the fin_* tables and the /fin API (backend/finance_books.py) are still there, so nothing entered is lost.
export default function Finance() {
  return (
    <div className="space-y-5 animate-fade-in" data-testid="finance-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
        <p className="text-sm text-slate-500">Your books: who owes whom, where the money sits, and what came in and went out each day.</p>
      </div>
      <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center text-center">
        <Wallet size={28} className="text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">No Finance pages yet</p>
        <p className="mt-1 text-xs text-slate-400">Nothing has been deleted from the books.</p>
      </div>
    </div>
  );
}
