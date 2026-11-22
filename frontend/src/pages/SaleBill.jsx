/**
 * SaleBill.jsx — a recorded sale as one compact table that fits the pop-up without scrolling. Thin lines throughout;
 * three bands in a fixed order:
 *   SALE (who, when, who sold it, lead)  ·  VEHICLE (what, plate, pass date)  ·  AMOUNT (charges | settled)
 * then Witness / Notes, and the admin-only shop figures.
 * Desktop: label | value | label | value. Phone: two columns, each label small above its value, long ones full width, and
 * Charges stacked over Settled — so nothing runs off the screen. (sm:contents lets one wrapper be a single stacked cell
 * on a phone and two table cells on desktop.)
 */
import { formatNPR } from "../utils/helpers";
import { SOURCE_LABEL } from "../utils/crm";
import HoverADDate from "../components/HoverADDate";

const Band = ({ children }) => (
  <div className="col-span-full bg-blue-50 text-blue-600 text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5">{children}</div>
);

// One label + value. wide: takes the whole row on a phone.
const Pair = ({ label, children, wide, mono }) => (
  <div className={`min-w-0 bg-white px-3 py-1.5 sm:contents ${wide ? "col-span-2" : ""}`}>
    <div className="text-[11px] sm:text-xs font-medium text-slate-500 sm:bg-slate-50 sm:px-3 sm:py-1.5 sm:whitespace-nowrap">{label}</div>
    <div className={`min-w-0 text-sm font-medium text-slate-900 break-words sm:bg-white sm:px-3 sm:py-1.5 ${mono ? "font-mono font-bold tracking-wide" : ""}`}>{children || <span className="text-slate-300">—</span>}</div>
  </div>
);

// A line of the Amount band: name left, figure right.
const Line = ({ name, amount, bold, red, green }) => (
  <div className={`flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${bold ? "bg-slate-50 font-bold" : "bg-white"}`}>
    <span className={`min-w-0 break-words ${bold ? "text-slate-900" : "text-slate-600"}`}>{name}</span>
    <span className={`shrink-0 tabular-nums text-right ${bold ? "" : "font-medium"} ${red ? "text-red-600" : green ? "text-green-700" : "text-slate-900"}`}>{amount}</span>
  </div>
);

// A column of the Amount band: its lines, then its total pushed to the bottom so both totals line up side by side.
const Column = ({ title, lines, total }) => (
  <div className="flex flex-col gap-px bg-slate-200">
    <div className="bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">{title}</div>
    {lines.map((l, i) => <Line key={i} {...l} />)}
    <div className="flex-1 bg-white" />
    <Line bold {...total} />
  </div>
);

export default function SaleBill({ sale }) {
  const extras = (sale.extra_expenses || []).filter((e) => Number(e.amount) > 0);
  const exchange = sale.exchange_valuation || 0;
  const exchangeName = [sale.exchange_brand, sale.exchange_model, sale.exchange_year, sale.exchange_reg_no && `(${sale.exchange_reg_no})`].filter(Boolean).join(" ");
  const due = sale.due_amount || 0;
  const lead = sale.lead_source && sale.lead_source !== "referral" ? [SOURCE_LABEL[sale.lead_source] || sale.lead_source, sale.lead_note].filter(Boolean).join(" · ") : "";
  const vehicleName = sale.vehicle_brand ? `${sale.vehicle_brand} ${sale.vehicle_model}` : sale.vehicle_info || "Vehicle removed";
  const spec = [sale.vehicle_year, sale.engine_cc && `${sale.engine_cc}cc`, sale.fuel_type].filter(Boolean).join(" · ");
  const witness = [sale.witness_name, sale.witness_phone, sale.witness_address, sale.witness_id_number && `ID ${sale.witness_id_number}`].filter(Boolean).join(" · ");

  const charges = [{ name: "Vehicle price", amount: formatNPR(sale.sale_price) }, ...extras.map((e) => ({ name: e.name, amount: formatNPR(e.amount) }))];
  const settled = [
    ...(exchange > 0 ? [{ name: <>Exchange{exchangeName && <span className="text-xs text-slate-400"> · {exchangeName}</span>}</>, amount: `− ${formatNPR(exchange)}` }] : []),
    ...[["Advance payment", sale.advance_payment], ["Paid by cash", sale.paid_cash], ["Paid by bank", sale.paid_bank]].filter(([, a]) => a > 0).map(([name, a]) => ({ name, amount: `− ${formatNPR(a)}` })),
  ];

  return (
    <div className="bg-white" data-testid="sale-bill">
      <div className="grid grid-cols-2 sm:grid-cols-[auto_1fr_auto_1fr] gap-px bg-slate-200 border border-slate-200">
        <Band>Sale</Band>
        <Pair wide label="Customer">{sale.customer_name}{sale.customer_contact && <span className="text-slate-500 font-normal"> · {sale.customer_contact}</span>}</Pair>
        <Pair label="Sale date">{sale.sale_date && <HoverADDate date={sale.sale_date} />}</Pair>
        <Pair label="Sold by">{sale.sold_by_name}</Pair>
        <Pair wide label="Lead">{[lead, sale.referred_by_name && `referred by ${sale.referred_by_name}`].filter(Boolean).join(" · ")}</Pair>

        <Band>Vehicle</Band>
        <Pair wide label="Vehicle">{vehicleName}</Pair>
        <Pair label="Reg. no." mono>{sale.registration_number}</Pair>
        <Pair label="Details">{spec}</Pair>
        <Pair wide label="Pass date">{sale.ownership_transfer_date && <HoverADDate date={sale.ownership_transfer_date} />}</Pair>

        <Band>Amount</Band>
        <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200">
          <Column title="Charges" lines={charges} total={{ name: "Grand total", amount: formatNPR(sale.total_amount) }} />
          <Column
            title="Settled" lines={settled}
            total={{ name: <>Amount due{due > 0 && sale.due_date && <span className="text-xs font-normal text-slate-500"> · by <HoverADDate date={sale.due_date} /></span>}</>, amount: due > 0 ? formatNPR(due) : "Paid in full", red: due > 0, green: due <= 0 }}
          />
        </div>

        {(witness || sale.notes) && (
          <>
            <Pair wide label="Witness">{witness}</Pair>
            <Pair wide label="Notes">{sale.notes}</Pair>
          </>
        )}

        {sale.profit !== undefined && (
          <>
            <Pair label="Investment">{formatNPR(sale.total_investment)}</Pair>
            <Pair label={sale.returned ? "Profit (sold)" : "Profit"}>
              <span className={`font-bold ${sale.profit < 0 ? "text-red-600" : "text-green-700"}`}>{formatNPR(sale.profit)}</span>
              {sale.profit_margin != null && <span className="text-xs font-normal text-slate-500"> · {sale.profit_margin}%</span>}
            </Pair>
          </>
        )}
      </div>
    </div>
  );
}
