import { Printer } from "lucide-react";
import { formatNPR } from "../utils/helpers";

export default function BillPrintModal({ bill, vendor, onClose }) {
  if (!bill) return null;
  const items = bill.items || [];
  const total = bill.total ?? items.reduce((s, it) => s + (it.quantity * it.unit_cost || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="no-print flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Purchase Bill</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg" data-testid="print-bill-btn">
              <Printer size={13} />Print
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
          </div>
        </div>

        <div className="print-area overflow-y-auto p-8">
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-6">
            <div>
              <div className="text-xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Hamro G&G Auto Enterprises</div>
              <div className="text-sm text-slate-500">Kathmandu, Nepal</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold uppercase tracking-wide text-slate-700">Purchase Bill</div>
              <div className="text-sm text-slate-500 mt-1">Bill No: <span className="font-semibold text-slate-800">{bill.bill_no}</span></div>
              <div className="text-sm text-slate-500">Date: <span className="font-semibold text-slate-800">{bill.entry_date || "—"}</span></div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Vendor</div>
            <div className="font-bold text-slate-900">{vendor?.name}</div>
            {vendor?.phone && <div className="text-sm text-slate-500">{vendor.phone}</div>}
            {vendor?.address && <div className="text-sm text-slate-500">{vendor.address}</div>}
          </div>

          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs w-10">#</th>
                <th className="text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs">Item</th>
                <th className="text-left font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs">Part No.</th>
                <th className="text-right font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs">Qty</th>
                <th className="text-right font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs">Rate</th>
                <th className="text-right font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 text-xs">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{it.name}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{it.part_number || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{it.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatNPR(it.unit_cost)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{formatNPR(it.quantity * it.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={5} className="px-3 py-2.5 text-right font-semibold text-slate-600">Total</td>
                <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{formatNPR(total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-2 gap-8 mt-16 pt-4">
            <div className="text-center">
              <div className="border-t border-slate-300 pt-2 text-xs text-slate-500">Received By</div>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-300 pt-2 text-xs text-slate-500">Authorized Signature</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
