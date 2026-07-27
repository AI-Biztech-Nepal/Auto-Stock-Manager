/**
 * VehicleModals.jsx — extracted modal sub-components for VehicleDetail
 * Kept in the same pages/ directory for co-location.
 */
import { QRCodeSVG } from "qrcode.react";
import { formatNPR, EXPENSE_CATEGORIES } from "../utils/helpers";

// text-base (16px) on mobile stops iOS Safari auto-zooming the page on focus; h-10 gives a comfortable touch target
export const inp = "w-full h-10 sm:h-9 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
export const sel = "w-full h-10 sm:h-9 px-3 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

// Shared label+input wrapper used by both the Add Vehicle form and the Vehicle Detail edit
// form, so the two stay visually identical.
export const Field = ({ label, required, children, full }) => (
  <div className={full ? "col-span-1 sm:col-span-2" : ""}>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

// ── Expense Modal ──────────────────────────────────────────────────────
export function ExpenseModal({ onClose, onSubmit, form, setForm, saving }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Add Expense</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category <span className="text-red-500">*</span></label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={sel}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount (NPR) <span className="text-red-500">*</span></label>
            <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 5000" className={inp} data-testid="expense-amount-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Details..." className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inp} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60" data-testid="save-expense-btn">
              {saving ? "Saving..." : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Return Modal ───────────────────────────────────────────────────────
// activeSale is the vehicle's currently active (non-returned) sale, fetched via
// GET /vehicles/{vid}/active-sale — used only to preview the refund/retained split
// before submitting; the actual split is computed server-side from that same sale.
export function ReturnModal({ onClose, onSubmit, form, setForm, saving, activeSale }) {
  const pct = Number(form.refund_percentage);
  const hasValidPct = form.refund_percentage !== "" && !Number.isNaN(pct);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Record Return</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Assess the vehicle's condition and set what percentage of the sale amount{activeSale ? ` (${formatNPR(activeSale.total_amount)})` : ""} gets refunded to the customer. The rest is kept by the shop, and the sale is marked returned rather than deleted. There's no time limit — this works no matter how long ago it was sold.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Refund Percentage <span className="text-red-500">*</span></label>
            <input
              type="number" min="0" max="100" step="0.01"
              value={form.refund_percentage}
              onChange={e => setForm({ ...form, refund_percentage: e.target.value })}
              placeholder="e.g. 80"
              className={inp}
              data-testid="return-refund-percentage-input"
            />
          </div>
          {hasValidPct && activeSale && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-slate-700 space-y-0.5">
              <div>Refund to customer: <span className="font-semibold">{formatNPR(activeSale.total_amount * pct / 100)}</span></div>
              <div>Retained by shop: <span className="font-semibold">{formatNPR(activeSale.total_amount * (100 - pct) / 100)}</span></div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle Re-enters Stock As <span className="text-red-500">*</span></label>
            <select value={form.new_status} onChange={e => setForm({ ...form, new_status: e.target.value })} className={sel} data-testid="return-new-status-select">
              <option value="available">Available</option>
              <option value="unlisted">Unlisted</option>
              <option value="reserved">Reserved</option>
              <option value="in_repair">In Repair</option>
              <option value="scrap">Scrap</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Condition Notes</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Assessment details..." className={inp} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} data-testid="submit-return-btn" className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
              {saving ? "Recording..." : "Record Return"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── QR Label Modal ─────────────────────────────────────────────────────
export function QRLabelModal({ onClose, qrData }) {
  if (!qrData) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Vehicle QR Label</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4" id="qr-label-content">
          <div className="text-center">
            <div className="font-bold text-xl text-slate-900">{qrData.brand} {qrData.model}</div>
            <div className="text-sm text-slate-500">{qrData.year} · {qrData.engine_cc}cc · {qrData.fuel_type}</div>
          </div>
          <div className="p-3 bg-white border-2 border-slate-900 rounded-xl">
            <QRCodeSVG
              data-testid="vehicle-qr-code"
              value={JSON.stringify({ id: qrData.id, brand: qrData.brand, model: qrData.model, year: qrData.year, reg: qrData.registration_number, price: qrData.selling_price, contact: qrData.contact })}
              size={180}
              level="M"
            />
          </div>
          <div className="text-center space-y-1">
            {qrData.registration_number && <div className="text-sm font-mono font-bold text-slate-800">Reg: {qrData.registration_number}</div>}
            {qrData.selling_price && <div className="text-sm font-bold text-green-700">Price: {formatNPR(qrData.selling_price)}</div>}
            <div className="text-xs text-slate-400">Hamro G&G Auto Enterprises · Kathmandu</div>
          </div>
          <button
            onClick={() => window.print()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            data-testid="print-qr-btn"
          >
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
