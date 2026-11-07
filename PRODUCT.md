# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Also shipped to Android as a Capacitor WebView wrapper of the same web app — the design language stays web.)

## Users

- **Owner / admin** of a second-hand motorbike and scooter dealership in Nepal. Works at the showroom desk and on the phone (Android app), usually in short bursts between customers. Needs to know who owes money, how the month is going, and to record sales and payments quickly.
- **Front desk (stock_supervisor):** showroom-floor staff; view-only inventory, warranty follow-up, staff list.
- **Parts department (parts_supervisor):** spare parts, job cards, vendors and their payments, staff list.
- **Social media:** adds basic stock details and vehicle photos only.
- **Platform owner:** cross-company view only (multi-tenant SaaS; each company is one dealership).

## Product Purpose

An operating system for a used two-wheeler dealership: buy stock from vendors and individuals, repair and photograph it, sell it to customers with transfer paperwork, track money owed in both directions, and service vehicles under warranty after sale. Success is the owner never losing track of a due payment, a pending ownership transfer, or a vehicle's true profit.

## Positioning

Built around how a Nepali dealership actually runs: Bikram Sambat dates first, NPR amounts, name-transfer (ownership transfer) paperwork, sanakhat/re-sanakhat costs, and warranty service counts after sale — not a generic inventory or CRM tool.

## Operating Context

- Money flows: customers pay by cash, bank transfer and advance, often leaving a due amount with a due date; vendors are paid over time against vehicles and spare-parts bills.
- Sales can be returned (partial refund, vehicle re-enters stock).
- Historical sales are imported from the owner's "Sales Record" spreadsheet workbook.
- Monthly closing reports are downloaded as Excel per BS month.

## Capabilities and Constraints

- Frontend: React (CRA + craco), Tailwind, lucide icons, Recharts. Backend: FastAPI with a SQL-backed store. Frontend on Vercel, backend on a VPS.
- Navigation: Dashboard, Inventory, Marketing (Leads, CRM, Share, Offers, Visits), Sales (includes sold and returned vehicles), Spare Parts, Ledger (Customers, Vendors, Staff), Job Cards, Warranty, Reports, AI Assistant, Settings.
- EMI and Partners were removed from the app (backend data retained). Marketing came back as a group: Leads (website forms), Share, Offers, Visits, and the CRM.
- CRM (Marketing > CRM, admin only): every customer is a lead with a status (New, Contacted, Interested, Converted, Lost), a source, an assigned salesperson, follow-ups and a contact history. Converted is never typed in: it is what a customer is once a sale stands. The salesperson assigned to a customer is credited as the sale's Sold By. Clicking the customer cell opens their profile, where every action lives: call, WhatsApp, edit (in place, Save / Cancel), add a note, schedule a follow-up, delete. The Activity tab is one list of what is scheduled and what happened (contacts, finished follow-ups, purchases), and every contact and follow-up can be edited or deleted there. Deleting a customer who has sales or bookings asks a second time and keeps those records, just unlinked from anyone. The lead-source tabs show the sales amount per source (the Transaction Amount column added up); sales made without a customer are noted below them so the figures reconcile with the Dashboard. Website leads (Marketing > Leads) are each accepted or rejected (a reject needs a remark): accepting puts the person in the CRM with source Website (or links them if that phone is already a customer). The website asks visitors for a name and phone (address and e-mail optional) before WhatsApp / Call opens, and sends those with the tap. Backend: `backend/crm.py`.
- Role permissions are enforced on the backend; the frontend mirrors them in `frontend/src/utils/permissions.js`.
- Staff records carry no money balances (role, contact, commission rate, joining date, job counts only).

## Brand Commitments

- Keep the current look: light theme, dark slate sidebar, blue primary (#2563EB), Manrope for headings/figures, slate neutrals, status pills. Restructuring pages is fine; restyling the app is not.
- Nepali (BS) dates are primary; AD shown on hover.
- Currency always NPR via the shared formatter.

## Evidence on Hand

- Real operational data lives in the backend; no testimonials, benchmarks or marketing claims exist and none should be invented.
- `design_guidelines.json` records the original visual system.

## Product Principles

1. Familiar over clever: keep existing page layouts and extend them in place rather than redesigning around a new headline metric.
2. One place per concept: a sale and its sold vehicle are one record; every party (customer, vendor, staff) lives in the Ledger. The Ledger is a book of people (A–Z, open an entry to read it), not a debt tracker — balances are shown, never the headline.
3. Fast on a phone between customers: the key number and the next action fit the first screen.
4. Numbers must reconcile: the same figure never disagrees between two pages.
