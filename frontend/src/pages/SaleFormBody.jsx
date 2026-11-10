/**
 * SaleFormBody.jsx — the fields of the sale form (Sale, Payment, Exchange, Extra expenses, Notes), drawn from what
 * useSaleForm returns. SaleVehicleModal puts it in the Sale Vehicle window; SaleDetailModal puts the same body in a
 * sale's popup, read-only until Edit is pressed.
 */
import { Link } from "react-router-dom";
import { UserPlus, X, AlertCircle } from "lucide-react";
import { formatNPR } from "../utils/helpers";
import VehicleComboBox from "../components/VehicleComboBox";
import BSDatePicker from "../components/BSDatePicker";
import SourceField, { ReferredByField } from "../components/SourceField";
import SoldBySelect from "../components/SoldBySelect";
import { LBL, RO, BOX, OK, BAD, SECTION, H2, DATE_BOX, GRID, Money } from "../components/formKit";

// One row of the Buyer | Witness split. bid / wid: the ids of the two boxes.
const DEED_ROWS = [
  { label: "Name", ph: "Full name", bkey: "name", wkey: "witness_name", bid: "sv-buyer-name", wid: "sv-witness-name" },
  { label: "Address", ph: "Address", bkey: "address", wkey: "witness_address", bid: "sv-buyer-address", wid: "sv-witness-address" },
  { label: "Phone No.", ph: "Phone number", bkey: "contact_number", wkey: "witness_phone", bid: "sv-buyer-phone", wid: "sv-witness-phone" },
  { label: "Licence / Citizenship No.", ph: "Licence / citizenship no.", bkey: "id_number", wkey: "witness_id_number", bid: "sv-buyer-id", wid: "sv-witness-id" },
];

// The vehicle search box, sized like the other boxes (room on the left for its search icon and on the right for the arrow).
const COMBO = `peer w-full h-11 pl-9 pr-8 text-base sm:text-sm border rounded-[10px] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer disabled:bg-slate-50 disabled:cursor-default disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100`;
const PLATE = `w-full h-12 px-3.5 border border-slate-400 rounded-[10px] bg-white text-slate-900 font-mono text-lg font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 ${RO}`;

// A value shown in a box that cannot be typed in (a known buyer's details, a recorded witness).
const Static = ({ label, value }) => (
  <div className="min-w-0">
    <span className={LBL}>{label}</span>
    <div className="h-11 px-3 flex items-center text-sm text-slate-700 bg-white border border-slate-300 rounded-[10px] truncate">{value || "—"}</div>
  </div>
);

