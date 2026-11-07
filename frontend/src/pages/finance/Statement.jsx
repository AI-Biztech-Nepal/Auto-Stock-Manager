import { FileSpreadsheet } from "lucide-react";
import Feed from "./Feed";
import NewEntryMenu from "./NewEntryMenu";
import { btnGhost } from "./ui";

// The Statement: every bill, payment and transfer, newest day first, filterable by type. New entries start
// from here (the same five-item menu as the Day Book) and a bank statement is imported from its button.
export default function Statement({ goTab }) {
  return (
    <div className="space-y-4">
      <div className="fin-no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Every bill, payment and transfer. Tap one to open or change it.</p>
        <div className="flex gap-2">
          <button onClick={() => goTab("import")} className={btnGhost} data-testid="statement-import"><FileSpreadsheet size={16} /> Import</button>
          <NewEntryMenu goTab={goTab} />
        </div>
      </div>
      <Feed defaultFilter="all" title="Statement" />
    </div>
  );
}
