import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import api from "../utils/api";
import { amountInWords } from "../utils/helpers";
import { formatBSDateNumeric } from "../utils/nepali-date";
import { useAuth } from "../context/AuthContext";

// Landscape A5 only while this modal is open, so other prints (bills, reports) keep their page size.
const RECEIPT_CSS = `
@page { size: A5 landscape; margin: 6mm; }
@media print {
  .print-area { padding: 0 !important; background: #fff !important; }
  .rcpt-sheet { filter: none !important; }
  .rcpt { --accent: #000 !important; --text: #000 !important; }
}
.rcpt-sheet { container-type: inline-size; width: 100%; min-width: 0; filter: drop-shadow(0 .4rem .8rem rgba(15,23,42,.18)); }
.rcpt {
  --accent: #c8102e; --text: #1a1a1a;
  aspect-ratio: 210 / 148; width: 100%; overflow: hidden; box-sizing: border-box;
  background: #fff; color: var(--text);
  padding: 3.4cqw 4cqw 3cqw; border: .25cqw solid var(--accent);
  display: grid; grid-template-rows: auto auto 1fr auto; row-gap: 1.6cqw;
  font-family: Manrope, "Segoe UI", Arial, sans-serif;
}
.rcpt > * { min-width: 0; }
.rcpt-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 2cqw; padding-bottom: 1.4cqw; border-bottom: .35cqw solid var(--accent); }
.rcpt-shop { margin: 0; font-weight: 800; font-size: 3.1cqw; line-height: 1; color: var(--accent); white-space: nowrap; }
.rcpt-addr { margin: 1cqw 0 0; font-weight: 500; font-size: 1.3cqw; }
.rcpt-title { font-weight: 800; font-size: 1.8cqw; letter-spacing: .2cqw; border: .25cqw solid var(--accent); padding: .8cqw 1.6cqw; white-space: nowrap; }
.rcpt-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 2cqw; }
.rcpt-serial { font-weight: 600; font-size: 1.9cqw; }
.rcpt-serial b { color: var(--accent); font-weight: 800; font-size: 2.8cqw; margin-left: .8cqw; }
.rcpt-fill { display: flex; align-items: baseline; gap: .8cqw; font-weight: 600; font-size: 1.7cqw; min-width: 0; }
.rcpt-fill .lbl { white-space: nowrap; }
.rcpt-fill .val { flex: 1; min-width: 0; border-bottom: .15cqw solid var(--text); padding: 0 .8cqw .2cqw; font-weight: 500; font-size: 2cqw; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rcpt-date { width: 30cqw; flex: none; }
.rcpt-body { display: flex; flex-direction: column; justify-content: space-evenly; min-height: 0; }
.rcpt-pair { display: grid; grid-template-columns: 1.5fr .6fr; column-gap: 3cqw; }
.rcpt-half { width: 62%; }
.rcpt-foot { display: grid; grid-template-columns: auto minmax(0,1fr) minmax(0,1fr); align-items: end; column-gap: 3cqw; }
.rcpt-amount { border: .3cqw solid var(--accent); padding: .9cqw 2cqw; display: flex; align-items: baseline; gap: 1cqw; }
.rcpt-amount .rs { font-weight: 700; font-size: 1.9cqw; }
.rcpt-amount .num { color: var(--accent); font-weight: 800; font-size: 3.6cqw; line-height: 1; }
.rcpt-sign { text-align: center; font-weight: 600; font-size: 1.5cqw; }
.rcpt-sign .space { height: 4cqw; border-bottom: .15cqw solid var(--text); margin-bottom: .6cqw; }
`;

const money = (n) => `${Number(n || 0).toLocaleString("en-IN")}/-`;

// Payment receipt for a booking deposit, laid out like the shop's printed receipt book.
// Red on screen, black on white when printed.
export default function BookingReceipt({ booking, onClose }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState({});
  useEffect(() => { api.get("/share/profile").then(r => setProfile(r.data || {})).catch(() => {}); }, []);
  if (!booking) return null;

  const date = formatBSDateNumeric(booking.booking_date);
  const vehicle = booking.vehicle_info || "vehicle";
  const contact = [profile.address, profile.contact_phone && `Phone: ${profile.contact_phone}`].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4" data-testid="booking-receipt-modal">
      <style>{RECEIPT_CSS}</style>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col">
        <div className="no-print flex items-center justify-between gap-3 p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Booking Receipt</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} data-testid="print-receipt-btn" className="flex items-center gap-2 h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg active:scale-95 transition-all">
              <Printer size={16} /> Print
            </button>
            <button onClick={onClose} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
          </div>
        </div>

        <div className="print-area overflow-y-auto p-4 sm:p-6 bg-slate-100">
          <div className="rcpt-sheet">
            <div className="rcpt">
              <div className="rcpt-head">
                <div>
                  <h2 className="rcpt-shop">{profile.business_name || user?.company_name || "Auto Stock Manager"}</h2>
                  {contact && <p className="rcpt-addr">{contact}</p>}
                </div>
                <div className="rcpt-title">PAYMENT RECEIPT</div>
              </div>

              <div className="rcpt-meta">
                <div className="rcpt-serial">Receipt No.<b>{booking.receipt_no ?? ""}</b></div>
                <div className="rcpt-fill rcpt-date"><span className="lbl">Date:</span><span className="val">{date}</span></div>
              </div>

              <div className="rcpt-body">
                <div className="rcpt-fill"><span className="lbl">Received with thanks from M/S</span><span className="val">{booking.customer_name}</span><span className="lbl">the sum</span></div>
                <div className="rcpt-fill"><span className="lbl">Nepalese Rupees</span><span className="val">{amountInWords(booking.booking_amount)}</span><span className="lbl">only</span></div>
                <div className="rcpt-pair">
                  <div className="rcpt-fill"><span className="lbl">against</span><span className="val">Booking deposit, {vehicle}</span></div>
                  <div className="rcpt-fill"><span className="lbl">dated</span><span className="val">{date}</span></div>
                </div>
                <div className="rcpt-fill rcpt-half"><span className="lbl">Cash / Cheque / Draft No.</span><span className="val">{booking.payment_method}</span></div>
              </div>

              <div className="rcpt-foot">
                <div className="rcpt-amount"><span className="rs">Rs.</span><span className="num">{money(booking.booking_amount)}</span></div>
                <div className="rcpt-sign"><div className="space" />Paid by</div>
                <div className="rcpt-sign"><div className="space" />Received by</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
