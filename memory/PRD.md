# Hamro G&G Auto OS — Product Requirements Document

## Original Problem Statement
Build "Hamro G&G Auto OS", an advanced AI-powered automobile dealership management platform for Nepal, managing second-hand bikes/scooters. Core constraints: clean professional light theme, English language, NPR currency, BS (Bikram Sambat) date system.

## 18 Core Modules
1. Inventory Management
2. Vendor Management
3. AI Pricing Engine
4. Stock Aging
5. Customer CRM
6. Sales Management
7. Staff & Mechanic Management
8. Finance & Accounting
9. Partner Dashboard
10. EMI Calculator
11. Legal Documents
12. Website Sync
13. Marketing Automation
14. Communication Center
15. QR Vehicle System
16. AI Chatbot
17. Nepal Festival Intelligence
18. Executive Dashboard

## Tech Stack
- Frontend: React (CRA), Tailwind CSS, shadcn/UI, Recharts
- Backend: FastAPI (Python), MySQL (`DB_BACKEND=mysql`, via `backend/sqldb.py`) in production;
  MongoDB remains supported as a documented fallback (`DB_BACKEND=mongo`, the code default) for
  spinning up a fresh environment without your own DB server — see `DEPLOYMENT.md`
- Auth: JWT (sessionStorage)
- AI: Google AI Studio Gemini key (`GEMINI_API_KEY`, via `google-genai`) — not the old Emergent LLM Key
- Dates: BS (Bikram Sambat) via `@sbmdkl/nepali-date-converter`
- QR: `qrcode.react`
- File Uploads: python-multipart
- Deployment: Vercel (frontend) + self-hosted VPS (backend, FastAPI under PM2 behind nginx) —
  see `DEPLOYMENT.md`; this app no longer runs on Render

## Code Architecture
```
/app/
├── backend/
│   ├── server.py              # FastAPI app (~1355 lines)
│   └── requirements.txt
├── frontend/src/
│   ├── App.js
│   ├── context/AuthContext.jsx
│   ├── utils/api.js, helpers.js, nepali-date.js
│   ├── components/BSDatePicker.jsx, VendorAutocomplete.jsx, Layout.jsx
│   └── pages/
│       ├── Inventory.jsx        # uses AddVehicleModal.jsx
│       ├── AddVehicleModal.jsx
│       ├── VehicleDetail.jsx    # uses VehicleModals.jsx
│       ├── VehicleModals.jsx
│       ├── SpareParts.jsx       # Use/Sell modal + transaction log
│       ├── JobCards.jsx         # parts search + auto-deduct
│       ├── Dashboard.jsx, Finance.jsx, Reports.jsx
│       ├── AIAssistant.jsx, Marketing.jsx, EMI.jsx
│       ├── Customers.jsx, Vendors.jsx
│       └── ...other pages
└── memory/PRD.md, test_credentials.md
```

## What's Implemented (as of Feb/Jul 2026)

### All 18 Modules — Feature Complete
- Full CRUD for vehicles (Inventory), vendors, customers, job cards, spare parts
- AI Pricing, AI Festival Intelligence, AI Chatbot (Gemini Flash via Emergent LLM Key)
- QR Code generation per vehicle
- BS (Nepali) date system globally
- File uploads: vehicle photos, legal documents (Bluebook, Insurance)
- Vendor autocomplete search
- Marketing AI captions
- Finance dashboard: revenue, COGS, profit, partner splits
- EMI calculator with payment tracking
- Website sync simulation
- JWT auth via sessionStorage

### Spare Parts — Vendor Combobox (Jul 2026)
- "Supplier" field replaced with searchable combobox bound to Vendors database
- Stores `vendor_id` (UUID reference) instead of plain text; `GET /spare-parts` batch-enriches with `vendor_name`
- Legacy `supplier` text-only records display correctly as fallback
- Inline "Add New Vendor" button at bottom of dropdown creates a vendor without leaving the modal and auto-selects it
- `GET /vendors/search` returns all vendors when no query is provided (was capped at 8)
- **Use/Sell Part modal**: orange cart icon per row → deducts qty, logs reason (Sale/Used in Repair/Damaged/Return/Internal Use) + notes
- **Transaction history**: blue history icon → expandable inline row with full audit log (qty, reason, date, user)
- **Job Card Parts integration**: Create job card → search spare parts inventory → add parts with qty → auto-deducts stock on save → parts cost shown on job card
- Backend: `POST /api/spare-parts/{pid}/stock-out`, `GET /api/spare-parts/{pid}/transactions`, `part_transactions` collection

### Code Quality Fixes (Feb 2026)
- XSS, JWT, hook dependency, array index key fixes
- VehicleDetail → VehicleModals.jsx, Inventory → AddVehicleModal.jsx extraction
- Backend helper functions extracted for complexity

### Dead Stock Filter Bug (Feb 2026)
- Fixed `?aging=dead` route param ignored in Inventory.jsx
- Count vs list mismatch fixed, filter banner + clickable KPI cards on Reports

### Render Deployment Setup (Feb 2026) — superseded, see below
- Dockerfile with python:3.11-slim-bullseye (OpenSSL 1.1.1 for Atlas)
- certifi + dnspython for production DB connectivity
- DO NOT modify MONGO_URL logic or TLS CA configuration

### Migrated off Render to a self-hosted VPS
- Production backend now runs on a VPS under PM2 (nginx reverse proxy in front), with its own
  MySQL database (`DB_BACKEND=mysql`) — not Render, not MongoDB Atlas
- `render.yaml` and `backend/Dockerfile` removed (both were Render-only, unused since this move)
- MongoDB support (`DB_BACKEND=mongo`) is kept in the code as a documented fallback for a fresh
  environment with no DB server of its own — it's just not what production runs on
- Full setup/troubleshooting: `DEPLOYMENT.md`

### Sales Module (Jul 2026)
- **Record Sale**: link vehicle (available only) + optional customer → auto-marks vehicle as sold
- **Extra Expenses**: preset fees (Registration Transfer, Insurance Transfer, Road Tax, Bluebook Copy, Notary, Delivery) with editable amounts + unlimited custom expenses
- **Grand Total**: live-calculated (sale price + all expenses)
- Payment methods: Cash, Bank Transfer, EMI, Cheque, Digital Wallet
- Backend: GET/POST /api/sales, GET /api/sales/summary, DELETE /api/sales/{sid}

## Default Credentials
- Username: admin
- Password: admin123

## P0 / P1 / P2 Backlog

### P2 — Upcoming
- Communication Center (Module 14) — unified inbox UI
- EMI Calculator — full CRUD verification & payment history UI
- Multi-branch architecture expansion
- Partner Dashboard — profit split visualization
- Staff commission tracking