// f: what useSaleForm returns. booking: the booking being turned into this sale. sale: the recorded sale this is the form
// of (then everything can be edited: the buyer's details change the customer's record, the witness and the exchange change
// the sale and, for the exchange, the old vehicle's Inventory entry). readOnly: nothing can be changed. attempted: Save was
// pressed, so the fields still missing are marked.
export default function SaleFormBody({ f, booking = null, sale = null, readOnly = false, attempted = false }) {
  const { form, set } = f;
  const existing = !!sale;
  const bad = (id) => attempted && f.missing.some(m => m[0] === id);
  const ph = (text) => (readOnly ? "—" : text); // an empty box reads as a dash, not as a prompt, when nothing can be typed

  // Until the lists have loaded, a recorded sale still shows its own vehicle and customer.
  const vehicleList = existing && !f.listsLoaded
    ? [{ id: sale.vehicle_id, brand: sale.vehicle_brand, model: sale.vehicle_model, year: sale.vehicle_year, registration_number: sale.registration_number }]
    : f.vehicles;
  const buyerInfo = f.buyerInfo; // the picked customer's details (editable on a recorded sale), or null for a new buyer
  const hasWitness = existing && !!sale.witness_name;
  const showPanel = existing ? !!(buyerInfo || hasWitness) || f.showAddCust : !readOnly && f.showAddCust;
  const hasExchange = f.exchangeValuation > 0 || ["exchange_brand", "exchange_model", "exchange_reg_no", "exchange_year"].some(k => form[k]);
  const showDue = f.amountDue > 0 || !!form.due_date;

  return (
    <fieldset disabled={readOnly} className="min-w-0 m-0 p-0 border-0">
      {attempted && f.missing.length > 0 && (
        <div role="alert" className="mx-4 sm:mx-7 mt-5 flex gap-2.5 items-start rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-800" data-testid="sale-missing">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div><strong>{f.missing.length} {f.missing.length === 1 ? "thing needs" : "things need"} filling in</strong> before this can be saved: {f.missing.map(m => m[1]).join(", ")}.</div>
        </div>
      )}

      {/* 1 Sale: who is buying comes first (at the top, as Name does in Purchase Vehicle), then what and for how much */}
      <section id="sv-section-sale" className={SECTION}>
        <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Sale</h3>
        <div className={GRID}>
          <div className="sm:col-span-2">
            <label htmlFor="sv-customer" className={LBL}>Customer name</label>
            <div className="flex gap-2">
              <select id="sv-customer" value={form.customer_id} onChange={e => set({ customer_id: e.target.value })} className={`${BOX} ${OK}`} data-testid="sale-customer-select">
                <option value="">Walk-in / No customer record</option>
                {form.customer_id && !f.selectedCustomer && <option value={form.customer_id}>{sale?.customer_name || "Customer"}</option>}
                {f.customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.contact_number}</option>
                ))}
              </select>
              {!readOnly && (
                <button
                  type="button" onClick={() => f.setShowAddCust(s => !s)} aria-pressed={f.showAddCust} aria-label={existing ? "Add a new buyer" : "Add buyer and witness details"} title={existing ? "Add a new buyer" : "Add buyer + witness details"} data-testid="add-customer-inline-btn"
                  className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-[10px] border transition-colors ${f.showAddCust ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}
                >
                  <UserPlus size={16} />
                </button>
              )}
            </div>
            {!readOnly && <p className="mt-1 text-xs text-slate-500">{existing ? "Pick a customer, or press the person button to enter a new buyer" : "Pick a customer, or press the person button to enter a new buyer and the sale-deed witness"}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sv-vehicle" className={LBL}>Vehicle <span className="text-red-600">*</span></label>
            {booking ? (
              <div className="h-11 px-3 flex items-center text-sm bg-slate-50 border border-slate-300 rounded-[10px] text-slate-700">{booking.vehicle_info}</div>
            ) : (
              <VehicleComboBox
                vehicles={vehicleList}
                value={form.vehicle_id}
                onChange={id => set({ vehicle_id: id })}
                placeholder={ph("Search or select available vehicle...")}
                testId="sale-vehicle"
                showPrice
                inputId="sv-vehicle"
                inputClassName={`${COMBO} ${bad("sv-vehicle") ? BAD : OK}`}
              />
            )}
            {bad("sv-vehicle") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick the vehicle being sold</p>}
          </div>

          {showPanel && (
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-4" data-testid="add-customer-form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                {(buyerInfo || !readOnly) && (
                  <div className="min-w-0 space-y-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="buyer-details-panel">Buyer's details</p>
                    {DEED_ROWS.map(({ label, ph: hint, bkey, bid }) => {
                      if (buyerInfo && !existing) return <Static key={bkey} label={label} value={buyerInfo[bkey]} />;
                      const known = !!buyerInfo; // a recorded sale's customer: typing here edits the customer's record
                      return (
                        <div key={bkey} className="min-w-0">
                          <label htmlFor={bid} className={LBL}>{label}{bkey !== "id_number" && <span className="text-red-600"> *</span>}</label>
                          <input
                            id={bid} aria-label={`Buyer ${label}`} value={known ? buyerInfo[bkey] : f.buyer[bkey]}
                            onChange={e => (known ? f.setBuyerField(bkey, e.target.value) : f.setBuyer({ ...f.buyer, [bkey]: e.target.value }))}
                            placeholder={ph(hint)} className={`${BOX} ${bad(bid) ? BAD : OK}`} data-testid={`buyer-${bkey.replace(/_/g, "-")}`}
                          />
                        </div>
                      );
                    })}
                    {existing && buyerInfo && !readOnly && <p className="text-xs text-slate-500" data-testid="buyer-edit-hint">Changing these updates the customer's record, wherever it is used.</p>}
                  </div>
                )}
                {(!existing || hasWitness || !readOnly) && (
                  <div className="min-w-0 space-y-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide" data-testid="witness-details-panel">Witness details <span className="normal-case font-medium text-blue-600/80">· for the sale deed</span></p>
                    {DEED_ROWS.map(({ label, ph: hint, wkey, wid }) => (
                      <div key={wkey} className="min-w-0">
                        <label htmlFor={wid} className={LBL}>{label}{!existing && wkey !== "witness_id_number" && <span className="text-red-600"> *</span>}</label>
                        <input id={wid} aria-label={`Witness ${label}`} value={form[wkey]} onChange={e => set({ [wkey]: e.target.value })} placeholder={ph(hint)} className={`${BOX} ${bad(wid) ? BAD : OK}`} data-testid={wkey.replace(/_/g, "-")} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!readOnly && (buyerInfo ? (
                <button type="button" onClick={() => { set({ customer_id: "" }); f.setShowAddCust(true); }} className="text-xs font-semibold text-blue-600 hover:underline">
                  Enter a different buyer
                </button>
              ) : (
                <div className="flex justify-end">
                  <button type="button" onClick={f.saveNewCustomer} disabled={f.addingCust} data-testid="save-new-cust-btn" className="px-4 h-10 text-[13px] bg-blue-600 text-white rounded-[10px] hover:bg-blue-700 disabled:opacity-60 font-semibold">{f.addingCust ? "Saving..." : "Create & Select"}</button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="sv-sale_price" className={LBL}>Sale price <span className="text-red-600">*</span></label>
            <Money id="sv-sale_price" testid="sale-price-input" value={form.sale_price} onChange={v => set({ sale_price: v })} error={bad("sv-sale_price")} />
            {bad("sv-sale_price") && <p className="mt-1 text-xs font-semibold text-red-700">Enter the price it is sold for</p>}
          </div>
          <div>
            <span className={LBL}>Sale date (BS)</span>
            <BSDatePicker value={form.sale_date} onChange={val => set({ sale_date: val })} data-testid="sale-date-input" triggerClassName={`${DATE_BOX} ${OK}`} placeholder={readOnly ? "—" : "Today"} />
          </div>
          <div>
            <span className={LBL}>Vehicle pass date (BS)</span>
            <BSDatePicker value={form.ownership_transfer_date} onChange={val => set({ ownership_transfer_date: val })} data-testid="vehicle-pass-date-input" triggerClassName={`${DATE_BOX} ${OK}`} placeholder={readOnly ? "—" : undefined} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <span className={LBL}>Sold by</span>
            <SoldBySelect value={form.sold_by_id} onChange={v => set({ sold_by_id: v })} fallbackName={sale?.sold_by_name} className={`${BOX} ${OK}`} testid="sale-sold-by-select" />
          </div>

          <div id="sv-lead" tabIndex={-1} className="sm:col-span-2 outline-none" data-testid="sale-lead">
            <SourceField value={f.leadSource} onChange={f.setLeadSource} customers={f.customers} label="Lead" hideReferral size="lg" />
            {bad("sv-lead") && <p className="mt-1.5 text-xs font-semibold text-red-700">Pick a lead, or say who referred the buyer</p>}
          </div>
          <div className="sm:col-span-2">
            <ReferredByField value={f.referrer} onChange={f.setReferrer} customers={f.customers} size="lg" />
          </div>
        </div>
      </section>

      {/* 2 Payment */}
      <section id="sv-section-payment" className={SECTION}>
        <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Payment</h3>
        <div className={GRID}>
          <div>
            <label htmlFor="sv-advance" className={LBL}>Advance payment</label>
            <Money id="sv-advance" testid="advance-payment-input" value={form.advance_payment} onChange={v => set({ advance_payment: v })} />
          </div>
          <div>
            <label htmlFor="sv-cash" className={LBL}>Paid by cash</label>
            <Money id="sv-cash" testid="paid-cash-input" value={form.paid_cash} onChange={v => set({ paid_cash: v })} />
          </div>
          <div>
            <label htmlFor="sv-bank" className={LBL}>Paid by bank transfer</label>
            <Money id="sv-bank" testid="paid-bank-input" value={form.paid_bank} onChange={v => set({ paid_bank: v })} />
          </div>
          <div>
            <label htmlFor="sv-due" className={LBL}>Due amount</label>
            <Money id="sv-due" testid="due-amount-input" value={form.due_amount === "" ? f.autoDue : form.due_amount} onChange={v => set({ due_amount: v })} />
            {!readOnly && <p className="mt-1 text-xs text-slate-500">Auto: grand total − paid. Type to override.</p>}
          </div>
          {showDue && (
            <div>
              <span className={LBL}>Due date (BS)</span>
              <BSDatePicker value={form.due_date} onChange={val => set({ due_date: val })} data-testid="due-date-input" triggerClassName={`${DATE_BOX} ${OK}`} placeholder={readOnly ? "Not set" : undefined} />
            </div>
          )}
        </div>
      </section>

      {/* 3 Exchange: the customer's old vehicle; its valuation is deducted from what they owe. On a recorded sale it can be
          edited too: its Inventory entry follows while that is still unlisted and untouched. */}
      {(!existing || hasExchange || !readOnly) && (
        <section id="sv-section-exchange" className={SECTION} data-testid="exchange-section">
          <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>
            Exchange{" "}
            <span className="ml-1 text-xs font-medium text-slate-500" style={{ fontFamily: "Inter, sans-serif" }}>
              {existing
                ? <>{!readOnly && "a change also changes the old vehicle's entry in Inventory while it is still unlisted"}{sale.exchange_vehicle_id && <>{!readOnly && " · "}<Link to={`/inventory/${sale.exchange_vehicle_id}`} className="text-blue-600 hover:underline" data-testid="sale-exchange-inventory-link">In inventory</Link></>}</>
                : "optional · the old vehicle is added to Inventory when you save, at its valuation, unlisted until you set a selling price"}
            </span>
          </h3>
          <div className={GRID}>
            <div>
              <label htmlFor="sv-ex-valuation" className={LBL}>Valuation</label>
              <Money id="sv-ex-valuation" testid="exchange-valuation-input" value={form.exchange_valuation} onChange={v => set({ exchange_valuation: v })} />
            </div>
            <div>
              <label htmlFor="sv-ex-brand" className={LBL}>Brand</label>
              <input id="sv-ex-brand" value={form.exchange_brand} onChange={e => set({ exchange_brand: e.target.value })} placeholder={ph("")} className={`${BOX} ${OK}`} data-testid="exchange-brand-input" />
            </div>
            <div>
              <label htmlFor="sv-ex-model" className={LBL}>Model</label>
              <input id="sv-ex-model" value={form.exchange_model} onChange={e => set({ exchange_model: e.target.value })} placeholder={ph("")} className={`${BOX} ${OK}`} data-testid="exchange-model-input" />
            </div>
            <div>
              <label htmlFor="sv-ex-year" className={LBL}>Year</label>
              <input id="sv-ex-year" value={form.exchange_year} onChange={e => set({ exchange_year: e.target.value })} inputMode="numeric" placeholder={ph("")} className={`${BOX} ${OK}`} data-testid="exchange-year-input" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="sv-ex-reg" className={LBL}>Registration number</label>
              <input id="sv-ex-reg" value={form.exchange_reg_no} onChange={e => set({ exchange_reg_no: e.target.value })} placeholder={ph("e.g. 052/0164")} className={PLATE} data-testid="exchange-reg-input" />
            </div>
          </div>
        </section>
      )}

      {/* 4 Extra expenses */}
      <section id="sv-section-extras" className={SECTION}>
        <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>
          Extra expenses
          {f.extraExpenses.length > 0 && <span className="ml-2 align-middle text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold" style={{ fontFamily: "Inter, sans-serif" }}>{f.extraExpenses.length} added · {formatNPR(f.expensesTotal)}</span>}
        </h3>
        <div className={GRID}>
          {/* Sanakhat / re-sanakhat — always-there fields rather than presets, since nearly every sale has them and the
              amount varies */}
          <div>
            <label htmlFor="sv-sanakhat" className={LBL}>Sanakhat cost</label>
            <Money id="sv-sanakhat" testid="sale-sanakhat-cost-input" value={form.sanakhat_cost} onChange={v => set({ sanakhat_cost: v })} />
          </div>
          <div>
            <label htmlFor="sv-resanakhat" className={LBL}>Re-Sanakhat cost</label>
            <Money id="sv-resanakhat" testid="sale-resanakhat-cost-input" value={form.resanakhat_cost} onChange={v => set({ resanakhat_cost: v })} />
          </div>
          {!readOnly && (
            <>
              <div className="sm:col-span-2">
                <label htmlFor="sv-preset" className={LBL}>Add a preset fee</label>
                <select id="sv-preset" value={f.presetToAdd} onChange={e => f.addPresetExpense(e.target.value)} className={`${BOX} ${OK}`} disabled={f.availablePresets.length === 0} data-testid="preset-expense-select">
                  <option value="">{f.availablePresets.length === 0 ? "All preset fees added" : "Select a fee to add..."}</option>
                  {f.availablePresets.map(e => (
                    <option key={e.name} value={e.name}>{e.name} — {formatNPR(e.amount)}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="sv-custom-name" className={LBL}>Custom expense</label>
                <input
                  id="sv-custom-name" value={f.newExpName} onChange={e => f.setNewExpName(e.target.value)} placeholder="Expense name"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); f.addCustomExpense(); } }}
                  className={`${BOX} ${OK}`} data-testid="custom-exp-name"
                />
              </div>
              <div>
                <label htmlFor="sv-custom-amount" className={LBL}>Amount</label>
                <Money id="sv-custom-amount" testid="custom-exp-amount" value={f.newExpAmt} onChange={f.setNewExpAmt} />
              </div>
              <div>
                <span className={`${LBL} hidden lg:block`} aria-hidden="true">&nbsp;</span>
                <button type="button" onClick={f.addCustomExpense} className="w-full h-11 border border-dashed border-slate-400 rounded-[10px] bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50" data-testid="add-custom-exp-btn">Add expense</button>
              </div>
            </>
          )}

          {f.expenseItems.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4 rounded-[10px] border border-slate-200 divide-y divide-slate-100" data-testid="added-expenses">
              {f.expenseItems.map((ex, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-slate-700 min-w-0 truncate">{ex.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-semibold text-slate-500">Rs.</span>
                    <input
                      type="text" inputMode="numeric" value={ex.amount} aria-label={`${ex.name} amount`}
                      onChange={ev => f.updateExpenseAmount(i, ev.target.value)}
                      className="w-28 h-9 px-2 text-sm text-right border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100"
                    />
                    {!readOnly && <button type="button" onClick={() => f.removeExpenseItem(i)} aria-label={`Remove ${ex.name}`} className="w-9 h-9 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"><X size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5 Notes */}
      <section id="sv-section-notes" className={SECTION}>
        <h3 className={H2} style={{ fontFamily: "Manrope, sans-serif" }}>Notes</h3>
        <label htmlFor="sv-notes" className="sr-only">Notes</label>
        <textarea
          id="sv-notes" value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder={ph("Anything worth remembering about this sale")} rows={3}
          className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-300 rounded-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50 disabled:text-slate-900 disabled:[-webkit-text-fill-color:#0f172a] disabled:opacity-100"
        />
      </section>
    </fieldset>
  );
}
