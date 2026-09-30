import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import api from "../utils/api";
import { formatNPR } from "../utils/helpers";
import HoverADDate from "./HoverADDate";
import LedgerTable from "./LedgerTable";
import BillPrintModal from "./BillPrintModal";

// A vendor's statement, shown inline under their Ledger row: vehicles bought from them,
// spare-parts bills, payments made, and what's still owed. (Lived under Finance → Vendor
// Ledger before the Ledger tab took over customers / vendors / staff.)
export default function VendorStatement({ vendor, reloadKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printBill, setPrintBill] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/vendors/${vendor.id}/payments`)
      .then(r => setData(r.data))
      .catch(() => toast.error("Couldn't load this vendor's statement"))
      .finally(() => setLoading(false));
  }, [vendor.id, reloadKey]);

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map(i => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}
      </div>
    );
  }
  if (!data) return null;

  const vehiclesTotal = (data.vehicles || []).reduce((s, vh) => s + (vh.purchase_price || 0), 0);
  const partsTotal = (data.parts_bills || []).reduce((s, b) => s + (b.total || 0), 0);

  return (
    <div className="space-y-5">
      {(data.vehicles?.length || 0) + (data.parts_bills?.length || 0) === 0 && (
        <p className="text-xs text-slate-400">Nothing bought from {vendor.name} yet. Pick them as a vehicle's purchase source or a spare part's supplier and it shows up here.</p>
      )}

      {data.vehicles?.length > 0 && (
        <LedgerTable
          title="Vehicles bought"
          countLabel={`${data.vehicles.length} vehicle${data.vehicles.length !== 1 ? "s" : ""}`}
          headers={["Vehicle", "Reg. No.", "Bought", "Price"]}
          rows={data.vehicles
            .slice()
            .sort((a, b) => (b.purchase_date || "").localeCompare(a.purchase_date || ""))
            .map(vh => [
              `${vh.brand} ${vh.model} ${vh.year || ""}`.trim(),
              vh.registration_number ? <span className="font-mono">{vh.registration_number}</span> : "—",
              <HoverADDate date={vh.purchase_date} />,
              formatNPR(vh.purchase_price),
            ])}
          totalLabel="Vehicles total"
          totalValue={formatNPR(vehiclesTotal)}
        />
      )}

      {data.parts_bills?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Spare parts bills</p>
            <span className="text-[11px] text-slate-400">{data.parts_bills.length} bill{data.parts_bills.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            {data.parts_bills
              .slice()
              .sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || ""))
              .map((b, i) => (
                <details key={b.bill_no || i} className="group" data-testid="parts-bill-tile">
                  <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer list-none text-xs hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold text-slate-900 truncate">{b.bill_no}</span>
                    <span className="text-slate-500 whitespace-nowrap"><HoverADDate date={b.entry_date} /></span>
                    <span className="text-slate-400 hidden sm:inline">{b.items?.length || 0} item{b.items?.length === 1 ? "" : "s"}</span>
                    <span className="ml-auto font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatNPR(b.total)}</span>
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setPrintBill(b); }}
                      className="shrink-0 w-8 h-8 -my-1 flex items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title="Print bill"
                      aria-label={`Print bill ${b.bill_no}`}
                      data-testid="print-bill-tile-btn"
                    >
                      <Printer size={13} />
                    </button>
                  </summary>
                  <ul className="divide-y divide-slate-50 bg-slate-50/60">
                    {b.items?.map((it, j) => (
                      <li key={j} className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="text-slate-600">{it.name}{it.part_number ? ` (${it.part_number})` : ""} × {it.quantity}</span>
                        <span className="text-slate-500 tabular-nums whitespace-nowrap">{formatNPR(it.quantity * it.unit_cost)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </div>
          <div className="flex items-center justify-between px-3 pt-2 text-xs">
            <span className="font-semibold text-slate-500">Parts total</span>
            <span className="font-bold text-slate-900 tabular-nums">{formatNPR(partsTotal)}</span>
          </div>
        </div>
      )}

      <LedgerTable
        title="Payments made"
        countLabel={`${data.payments?.length || 0} payment${(data.payments?.length || 0) !== 1 ? "s" : ""}`}
        headers={["Date", "Notes", "Amount"]}
        rows={(data.payments || []).map(p => [<HoverADDate date={p.payment_date} />, p.notes || "—", formatNPR(p.amount)])}
        totalLabel="Total paid"
        totalValue={formatNPR(data.total_paid || 0)}
        empty="No payments recorded yet"
        accent="green"
      />

      {printBill && (
        <BillPrintModal bill={printBill} vendor={vendor} onClose={() => setPrintBill(null)} />
      )}
    </div>
  );
}
