from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, logging, jwt, uuid, json, base64, io, asyncio, re
from pydantic import BaseModel, Field
from PIL import Image, ImageOps
import pillow_heif
pillow_heif.register_heif_opener()  # lets Image.open() decode HEIC/HEIF from iPhone cameras
from google import genai
from google.genai import types as genai_types

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import certifi
from pymongo.server_api import ServerApi

# Force Python SSL to use certifi CA bundle (fixes Atlas TLS on Docker/Render)
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

mongo_url = os.environ['MONGO_URL']
_is_atlas = "mongodb+srv" in mongo_url or "mongodb.net" in mongo_url
client = AsyncIOMotorClient(
    mongo_url,
    tls=True,
    tlsCAFile=certifi.where(),
    server_api=ServerApi('1')
) if _is_atlas else AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'hamro-gng-2024')

# ── AI Assistant (Google Gemini) ────────────────────────────────────────
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
AI_MODEL = "gemini-3.5-flash"
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

app = FastAPI(title="Hamro G&G Auto OS", version="1.0.0")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.get("/api/health")
async def health(): return {"status": "ok", "service": "Hamro G&G Auto OS"}

# ── Auth Helpers ──────────────────────────────────────────────────────
def hash_pw(pw: str) -> str: return pwd_context.hash(pw)
def verify_pw(pw: str, hashed: str) -> bool: return pwd_context.verify(pw, hashed)

# bcrypt is CPU-bound and blocks the event loop; run it in a worker thread so one
# slow login doesn't stall every other concurrent request on this single-worker server.
async def hash_pw_async(pw: str) -> str: return await asyncio.to_thread(hash_pw, pw)
async def verify_pw_async(pw: str, hashed: str) -> bool: return await asyncio.to_thread(verify_pw, pw, hashed)

def create_token(user_id: str, username: str, role: str = "admin") -> str:
    return jwt.encode(
        {"user_id": user_id, "username": username, "role": role,
         "exp": datetime.now(timezone.utc) + timedelta(days=7)},
        JWT_SECRET, algorithm="HS256"
    )

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ── Role-based access control ─────────────────────────────────────────
# "admin" (Super admin) always has full access. Other roles only get what's
# listed here as {resource: {allowed actions}}; anything not listed is denied.
ROLE_PERMISSIONS = {
    "stock_supervisor": {  # Front desk stock
        "vehicles": {"view", "create", "edit"},
        "vehicle_media": {"view", "create", "delete"},
        "expenses": {"view", "create", "delete"},
        "jobs": {"view"},
        "customers": {"view", "create", "edit", "delete"},
        "sales": {"view", "create"},
        "team": {"view", "create", "edit", "delete"},
        "vendor_lookup": {"view"},  # read-only autocomplete when picking a vehicle's purchase source
    },
    "parts_supervisor": {  # Parts department
        "spare_parts": {"view", "create", "edit", "delete"},
        "jobs": {"view", "create", "edit", "delete"},
        "vehicles": {"view", "edit_status"},  # read-only vehicle data, plus limited pipeline-status changes (see PARTS_ALLOWED_STATUSES)
        "vehicle_media": {"view"},  # read-only, so opening a vehicle's detail page doesn't 403 loading photos/documents
        "vendor_lookup": {"view", "create"},  # supplier picker + inline "add new vendor" on a part
        "vendors": {"view", "edit", "delete", "manage_payments"},  # full Vendor Management tab access
        "team": {"view", "create", "edit", "delete"},
    },
}

# parts_supervisor's "edit_status" permission is intentionally narrower than full vehicle "edit":
# they can only move a vehicle between Available / In Repair (job cards require In Repair, see
# POST /jobs) and mark it Scrap. Sold/Reserved/Unlisted and all other vehicle fields stay
# restricted to admin / stock_supervisor.
PARTS_ALLOWED_STATUSES = {"available", "in_repair", "scrap"}

def require(resource: str, action: str):
    async def _checker(cu: dict = Depends(get_current_user)):
        role = cu.get("role", "admin")
        if role == "admin":
            return cu
        if action in ROLE_PERMISSIONS.get(role, {}).get(resource, set()):
            return cu
        raise HTTPException(403, "You do not have permission to perform this action")
    return _checker

def require_any(resource: str, actions: set):
    async def _checker(cu: dict = Depends(get_current_user)):
        role = cu.get("role", "admin")
        if role == "admin":
            return cu
        if ROLE_PERMISSIONS.get(role, {}).get(resource, set()) & actions:
            return cu
        raise HTTPException(403, "You do not have permission to perform this action")
    return _checker

async def admin_only(cu: dict = Depends(get_current_user)):
    if cu.get("role", "admin") != "admin":
        raise HTTPException(403, "This section is restricted to Super Admin accounts")
    return cu

def stock_aging(purchase_date_str: str) -> dict:
    try:
        s = str(purchase_date_str)
        d = datetime.fromisoformat(s.replace('Z', '+00:00')) if 'T' in s else datetime.strptime(s, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        days = (datetime.now(timezone.utc) - d).days
    except:
        days = 0
    if days <= 30:   return {"days": days, "category": "fresh",  "label": "Fresh Stock"}
    elif days <= 45: return {"days": days, "category": "normal", "label": "Normal"}
    elif days <= 60: return {"days": days, "category": "slow",   "label": "Slow Moving"}
    else:            return {"days": days, "category": "dead",   "label": "Dead Stock Alert"}

# Front desk stock can record purchase price at intake and manage expenses,
# but must never see the numbers that reveal profit on existing stock. They do see
# minimum_selling_price, though — they need the negotiation floor to work a sale.
FRONT_DESK_HIDDEN_VEHICLE_FIELDS = {
    "purchase_price", "total_investment", "expected_profit", "profit_margin",
    "low_margin", "accessories_cost",
}

# Parts department doesn't handle pricing or sales at all, so on top of the front-desk-hidden
# fields they also never see the selling price or minimum selling price.
PARTS_HIDDEN_VEHICLE_FIELDS = FRONT_DESK_HIDDEN_VEHICLE_FIELDS | {"selling_price", "minimum_selling_price"}

def _hide_financials_for_role(v: dict, role: str) -> dict:
    if role == "stock_supervisor":
        for f in FRONT_DESK_HIDDEN_VEHICLE_FIELDS:
            v.pop(f, None)
    elif role == "parts_supervisor":
        for f in PARTS_HIDDEN_VEHICLE_FIELDS:
            v.pop(f, None)
    return v

async def enrich_vehicle(v: dict) -> dict:
    v["aging"] = stock_aging(v.get("purchase_date", ""))
    exps = await db.expenses.find({"vehicle_id": v["id"]}, {"_id": 0}).to_list(200)
    total_exp = sum(e["amount"] for e in exps)
    v["total_expenses"] = total_exp
    v["total_investment"] = v.get("purchase_price", 0) + total_exp + v.get("accessories_cost", 0)
    sp = v.get("selling_price") or 0
    if sp > 0:
        v["expected_profit"] = sp - v["total_investment"]
        v["profit_margin"] = round((v["expected_profit"] / sp) * 100, 2)
        v["low_margin"] = v["profit_margin"] < 8
    else:
        v["expected_profit"] = None; v["profit_margin"] = None; v["low_margin"] = False
    return v

# Sold vehicles carry a 6-month warranty — a job card can still be opened against
# one after sale, as long as it's within that window from sold_date.
VEHICLE_WARRANTY_DAYS = 182  # ~6 months

def _within_warranty(vehicle: dict) -> bool:
    sold_date = vehicle.get("sold_date")
    if not sold_date: return False
    try:
        d = datetime.strptime(str(sold_date)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return False
    return 0 <= (datetime.now(timezone.utc) - d).days <= VEHICLE_WARRANTY_DAYS

# ── Helper: compute total investment for a vehicle ────────────────────
async def _vehicle_investment(vehicle_id: str, vehicle: dict) -> float:
    """Returns purchase_price + accessories + all expenses for a vehicle."""
    exps = await db.expenses.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(200)
    return vehicle.get("purchase_price", 0) + vehicle.get("accessories_cost", 0) + sum(e["amount"] for e in exps)

# For a sale returned via POST /vehicles/{vid}/return, only the retained (unrefunded) portion
# is real revenue — the rest went back to the customer. Every revenue/profit aggregate should
# read a sale's amount through this instead of "total_amount" directly.
def _sale_revenue(s: dict) -> float:
    return s.get("retained_amount", 0) if s.get("returned") else s.get("total_amount", 0)

# ── Helper: compute total amount owed to a vendor (payable) ──────────
async def _vendor_payable(vendor_id: str) -> float:
    """Returns max(0, total_purchased - total_paid) for a vendor."""
    veh = await db.vehicles.find({"vendor_id": vendor_id}, {"_id": 0}).to_list(200)
    owed = sum(v.get("purchase_price", 0) for v in veh)
    pmts = await db.vendor_payments.find({"vendor_id": vendor_id}, {"_id": 0}).to_list(200)
    paid = sum(p["amount"] for p in pmts)
    return max(0.0, owed - paid)

# ── Helper: compute total remaining balance for an EMI record ─────────
async def _emi_remaining(emi_id: str, loan_amount: float) -> float:
    pmts = await db.emi_payments.find({"emi_id": emi_id}, {"_id": 0}).to_list(200)
    paid = sum(p["amount"] for p in pmts)
    return max(0.0, loan_amount - paid)

# ── Helper: classify aging counts for a list of available vehicles ────
def _aging_counts(vehicles: list) -> dict:
    counts = {"fresh": 0, "normal": 0, "slow": 0, "dead": 0}
    for v in vehicles:
        cat = stock_aging(v.get("purchase_date", ""))["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return counts

# ── Helper: build ai_suggestions context data by type ────────────────
async def _build_suggestions_context(context_type: str) -> dict:
    if context_type == "inventory":
        vehicles = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(50)
        slow_list = []
        for v in vehicles:
            ag = stock_aging(v.get("purchase_date", ""))
            if ag["category"] in ["slow", "dead"]:
                exps = await db.expenses.find({"vehicle_id": v["id"]}, {"_id": 0}).to_list(50)
                slow_list.append({
                    "brand": v.get("brand"), "model": v.get("model"),
                    "days": ag["days"], "category": ag["category"],
                    "purchase_price": v.get("purchase_price"), "selling_price": v.get("selling_price"),
                    "total_investment": v.get("purchase_price", 0) + sum(e["amount"] for e in exps)
                })
        return {"available_count": len(vehicles), "slow_and_dead_stock": slow_list[:6]}
    if context_type == "finance":
        avail = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(500)
        locked = sum(v.get("purchase_price", 0) for v in avail)
        return {
            "locked_capital_NPR": locked,
            "total_vehicles": await db.vehicles.count_documents({}),
            "sold_vehicles": await db.vehicles.count_documents({"status": "sold"})
        }
    if context_type == "customer":
        custs = await db.customers.find({}, {"_id": 0}).to_list(20)
        return {"total_customers": len(custs), "customers": [{"name": c["name"], "contact": c.get("contact_number")} for c in custs[:8]]}
    if context_type == "festival":
        avail = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(50)
        return {"available_stock": len(avail), "vehicles": [{"brand": v.get("brand"), "model": v.get("model"), "price": v.get("selling_price")} for v in avail[:10]]}
    if context_type == "vendor":
        vendors = await db.vendors.find({}, {"_id": 0}).to_list(20)
        return {"total_vendors": len(vendors), "vendors_with_due": sum(1 for _ in vendors)}
    return {}

# ── AI Assistant (Gemini-powered) ──────────────────────────────────────
class AIChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class AIVehicleInput(BaseModel):
    brand: str; model: str; year: int
    engine_cc: Optional[int] = None
    fuel_type: Optional[str] = "Petrol"
    condition: Optional[str] = "Good"
    ownership_number: Optional[int] = 1
    kilometer_run: Optional[int] = None
    purchase_price: Optional[float] = None

class AIPriceRequest(BaseModel):
    vehicle: AIVehicleInput

class AISuggestionsRequest(BaseModel):
    context_type: str
    additional_context: Optional[str] = None

MARKDOWN_NOTE = 'Format your reply as plain text with **bold** for emphasis and "- " for bullet points only — no headers, links, or tables.'

async def _ai_text(system: str, contents, max_tokens: int = 1024) -> str:
    if not ai_client:
        raise HTTPException(503, "AI Assistant is not configured. Set GEMINI_API_KEY on the server.")
    resp = await ai_client.aio.models.generate_content(
        model=AI_MODEL, contents=contents,
        config=genai_types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
    )
    return resp.text or ""

@api_router.post("/ai/chatbot")
async def ai_chatbot(req: AIChatRequest, cu: dict = Depends(admin_only)):
    session_id = req.session_id or str(uuid.uuid4())
    session = await db.ai_chat_sessions.find_one({"id": session_id}, {"_id": 0})
    history = session["messages"] if session else []  # stored as [{"role": "user"|"assistant", "text": "..."}]

    settings = await db.settings.find_one({"id": "general"}, {"_id": 0}) or {}
    avail = await db.vehicles.find({"status": "available"}, {"_id": 0}).sort("created_at", -1).to_list(40)
    stock_lines = "\n".join(
        f"- {v.get('brand')} {v.get('model')} {v.get('year')} · {v.get('kilometer_run') or '?'}km · "
        f"{'Rs. ' + str(v['selling_price']) if v.get('selling_price') else 'price on request'}"
        for v in avail
    ) or "No vehicles currently in stock."

    system = (
        f"You are the sales assistant chatbot for {settings.get('business_name', 'Hamro G n G Auto')}, "
        "a used motorbike/scooter dealership in Nepal. Prices are in NPR. Be warm, concise, and helpful. "
        "Only discuss vehicles, prices, financing, and dealership services — politely decline unrelated requests.\n"
        f"Current available stock:\n{stock_lines}\n\n{MARKDOWN_NOTE}"
    )
    messages = history + [{"role": "user", "text": req.message}]
    # Gemini's role name for assistant turns is "model", not "assistant".
    contents = [
        genai_types.Content(role="model" if m["role"] == "assistant" else "user", parts=[genai_types.Part.from_text(text=m["text"])])
        for m in messages
    ]
    reply = await _ai_text(system, contents)
    messages.append({"role": "assistant", "text": reply})

    await db.ai_chat_sessions.update_one(
        {"id": session_id},
        {"$set": {"messages": messages[-20:], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"reply": reply, "session_id": session_id}

@api_router.post("/ai/price-suggestion")
async def ai_price_suggestion(req: AIPriceRequest, cu: dict = Depends(admin_only)):
    v = req.vehicle
    similar = await db.vehicles.find(
        {"status": "sold", "brand": {"$regex": f"^{v.brand}$", "$options": "i"}, "model": {"$regex": f"^{v.model}$", "$options": "i"}},
        {"_id": 0, "year": 1, "selling_price": 1, "kilometer_run": 1, "condition": 1, "sold_date": 1},
    ).sort("sold_date", -1).to_list(10)

    history_lines = "\n".join(
        f"- {s.get('year')} · {s.get('kilometer_run') or '?'}km · {s.get('condition') or '?'} condition · sold for Rs. {s.get('selling_price')}"
        for s in similar
    ) or "No sold-history records for this brand/model in this dealership."

    system = (
        "You are a pricing analyst for a Nepali used-motorbike dealership. Recommend a selling price range in NPR "
        "for the vehicle described, reasoning from the sold-history comparables given and the general Nepal used-bike market. "
        f"{MARKDOWN_NOTE}"
    )
    # ownership_number > 90 encodes a transcript (bluebook lost/damaged, duplicate copy
    # issued): TRANSCRIPT_BASE(90) + issue count — mirrors TRANSCRIPT_BASE in helpers.js.
    def _ordinal(n): return f"{n}{'st' if n == 1 else 'nd' if n == 2 else 'rd' if n == 3 else 'th'}"
    ownership_desc = f"on its {_ordinal(v.ownership_number - 90)} transcript bluebook (original lost/damaged)" if v.ownership_number > 90 \
        else f"{_ordinal(v.ownership_number)} owner"
    prompt = (
        f"Vehicle to price: {v.brand} {v.model} {v.year}, {v.engine_cc or '?'}cc {v.fuel_type}, "
        f"{ownership_desc}, {v.kilometer_run or '?'}km, "
        f"condition: {v.condition}, purchase price: Rs. {v.purchase_price or 'unknown'}.\n\n"
        f"Similar sold vehicles from this dealership's history:\n{history_lines}\n\n"
        "Give a recommended selling price range and a brief justification."
    )
    suggestion = await _ai_text(system, prompt)
    return {"suggestion": suggestion, "sold_history_count": len(similar)}

@api_router.get("/ai/festival-intelligence")
async def ai_festival_intelligence(cu: dict = Depends(admin_only)):
    avail = await db.vehicles.find({"status": "available"}, {"_id": 0, "brand": 1}).to_list(1000)
    stock_snapshot: dict = {}
    for v in avail:
        b = v.get("brand") or "Other"
        stock_snapshot[b] = stock_snapshot.get(b, 0) + 1

    today = datetime.now(timezone.utc).date().isoformat()
    system = (
        "You are a business intelligence advisor for a Nepali used-motorbike dealership. Nepali festivals "
        "(Dashain, Tihar, etc.) fall on the lunar Bikram Sambat calendar and shift each Gregorian year — give "
        f"approximate timing and say so explicitly rather than exact dates. {MARKDOWN_NOTE}"
    )
    prompt = (
        f"Today's date: {today}. Current available stock by brand: {json.dumps(stock_snapshot)}.\n\n"
        "Identify the nearest major upcoming Nepali festival(s) and give stock and pricing strategy advice for "
        "a used-bike dealership heading into that season — which brands/segments to push, and any pricing moves."
    )
    intelligence = await _ai_text(system, prompt)
    return {"intelligence": intelligence, "stock_snapshot": stock_snapshot}

@api_router.post("/ai/suggestions")
async def ai_suggestions(req: AISuggestionsRequest, cu: dict = Depends(admin_only)):
    context = await _build_suggestions_context(req.context_type)
    system = (
        "You are a business advisor for a Nepali used-motorbike dealership. Give concrete, actionable "
        f"recommendations grounded only in the data provided — do not invent numbers not given. {MARKDOWN_NOTE}"
    )
    prompt = f"Context ({req.context_type}): {json.dumps(context)}\n"
    if req.additional_context:
        prompt += f"\nAdditional note from the owner: {req.additional_context}\n"
    prompt += "\nGive your recommendations."
    suggestions = await _ai_text(system, prompt)
    return {"suggestions": suggestions}


class LoginRequest(BaseModel):
    username: str; password: str

class RegisterRequest(BaseModel):
    username: str; password: str = Field(min_length=8); name: str
    role: str = "sales_staff"

class ChangePasswordRequest(BaseModel):
    current_password: str; new_password: str = Field(min_length=8)

class VehicleCreate(BaseModel):
    brand: str; model: str
    variant: Optional[str] = None
    year: int; engine_cc: int
    fuel_type: str = "Petrol"
    vehicle_type: str = "bike"  # "bike" | "scooter" — drives hamroauto.com.np's type filter
    ownership_number: int = 1
    chassis_number: Optional[str] = None
    engine_number: Optional[str] = None
    kilometer_run: Optional[int] = None
    condition: str = "Good"
    condition_rating: int = 7
    color: Optional[str] = None
    registration_number: str
    purchase_price: float
    accessories_cost: float = 0
    purchase_date: str
    purchase_source: str
    vendor_id: Optional[str] = None
    purchase_from: Optional[str] = None
    selling_price: Optional[float] = None
    minimum_selling_price: Optional[float] = None
    notes: Optional[str] = None
    status: str = "unlisted"
    bluebook_status: str = "pending"
    insurance_status: str = "pending"
    tax_clearance_status: str = "pending"
    transfer_status: str = "pending"

class VehicleUpdate(BaseModel):
    brand: Optional[str] = None; model: Optional[str] = None
    variant: Optional[str] = None; year: Optional[int] = None
    engine_cc: Optional[int] = None; fuel_type: Optional[str] = None
    vehicle_type: Optional[str] = None
    ownership_number: Optional[int] = None
    chassis_number: Optional[str] = None; engine_number: Optional[str] = None
    kilometer_run: Optional[int] = None
    condition: Optional[str] = None; condition_rating: Optional[int] = None
    color: Optional[str] = None; registration_number: Optional[str] = None
    purchase_price: Optional[float] = None; accessories_cost: Optional[float] = None
    purchase_date: Optional[str] = None; purchase_source: Optional[str] = None
    vendor_id: Optional[str] = None; purchase_from: Optional[str] = None
    selling_price: Optional[float] = None; minimum_selling_price: Optional[float] = None
    notes: Optional[str] = None; status: Optional[str] = None
    sold_date: Optional[str] = None; customer_id: Optional[str] = None
    salesperson_id: Optional[str] = None; salesperson_name: Optional[str] = None
    discount: Optional[float] = None
    bluebook_status: Optional[str] = None; insurance_status: Optional[str] = None
    tax_clearance_status: Optional[str] = None; transfer_status: Optional[str] = None

class VehicleStatusUpdate(BaseModel):
    status: str

class VehicleReturnRequest(BaseModel):
    refund_percentage: float  # % of the sale's total_amount handed back to the customer, after condition assessment
    new_status: str = "available"  # where the vehicle re-enters stock: available / unlisted / reserved / scrap / in_repair
    notes: Optional[str] = None

class ExpenseCreate(BaseModel):
    vehicle_id: str; category: str; amount: float
    description: Optional[str] = None; date: Optional[str] = None

class JobCardCreate(BaseModel):
    vehicle_id: Optional[str] = None; is_external: bool = False
    # Only used when is_external is True — a walk-in repair vehicle we don't own,
    # so there's no inventory record to pull these from.
    vehicle_brand: Optional[str] = None; vehicle_model: Optional[str] = None
    vehicle_year: Optional[int] = None; registration_number: Optional[str] = None
    customer_name: Optional[str] = None; customer_contact: Optional[str] = None
    work_description: str
    mechanic_id: Optional[str] = None; mechanic_name: str
    estimated_cost: float; notes: Optional[str] = None
    coupon_no: int; job_date: str
    parts: List[dict] = []

class JobCardUpdate(BaseModel):
    work_description: Optional[str] = None; mechanic_name: Optional[str] = None
    estimated_cost: Optional[float] = None; actual_cost: Optional[float] = None
    status: Optional[str] = None; notes: Optional[str] = None
    parts: Optional[List[dict]] = None

class PartStockOut(BaseModel):
    quantity: int
    reason: str  # Sale | Used in Job Card | Damaged | Return
    date: Optional[str] = None
    job_id: Optional[str] = None
    customer_id: Optional[str] = None
    notes: Optional[str] = None

class SaleCreate(BaseModel):
    vehicle_id: str
    customer_id: Optional[str] = None
    sale_price: float
    extra_expenses: List[dict] = []  # [{name: str, amount: float}]
    payment_method: str = "Cash"
    paid_cash: float = 0
    paid_bank: float = 0
    due_date: Optional[str] = None
    sale_date: Optional[str] = None
    notes: Optional[str] = None

class SaleUpdate(BaseModel):
    vehicle_id: str
    customer_id: Optional[str] = None
    sale_price: float
    extra_expenses: List[dict] = []  # [{name: str, amount: float}]
    payment_method: str = "Cash"
    paid_cash: float = 0
    paid_bank: float = 0
    due_date: Optional[str] = None
    sale_date: Optional[str] = None
    notes: Optional[str] = None

class SalePaymentCreate(BaseModel):
    amount: float
    method: str = "Cash"
    payment_date: Optional[str] = None
    notes: Optional[str] = None

class CustomerCreate(BaseModel):
    name: str; contact_number: str
    address: Optional[str] = None
    occupation: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    interested_brands: Optional[str] = None
    notes: Optional[str] = None

class TeamMemberCreate(BaseModel):
    name: str; role: str
    contact: Optional[str] = None
    specialization: Optional[str] = None
    commission_rate: Optional[float] = None
    joining_date: Optional[str] = None

class PartnerCreate(BaseModel):
    name: str; capital_contribution: float
    stake_percentage: float; contact: Optional[str] = None

class VendorCreate(BaseModel):
    name: str; phone: str
    address: Optional[str] = None
    notes: Optional[str] = None
    vendor_type: Optional[str] = "both"

class VendorPaymentCreate(BaseModel):
    vendor_id: str; amount: float
    vehicle_id: Optional[str] = None
    payment_date: Optional[str] = None
    notes: Optional[str] = None

class EMICreate(BaseModel):
    customer_id: str; vehicle_id: str
    loan_amount: float; down_payment: float
    interest_rate: float; tenure_months: int
    start_date: str
    financer_name: Optional[str] = None
    notes: Optional[str] = None

class EMIPaymentCreate(BaseModel):
    emi_id: str; amount: float
    payment_date: Optional[str] = None
    notes: Optional[str] = None

class LeadCreate(BaseModel):
    type: str  # "sell" | "exchange" | "service"
    name: str; phone: str
    message: Optional[str] = None
    images: Optional[List[str]] = None
    requested_service: Optional[str] = None  # "service" leads: e.g. "Oil Change"
    vehicle_type: Optional[str] = None  # "service" leads: e.g. "Bike - Pulsar 150"
    preferred_date: Optional[str] = None  # "service" leads: preferred servicing date

class LeadUpdate(BaseModel):
    status: str  # "new" | "contacted" | "closed"

class SettingsUpdate(BaseModel):
    logo_url: Optional[str] = None
    business_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    hero_image_url: Optional[str] = None
    service_image_url: Optional[str] = None

# ── AUTH ──────────────────────────────────────────────────────────────
@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"username": req.username})
    if not user or not await verify_pw_async(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = create_token(user.get("id", ""), user["username"], user.get("role", "admin"))
    return {"token": token, "username": user["username"], "name": user.get("name", user["username"]), "role": user.get("role", "admin")}

@api_router.get("/auth/me")
async def me(cu: dict = Depends(get_current_user)):
    user = await db.users.find_one({"username": cu["username"]}, {"_id": 0, "password_hash": 0})
    return user

@api_router.post("/auth/change-password")
async def change_password(req: ChangePasswordRequest, cu: dict = Depends(get_current_user)):
    user = await db.users.find_one({"username": cu["username"]})
    if not user or not await verify_pw_async(req.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password incorrect")
    await db.users.update_one({"username": cu["username"]}, {"$set": {"password_hash": await hash_pw_async(req.new_password)}})
    return {"message": "Password changed successfully"}

@api_router.get("/auth/users")
async def list_users(cu: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users

@api_router.post("/auth/register")
async def register(req: RegisterRequest, cu: dict = Depends(get_current_user)):
    if cu.get("role") != "admin":
        raise HTTPException(403, "Only admin can register users")
    existing = await db.users.find_one({"username": req.username})
    if existing:
        raise HTTPException(400, "Username already exists")
    user = {"id": str(uuid.uuid4()), "username": req.username,
            "password_hash": await hash_pw_async(req.password), "name": req.name, "role": req.role,
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(user)
    user.pop("_id", None); user.pop("password_hash", None)
    return user

# ── VEHICLES ──────────────────────────────────────────────────────────
@api_router.get("/vehicles")
async def get_vehicles(status: Optional[str] = None, brand: Optional[str] = None, cu: dict = Depends(require("vehicles", "view"))):
    q = {}
    if status and status != "all":
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        q["status"] = {"$in": statuses} if len(statuses) > 1 else statuses[0]
    if brand and brand != "all": q["brand"] = brand
    vehicles = await db.vehicles.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if not vehicles:
        return []
    # Batch-load all expenses in one query (avoids N+1)
    vehicle_ids = [v["id"] for v in vehicles]
    all_exps = await db.expenses.find({"vehicle_id": {"$in": vehicle_ids}}, {"_id": 0}).to_list(10000)
    exps_by_vehicle: dict = {}
    for e in all_exps:
        exps_by_vehicle.setdefault(e["vehicle_id"], []).append(e)
    # Enrich each vehicle using pre-loaded expenses
    def enrich_with_expenses(v: dict, exps: list) -> dict:
        v["aging"] = stock_aging(v.get("purchase_date", ""))
        total_exp = sum(e["amount"] for e in exps)
        v["total_expenses"] = total_exp
        v["total_investment"] = v.get("purchase_price", 0) + total_exp + v.get("accessories_cost", 0)
        sp = v.get("selling_price") or 0
        if sp > 0:
            v["expected_profit"] = sp - v["total_investment"]
            v["profit_margin"] = round((v["expected_profit"] / sp) * 100, 2)
            v["low_margin"] = v["profit_margin"] < 8
        else:
            v["expected_profit"] = None; v["profit_margin"] = None; v["low_margin"] = False
        return v
    role = cu.get("role", "admin")
    return [_hide_financials_for_role(enrich_with_expenses(v, exps_by_vehicle.get(v["id"], [])), role) for v in vehicles]

@api_router.post("/vehicles")
async def create_vehicle(vehicle: VehicleCreate, cu: dict = Depends(require("vehicles", "create"))):
    existing = await db.vehicles.find_one(
        {"registration_number": {"$regex": f"^{re.escape(vehicle.registration_number.strip())}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(400, f"Registration number '{vehicle.registration_number}' is already in stock")
    v = vehicle.model_dump()
    v["id"] = str(uuid.uuid4())
    v["created_at"] = datetime.now(timezone.utc).isoformat()
    v["updated_at"] = datetime.now(timezone.utc).isoformat()
    v["sold_date"] = None; v["customer_id"] = None
    v["salesperson_id"] = None; v["salesperson_name"] = None; v["discount"] = 0
    v["created_by"] = cu["username"]
    # Audit log
    await db.audit_logs.insert_one({"action": "vehicle_created", "vehicle_id": v["id"],
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Added {v['brand']} {v['model']} {v['year']}"})
    await db.vehicles.insert_one(v)
    v.pop("_id", None)
    return v

# ── Bulk Import (xlsx/csv) ─────────────────────────────────────────────
IMPORT_REQUIRED_FIELDS = ["brand", "model", "year", "purchase_price", "purchase_date", "purchase_source", "registration_number"]

def _import_cell_str(record: dict, key: str) -> Optional[str]:
    val = record.get(key)
    if val is None: return None
    s = str(val).strip()
    return s if s else None

def _import_cell_num(record: dict, key: str):
    val = record.get(key)
    if val is None or str(val).strip() == "": return None
    return float(val)

_IMPORT_DATE_FORMATS = [
    "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
    "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
    "%m-%d-%Y", "%m/%d/%Y",
    "%d-%b-%Y", "%d %b %Y", "%d %B %Y",
    "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y",
    "%d-%m-%y", "%d/%m/%y",
]

def _parse_flexible_date(val) -> str:
    """Best-effort parse of a free-format date value into YYYY-MM-DD. Falls back to the raw trimmed string if unrecognized."""
    if isinstance(val, datetime):
        return val.date().isoformat()
    s = str(val).strip()
    for fmt in _IMPORT_DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s

def _parse_vehicle_import_rows(content: bytes, filename: str, created_by: str):
    filename = (filename or "").lower()
    rows: List[list] = []

    if filename.endswith(".csv"):
        import csv, io
        text = content.decode("utf-8-sig", errors="ignore")
        rows = [row for row in csv.reader(io.StringIO(text))]
    elif filename.endswith(".xlsx"):
        import openpyxl, io
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        except Exception:
            raise HTTPException(400, "Could not read file. Make sure it's a valid .xlsx sheet.")
        ws = wb.active
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        raise HTTPException(400, "Unsupported file type. Use .xlsx or .csv")

    if len(rows) < 2:
        raise HTTPException(400, "The sheet needs a header row plus at least one data row.")

    header_row = rows[0]
    headers = []
    for i, h in enumerate(header_row):
        h = str(h).strip() if h is not None else ""
        headers.append(h.lower().replace(" ", "_") if h else f"column_{i}")

    docs = []
    errors = []
    row_results = []
    total_data_rows = 0
    for sheet_row_num, row in enumerate(rows[1:], start=2):
        if all(c is None or str(c).strip() == "" for c in row):
            continue
        total_data_rows += 1
        row = list(row) + [None] * (len(headers) - len(row))
        record = dict(zip(headers, row))
        summary = f"{_import_cell_str(record, 'brand') or ''} {_import_cell_str(record, 'model') or ''}".strip() or "(unnamed)"
        missing = [f for f in IMPORT_REQUIRED_FIELDS if _import_cell_str(record, f) is None]
        if missing:
            reason = f"Missing required field(s): {', '.join(missing)}"
            errors.append({"row": sheet_row_num, "reason": reason})
            row_results.append({"row": sheet_row_num, "vehicle": summary, "status": "error", "reason": reason})
            continue
        try:
            purchase_date = _parse_flexible_date(record.get("purchase_date"))
            selling_price = _import_cell_num(record, "selling_price")
            min_selling_price = _import_cell_num(record, "minimum_selling_price")
            km_run = _import_cell_num(record, "kilometer_run")
            status_val = (_import_cell_str(record, "status") or "available").lower()
            if status_val == "hidden":
                status_val = "unlisted"  # legacy alias, pre-rename data
            if status_val not in ("available", "reserved", "sold", "unlisted", "scrap", "in_repair"):
                status_val = "available"
            doc = {
                "id": str(uuid.uuid4()),
                "brand": _import_cell_str(record, "brand"),
                "model": _import_cell_str(record, "model"),
                "variant": _import_cell_str(record, "variant"),
                "year": int(float(record.get("year"))),
                "engine_cc": int(float(record.get("engine_cc"))) if _import_cell_str(record, "engine_cc") else 0,
                "fuel_type": _import_cell_str(record, "fuel_type") or "Petrol",
                "ownership_number": int(float(record.get("ownership_number"))) if _import_cell_str(record, "ownership_number") else 1,
                "chassis_number": _import_cell_str(record, "chassis_number"),
                "engine_number": _import_cell_str(record, "engine_number"),
                "kilometer_run": int(km_run) if km_run is not None else None,
                "condition": _import_cell_str(record, "condition") or "Good",
                "condition_rating": int(float(record.get("condition_rating"))) if _import_cell_str(record, "condition_rating") else 7,
                "color": _import_cell_str(record, "color"),
                "registration_number": _import_cell_str(record, "registration_number"),
                "purchase_price": float(record.get("purchase_price")),
                "accessories_cost": _import_cell_num(record, "accessories_cost") or 0,
                "purchase_date": purchase_date,
                "purchase_source": _import_cell_str(record, "purchase_source"),
                "vendor_id": None,
                "purchase_from": _import_cell_str(record, "purchase_from"),
                "selling_price": selling_price,
                "minimum_selling_price": min_selling_price,
                "notes": _import_cell_str(record, "notes"),
                "status": status_val,
                "bluebook_status": "pending", "insurance_status": "pending",
                "tax_clearance_status": "pending", "transfer_status": "pending",
                "sold_date": None, "customer_id": None,
                "salesperson_id": None, "salesperson_name": None, "discount": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "created_by": created_by,
            }
            docs.append(doc)
            row_results.append({"row": sheet_row_num, "vehicle": summary, "status": "ok", "reason": None})
        except (ValueError, TypeError) as e:
            reason = f"Invalid value: {e}"
            errors.append({"row": sheet_row_num, "reason": reason})
            row_results.append({"row": sheet_row_num, "vehicle": summary, "status": "error", "reason": reason})

    return docs, errors, row_results, total_data_rows


@api_router.post("/vehicles/import")
async def import_vehicles(file: UploadFile = File(...), confirm: bool = False, cu: dict = Depends(admin_only)):
    content = await file.read()
    docs, errors, row_results, total_data_rows = _parse_vehicle_import_rows(content, file.filename, cu["username"])

    # Duplicate registration_number check — both within the sheet itself and against
    # vehicles already in stock (case-insensitive, since dealers key inventory off this number).
    ok_indices = [i for i, r in enumerate(row_results) if r["status"] == "ok"]
    existing_regs_lower = {d["registration_number"].strip().lower() for d in await db.vehicles.find({}, {"_id": 0, "registration_number": 1}).to_list(100000) if d.get("registration_number")}
    seen_in_sheet = {}
    kept_docs = []
    for doc, ri in zip(docs, ok_indices):
        row = row_results[ri]
        reg = (doc.get("registration_number") or "").strip()
        reg_lower = reg.lower()
        if reg_lower in existing_regs_lower:
            reason = f"Registration number '{reg}' is already in stock"
        elif reg_lower in seen_in_sheet:
            reason = f"Duplicate registration number '{reg}' (also on row {seen_in_sheet[reg_lower]})"
        else:
            reason = None
        if reason:
            errors.append({"row": row["row"], "reason": reason})
            row_results[ri] = {**row, "status": "error", "reason": reason}
        else:
            seen_in_sheet[reg_lower] = row["row"]
            kept_docs.append(doc)
    docs = kept_docs

    if errors:
        return {
            "committed": False,
            "all_success": False,
            "inserted": 0,
            "skipped": len(errors),
            "total_rows": total_data_rows,
            "rows": row_results,
            "errors": errors[:200],
            "message": f"{len(errors)} of {total_data_rows} row(s) failed validation. Fix them and re-upload — nothing was imported.",
        }

    if not confirm:
        return {
            "committed": False,
            "all_success": True,
            "inserted": 0,
            "skipped": 0,
            "total_rows": total_data_rows,
            "rows": row_results,
            "errors": [],
            "message": f"All {total_data_rows} row(s) validated successfully. Confirm to import.",
        }

    # A row imported with status=Sold bypasses both the Sales form and the Inventory
    # quick-status-edit path, so it needs the same auto-create-a-sale-record treatment
    # `update_vehicle` already does for a direct Sold edit (see there for the pattern).
    sold_docs = [d for d in docs if d.get("status") == "sold"]
    for d in sold_docs:
        sale_price = d.get("selling_price") or d.get("purchase_price", 0)
        d["sold_date"] = d.get("purchase_date") or datetime.now(timezone.utc).date().isoformat()
        if not d.get("selling_price"):
            d["selling_price"] = sale_price

    inserted = 0
    for i in range(0, len(docs), 500):
        batch = docs[i:i + 500]
        result = await db.vehicles.insert_many(batch, ordered=False)
        inserted += len(result.inserted_ids)

    if sold_docs:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.sales.insert_many([{
            "id": str(uuid.uuid4()),
            "vehicle_id": d["id"],
            "customer_id": None,
            "sale_price": d["selling_price"],
            "extra_expenses": [],
            "expenses_total": 0,
            "total_amount": d["selling_price"],
            "payment_method": "Due",
            "paid_cash": 0,
            "paid_bank": 0,
            "due_amount": d["selling_price"],
            "due_date": None,
            "payment_status": "Unpaid",
            "payment_history": [],
            "sale_date": d["sold_date"],
            "notes": "Auto-created: vehicle imported with status=Sold — review customer/payment details.",
            "created_by": cu.get("username"),
            "created_at": now_iso,
        } for d in sold_docs])

    await db.audit_logs.insert_one({"action": "vehicles_bulk_imported",
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Imported {inserted} vehicles via bulk import from {file.filename}" + (f", {len(sold_docs)} auto-recorded as sales" if sold_docs else "")})

    return {
        "committed": True,
        "all_success": True,
        "inserted": inserted,
        "skipped": 0,
        "total_rows": total_data_rows,
        "rows": row_results,
        "errors": [],
        "message": f"Imported {inserted} vehicle{'s' if inserted != 1 else ''} successfully." + (f" {len(sold_docs)} marked Sold were added to the Sales tab too." if sold_docs else ""),
    }

@api_router.get("/vehicles/{vid}")
async def get_vehicle(vid: str, cu: dict = Depends(require("vehicles", "view"))):
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not v: raise HTTPException(404, "Vehicle not found")
    v = await enrich_vehicle(v)
    v["expenses"] = await db.expenses.find({"vehicle_id": vid}, {"_id": 0}).to_list(200)
    v["job_cards"] = await db.job_cards.find({"vehicle_id": vid}, {"_id": 0}).to_list(100)
    return _hide_financials_for_role(v, cu.get("role", "admin"))

@api_router.put("/vehicles/{vid}")
async def update_vehicle(vid: str, vehicle: VehicleUpdate, cu: dict = Depends(require("vehicles", "edit"))):
    existing = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not existing: raise HTTPException(404, "Vehicle not found")
    upd = {k: val for k, val in vehicle.model_dump().items() if val is not None}
    if upd.get("registration_number") and upd["registration_number"].strip().lower() != (existing.get("registration_number") or "").strip().lower():
        dup = await db.vehicles.find_one(
            {"id": {"$ne": vid}, "registration_number": {"$regex": f"^{re.escape(upd['registration_number'].strip())}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if dup:
            raise HTTPException(400, f"Registration number '{upd['registration_number']}' is already in stock")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    if upd.get("status") == "sold" and "sold_date" not in upd:
        # Preserve the original sale date if this vehicle was sold before — otherwise
        # re-marking Sold (e.g. after a warranty repair stint) resets the sale date
        # and the warranty clock to today.
        upd["sold_date"] = existing.get("sold_date") or datetime.now(timezone.utc).date().isoformat()

    # Marking a vehicle Sold directly (Inventory/Edit/quick-status) bypasses the Sales form —
    # auto-create the matching sale record so it still shows up in the Sales tab.
    became_sold = upd.get("status") == "sold" and existing.get("status") != "sold"
    sale_price = upd.get("selling_price", existing.get("selling_price")) or existing.get("purchase_price", 0)
    if became_sold and not existing.get("selling_price") and "selling_price" not in upd:
        upd["selling_price"] = sale_price

    r = await db.vehicles.update_one({"id": vid}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Vehicle not found")

    if became_sold and not await db.sales.find_one({"vehicle_id": vid, "returned": {"$ne": True}}):
        sale_date = upd.get("sold_date", existing.get("sold_date")) or datetime.now(timezone.utc).date().isoformat()
        await db.sales.insert_one({
            "id": str(uuid.uuid4()),
            "vehicle_id": vid,
            "customer_id": upd.get("customer_id", existing.get("customer_id")),
            "sale_price": sale_price,
            "extra_expenses": [],
            "expenses_total": 0,
            "total_amount": sale_price,
            "payment_method": "Due",
            "paid_cash": 0,
            "paid_bank": 0,
            "due_amount": sale_price,
            "due_date": None,
            "payment_status": "Unpaid",
            "payment_history": [],
            "sale_date": sale_date,
            "notes": "Auto-created: vehicle marked Sold directly from Inventory",
            "created_by": cu.get("username"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    await db.audit_logs.insert_one({"action": "vehicle_updated", "vehicle_id": vid,
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Updated fields: {list(upd.keys())}"})
    return await db.vehicles.find_one({"id": vid}, {"_id": 0})

VEHICLE_STATUSES = {"available", "reserved", "sold", "unlisted", "scrap", "in_repair"}

# Status-only update, separate from the full PUT /vehicles/{vid} above: this is what lets
# parts_supervisor (edit_status only, not full edit — see ROLE_PERMISSIONS) move a vehicle
# through the repair pipeline without exposing the rest of the vehicle record to editing.
@api_router.patch("/vehicles/{vid}/status")
async def update_vehicle_status(vid: str, body: VehicleStatusUpdate, cu: dict = Depends(require_any("vehicles", {"edit", "edit_status"}))):
    if body.status not in VEHICLE_STATUSES:
        raise HTTPException(400, f"Invalid status '{body.status}'")

    role = cu.get("role", "admin")
    has_full_edit = role == "admin" or "edit" in ROLE_PERMISSIONS.get(role, {}).get("vehicles", set())

    existing = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not existing: raise HTTPException(404, "Vehicle not found")

    if not has_full_edit:
        # Scoped-access roles (e.g. parts_supervisor) may only move a vehicle between the
        # statuses their permission covers — never touch Sold/Reserved/Unlisted vehicles.
        if existing.get("status") not in PARTS_ALLOWED_STATUSES or body.status not in PARTS_ALLOWED_STATUSES:
            raise HTTPException(403, "You do not have permission to set this vehicle status")

    upd = {"status": body.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if body.status == "sold":
        # Preserve the original sale date if this vehicle was sold before (e.g. it was
        # flipped to In Repair for a warranty return and is now being flipped back) —
        # otherwise this would reset the sale date and the warranty clock to today.
        upd["sold_date"] = existing.get("sold_date") or datetime.now(timezone.utc).date().isoformat()

    became_sold = body.status == "sold" and existing.get("status") != "sold"
    sale_price = existing.get("selling_price") or existing.get("purchase_price", 0)
    if became_sold and not existing.get("selling_price"):
        upd["selling_price"] = sale_price

    r = await db.vehicles.update_one({"id": vid}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Vehicle not found")

    if became_sold and not await db.sales.find_one({"vehicle_id": vid, "returned": {"$ne": True}}):
        await db.sales.insert_one({
            "id": str(uuid.uuid4()),
            "vehicle_id": vid,
            "customer_id": existing.get("customer_id"),
            "sale_price": sale_price,
            "extra_expenses": [],
            "expenses_total": 0,
            "total_amount": sale_price,
            "payment_method": "Due",
            "paid_cash": 0,
            "paid_bank": 0,
            "due_amount": sale_price,
            "due_date": None,
            "payment_status": "Unpaid",
            "payment_history": [],
            "sale_date": upd["sold_date"],
            "notes": "Auto-created: vehicle marked Sold directly from Inventory",
            "created_by": cu.get("username"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    await db.audit_logs.insert_one({"action": "vehicle_status_updated", "vehicle_id": vid,
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Status changed from {existing.get('status')} to {body.status}"})
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    return _hide_financials_for_role(v, role)

# Lets Vehicle Detail / Sold Stock show the refund-preview numbers before opening the return
# modal, without the caller having to know which sale record is currently active for this
# vehicle — there's no time limit on this (unlike the warranty window), a vehicle sold years
# ago can still be returned, so this just looks for whichever sale hasn't been returned yet.
@api_router.get("/vehicles/{vid}/active-sale")
async def get_active_sale(vid: str, cu: dict = Depends(admin_only)):
    sale = await db.sales.find_one({"vehicle_id": vid, "returned": {"$ne": True}}, {"_id": 0}, sort=[("created_at", -1)])
    if not sale:
        raise HTTPException(404, "No active sale found for this vehicle")
    return sale

# Recondition-house return: unlike the plain status dropdown above (which the /sales/reconcile
# ribbon is specifically meant to catch if someone bypasses proper channels), this is the one
# sanctioned path for taking a sold vehicle back. The shop assesses the vehicle's condition and
# refunds only a percentage of what the customer paid, keeping the rest — so the sale record is
# tagged "returned" (not deleted) with that split preserved, and the vehicle re-enters stock at
# whatever status the assessment calls for. There is no time limit — a vehicle can come back
# for return long after its warranty window has closed.
@api_router.post("/vehicles/{vid}/return")
async def return_vehicle(vid: str, body: VehicleReturnRequest, cu: dict = Depends(admin_only)):
    if not (0 <= body.refund_percentage <= 100):
        raise HTTPException(400, "Refund percentage must be between 0 and 100")
    if body.new_status not in VEHICLE_STATUSES or body.new_status == "sold":
        raise HTTPException(400, f"Invalid return status '{body.new_status}'")

    existing = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not existing: raise HTTPException(404, "Vehicle not found")
    if existing.get("status") != "sold":
        raise HTTPException(400, f"Vehicle is not currently marked Sold (status: {existing.get('status')})")

    sale = await db.sales.find_one({"vehicle_id": vid, "returned": {"$ne": True}}, sort=[("created_at", -1)])
    if not sale:
        raise HTTPException(404, "No active sale found for this vehicle")

    total_amount = sale.get("total_amount", 0)
    refund_amount = round(total_amount * body.refund_percentage / 100, 2)
    retained_amount = round(total_amount - refund_amount, 2)

    await db.sales.update_one({"id": sale["id"]}, {"$set": {
        "returned": True,
        "returned_at": datetime.now(timezone.utc).isoformat(),
        "returned_status": body.new_status,
        "refund_percentage": body.refund_percentage,
        "refund_amount": refund_amount,
        "retained_amount": retained_amount,
        "return_notes": body.notes,
        "due_amount": 0,
    }})

    await db.vehicles.update_one({"id": vid}, {"$set": {
        "status": body.new_status,
        "sold_date": None,
        "customer_id": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})

    await db.audit_logs.insert_one({"action": "vehicle_returned", "vehicle_id": vid,
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Sale {sale['id']} returned at {body.refund_percentage}% refund, vehicle set to {body.new_status}"})

    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    return {"vehicle": v, "refund_amount": refund_amount, "retained_amount": retained_amount}

@api_router.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, cu: dict = Depends(admin_only)):
    r = await db.vehicles.delete_one({"id": vid})
    if r.deleted_count == 0: raise HTTPException(404, "Vehicle not found")
    await db.expenses.delete_many({"vehicle_id": vid})
    await db.job_cards.delete_many({"vehicle_id": vid})
    # Otherwise a sale record survives with no vehicle to resolve — it still counts in the
    # Sales tab total but can never show up in Sold Stock, silently desyncing the two counts.
    await db.sales.delete_many({"vehicle_id": vid})
    return {"message": "Deleted"}

@api_router.delete("/vehicles")
async def delete_all_vehicles(confirm: str = "", cu: dict = Depends(get_current_user)):
    if cu.get("role") != "admin":
        raise HTTPException(403, "Only admins can clear all inventory")
    if confirm != "DELETE ALL":
        raise HTTPException(400, "Pass confirm=DELETE ALL to proceed")
    vehicle_ids = [v["id"] for v in await db.vehicles.find({}, {"_id": 0, "id": 1}).to_list(100000)]
    result = await db.vehicles.delete_many({})
    if vehicle_ids:
        await db.expenses.delete_many({"vehicle_id": {"$in": vehicle_ids}})
        await db.sales.delete_many({"vehicle_id": {"$in": vehicle_ids}})
        # Job cards are intentionally left untouched — service history survives inventory resets.
    await db.audit_logs.insert_one({"action": "vehicles_bulk_deleted",
        "user": cu["username"], "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": f"Cleared all inventory: {result.deleted_count} vehicles deleted (job cards preserved)"})
    return {"message": f"Deleted {result.deleted_count} vehicles"}

@api_router.get("/vehicles/{vid}/qr-data")
async def get_vehicle_qr(vid: str):
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
    if not v: raise HTTPException(404, "Not found")
    return {"id": v["id"], "brand": v.get("brand"), "model": v.get("model"),
            "variant": v.get("variant"), "year": v.get("year"),
            "engine_cc": v.get("engine_cc"), "fuel_type": v.get("fuel_type"),
            "color": v.get("color"), "ownership_number": v.get("ownership_number"),
            "kilometer_run": v.get("kilometer_run"), "condition": v.get("condition"),
            "selling_price": v.get("selling_price"), "minimum_selling_price": v.get("minimum_selling_price"),
            "registration_number": v.get("registration_number"), "status": v.get("status"),
            "contact": "Hamro G&G Auto Enterprises"}

# ── EXPENSES ──────────────────────────────────────────────────────────
@api_router.get("/vehicles/{vid}/expenses")
async def get_expenses(vid: str, cu: dict = Depends(require("expenses", "view"))):
    return await db.expenses.find({"vehicle_id": vid}, {"_id": 0}).to_list(200)

@api_router.post("/expenses")
async def create_expense(exp: ExpenseCreate, cu: dict = Depends(require("expenses", "create"))):
    e = exp.model_dump()
    e["id"] = str(uuid.uuid4())
    e["date"] = e.get("date") or datetime.now(timezone.utc).date().isoformat()
    e["added_by"] = cu["username"]
    e["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.expenses.insert_one(e)
    e.pop("_id", None)
    return e

@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, cu: dict = Depends(require("expenses", "delete"))):
    r = await db.expenses.delete_one({"id": eid})
    if r.deleted_count == 0: raise HTTPException(404, "Expense not found")
    return {"message": "Deleted"}

# ── JOB CARDS ─────────────────────────────────────────────────────────
@api_router.get("/jobs")
async def get_jobs(status: Optional[str] = None, vehicle_id: Optional[str] = None, cu: dict = Depends(require("jobs", "view"))):
    q = {}
    if status and status != "all": q["status"] = status
    if vehicle_id: q["vehicle_id"] = vehicle_id
    return await db.job_cards.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/jobs")
async def create_job(job: JobCardCreate, cu: dict = Depends(require("jobs", "create"))):
    count = await db.job_cards.count_documents({})
    jc = job.model_dump()
    jc["id"] = str(uuid.uuid4())
    jc["job_number"] = f"JC-{datetime.now(timezone.utc).year}-{str(count + 1).zfill(3)}"
    jc["status"] = "pending"; jc["actual_cost"] = None
    jc["created_at"] = datetime.now(timezone.utc).isoformat()
    jc["completed_at"] = None; jc["created_by"] = cu["username"]
    if job.is_external:
        jc["vehicle_id"] = None
        if not job.vehicle_brand or not job.vehicle_model or not job.registration_number:
            raise HTTPException(400, "Brand, model and registration number are required for external vehicles")
    else:
        if not job.vehicle_id: raise HTTPException(400, "vehicle_id is required")
        v = await db.vehicles.find_one({"id": job.vehicle_id}, {"_id": 0})
        if not v: raise HTTPException(404, "Vehicle not found")
        if v.get("status") == "sold":
            if not _within_warranty(v):
                raise HTTPException(400, "This vehicle's 6-month warranty period has expired")
            jc["is_warranty"] = True
        elif v.get("status") != "in_repair":
            raise HTTPException(400, "Job cards can only be created for vehicles in the Repair stage, or sold vehicles still under warranty")
        jc["vehicle_brand"] = v.get("brand"); jc["vehicle_model"] = v.get("model")
        jc["vehicle_year"] = v.get("year"); jc["registration_number"] = v.get("registration_number")
    await db.job_cards.insert_one(jc)
    jc.pop("_id", None)
    # Deduct parts from spare parts inventory and log transactions
    for part in jc.get("parts", []):
        part_id = part.get("part_id")
        qty = int(part.get("quantity", 0))
        if part_id and qty > 0:
            pp = await db.spare_parts.find_one({"id": part_id}, {"_id": 0, "quantity": 1, "name": 1})
            if pp:
                new_qty = max(0, pp.get("quantity", 0) - qty)
                await db.spare_parts.update_one({"id": part_id}, {"$set": {"quantity": new_qty}})
                txn = {
                    "id": str(uuid.uuid4()), "part_id": part_id, "part_name": pp.get("name"),
                    "type": "out", "quantity": qty, "reason": "Used in Job Card",
                    "date": datetime.now(timezone.utc).isoformat()[:10],
                    "job_id": jc["id"], "notes": f"Job {jc['job_number']}",
                    "created_by": cu.get("username"), "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.part_transactions.insert_one(txn)
    return jc

@api_router.put("/jobs/{jid}")
async def update_job(jid: str, job: JobCardUpdate, cu: dict = Depends(require("jobs", "edit"))):
    existing = await db.job_cards.find_one({"id": jid}, {"_id": 0})
    if not existing: raise HTTPException(404, "Job not found")
    upd = {k: v for k, v in job.model_dump().items() if v is not None}
    if upd.get("status") == "completed":
        upd["completed_at"] = datetime.now(timezone.utc).isoformat()
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "parts" in upd:
        old_qtys = {p["part_id"]: int(p.get("quantity", 0)) for p in existing.get("parts", []) if p.get("part_id")}
        new_qtys = {p["part_id"]: int(p.get("quantity", 0)) for p in upd["parts"] if p.get("part_id")}
        diffs = {}
        part_info = {}
        for part_id in set(old_qtys) | set(new_qtys):
            diff = new_qtys.get(part_id, 0) - old_qtys.get(part_id, 0)
            if diff == 0: continue
            pp = await db.spare_parts.find_one({"id": part_id}, {"_id": 0, "quantity": 1, "name": 1})
            if not pp: continue
            if diff > 0 and pp.get("quantity", 0) < diff:
                raise HTTPException(400, f"Not enough stock for {pp.get('name')}: only {pp.get('quantity', 0)} left")
            diffs[part_id] = diff
            part_info[part_id] = pp
        for part_id, diff in diffs.items():
            pp = part_info[part_id]
            await db.spare_parts.update_one({"id": part_id}, {"$set": {"quantity": max(0, pp.get("quantity", 0) - diff)}})
            txn = {
                "id": str(uuid.uuid4()), "part_id": part_id, "part_name": pp.get("name"),
                "type": "out" if diff > 0 else "in", "quantity": abs(diff),
                "reason": "Used in Job Card" if diff > 0 else "Removed from Job Card",
                "date": datetime.now(timezone.utc).date().isoformat(),
                "job_id": jid, "notes": f"Job {existing.get('job_number')} updated",
                "created_by": cu.get("username"), "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.part_transactions.insert_one(txn)

    r = await db.job_cards.update_one({"id": jid}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Job not found")
    return await db.job_cards.find_one({"id": jid}, {"_id": 0})

@api_router.delete("/jobs/{jid}")
async def delete_job(jid: str, cu: dict = Depends(require("jobs", "delete"))):
    r = await db.job_cards.delete_one({"id": jid})
    if r.deleted_count == 0: raise HTTPException(404, "Job not found")
    return {"message": "Deleted"}

# ── CUSTOMERS ─────────────────────────────────────────────────────────
@api_router.get("/customers")
async def get_customers(cu: dict = Depends(require("customers", "view"))):
    customers = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in customers:
        cust_sales = await db.sales.find({"customer_id": c["id"]}, {"_id": 0, "due_amount": 1, "due_date": 1, "returned": 1}).to_list(1000)
        active_cust_sales = [cs for cs in cust_sales if not cs.get("returned")]
        c["purchase_count"] = len(active_cust_sales); c["is_repeat_customer"] = len(active_cust_sales) > 1
        c["total_due"] = round(sum(cs.get("due_amount", 0) for cs in cust_sales), 2)
        today_iso2 = datetime.now(timezone.utc).date().isoformat()
        c["has_overdue"] = any((cs.get("due_amount", 0) > 0 and cs.get("due_date") and cs.get("due_date") < today_iso2) for cs in cust_sales)
    return customers

@api_router.post("/customers")
async def create_customer(cust: CustomerCreate, cu: dict = Depends(require("customers", "create"))):
    c = cust.model_dump()
    c["id"] = str(uuid.uuid4())
    c["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.customers.insert_one(c)
    c.pop("_id", None)
    return c

@api_router.get("/customers/{cid}")
async def get_customer(cid: str, cu: dict = Depends(require("customers", "view"))):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c: raise HTTPException(404, "Not found")
    sales = await db.sales.find({"customer_id": cid}, {"_id": 0}).sort("sale_date", -1).to_list(200)
    for s in sales:
        v = await db.vehicles.find_one({"id": s.get("vehicle_id")}, {"_id": 0, "brand": 1, "model": 1, "year": 1, "registration_number": 1})
        s["vehicle_info"] = f"{v['brand']} {v['model']} {v.get('year','')}" + (f" ({v['registration_number']})" if v.get("registration_number") else "") if v else "Vehicle removed"
    c["sales"] = sales
    active_sales = [s for s in sales if not s.get("returned")]
    c["purchase_count"] = len(active_sales)
    c["is_repeat_customer"] = len(active_sales) > 1
    return c

@api_router.put("/customers/{cid}")
async def update_customer(cid: str, cust: CustomerCreate, cu: dict = Depends(require("customers", "edit"))):
    r = await db.customers.update_one({"id": cid}, {"$set": cust.model_dump()})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.customers.find_one({"id": cid}, {"_id": 0})

@api_router.delete("/customers/{cid}")
async def delete_customer(cid: str, cu: dict = Depends(require("customers", "delete"))):
    r = await db.customers.delete_one({"id": cid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

# ── SALES ─────────────────────────────────────────────────────────────
@api_router.get("/sales")
async def get_sales(cu: dict = Depends(require("sales", "view"))):
    sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for s in sales:
        v = await db.vehicles.find_one({"id": s.get("vehicle_id")}, {"_id": 0, "brand": 1, "model": 1, "year": 1, "registration_number": 1})
        if v: s["vehicle_info"] = f"{v['brand']} {v['model']} {v.get('year','')}" + (f" ({v['registration_number']})" if v.get("registration_number") else "")
        c = await db.customers.find_one({"id": s.get("customer_id")}, {"_id": 0, "name": 1, "contact_number": 1}) if s.get("customer_id") else None
        s["customer_name"] = c["name"] if c else "Walk-in Customer"
        s["customer_contact"] = c.get("contact_number") if c else None
    return sales

@api_router.post("/sales")
async def create_sale(sale: SaleCreate, cu: dict = Depends(require("sales", "create"))):
    v = await db.vehicles.find_one({"id": sale.vehicle_id}, {"_id": 0})
    if not v: raise HTTPException(404, "Vehicle not found")
    if v.get("status") != "available": raise HTTPException(400, f"Vehicle is already {v.get('status')}")
    expenses_total = sum(float(e.get("amount", 0)) for e in sale.extra_expenses)
    total_amount = sale.sale_price + expenses_total
    paid_total = (sale.paid_cash or 0) + (sale.paid_bank or 0)
    due_amount = max(round(total_amount - paid_total, 2), 0)
    payment_status = "Paid" if due_amount <= 0 else ("Partial" if paid_total > 0 else "Unpaid")
    sale_date = sale.sale_date or datetime.now(timezone.utc).date().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "vehicle_id": sale.vehicle_id,
        "customer_id": sale.customer_id,
        "sale_price": sale.sale_price,
        "extra_expenses": sale.extra_expenses,
        "expenses_total": expenses_total,
        "total_amount": total_amount,
        "payment_method": sale.payment_method,
        "paid_cash": sale.paid_cash or 0,
        "paid_bank": sale.paid_bank or 0,
        "due_amount": due_amount,
        "due_date": sale.due_date,
        "payment_status": payment_status,
        "payment_history": [],
        "sale_date": sale_date,
        "notes": sale.notes,
        "created_by": cu.get("username"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sales.insert_one(doc)
    doc.pop("_id", None)
    # Mark vehicle as sold
    await db.vehicles.update_one({"id": sale.vehicle_id}, {"$set": {
        "status": "sold",
        "selling_price": sale.sale_price,
        "sold_date": sale_date,
        "customer_id": sale.customer_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    # Update customer purchase history
    if sale.customer_id:
        await db.customers.update_one({"id": sale.customer_id}, {"$set": {"last_purchase_date": sale_date}})
    return doc

@api_router.get("/sales/summary")
async def get_sales_summary(cu: dict = Depends(require("sales", "view"))):
    sales = await db.sales.find({}, {"_id": 0}).to_list(1000)
    total_revenue = sum(_sale_revenue(s) for s in sales)
    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    monthly = [s for s in sales if s.get("sale_date", "").startswith(this_month)]
    avg = total_revenue / len(sales) if sales else 0
    total_due = round(sum(s.get("due_amount", 0) for s in sales), 2)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    due_count = sum(1 for s in sales if s.get("due_amount", 0) > 0)
    overdue_count = sum(1 for s in sales if s.get("due_amount", 0) > 0 and s.get("due_date") and s.get("due_date") < today_iso)
    return {"total_sales": len(sales), "total_revenue": total_revenue, "this_month_sales": len(monthly), "this_month_revenue": sum(_sale_revenue(s) for s in monthly), "avg_sale_price": round(avg, 2), "total_due": total_due, "due_count": due_count, "overdue_count": overdue_count}

@api_router.get("/sales/reconcile")
async def reconcile_sales(cu: dict = Depends(admin_only)):
    """Diagnostic: finds sales whose linked vehicle no longer has status "sold" — the
    usual cause of the Sales-tab total drifting from the Sold Stock count. Happens when
    a sold vehicle's status gets changed (or the vehicle deleted) directly from Inventory
    instead of through "Delete Sale", which is the only path that keeps both in sync.

    Two legitimate exceptions are excluded from this check, both from PATCH /vehicles/{vid}/status:
    - "in_repair": the warranty-repair cycle, where a sold vehicle is temporarily brought
      back into the recondition pipeline and later flipped back to "sold" with its original
      sold_date preserved. The sale stays active throughout.
    - sales flagged "returned": a recondition-house return, where the vehicle is handed
      back and re-enters stock (e.g. flipped to "available") instead of going through
      "Delete Sale". The sale is intentionally kept (with its "returned" flag set) for
      history/revenue instead of deleted, so it's excluded here entirely — its vehicle's
      current status (and even later deletion) no longer implies a desync.
    Only genuine mismatches (deleted vehicle, or any other unflagged status drift) surface here."""
    sales = await db.sales.find({}, {"_id": 0}).to_list(1000)
    mismatches = []
    for s in sales:
        if s.get("returned"):
            continue
        v = await db.vehicles.find_one({"id": s.get("vehicle_id")}, {"_id": 0})
        if not v:
            mismatches.append({
                "sale_id": s["id"], "vehicle_id": s.get("vehicle_id"), "issue": "vehicle_deleted",
                "vehicle_info": None, "vehicle_status": None,
                "sale_date": s.get("sale_date"), "total_amount": s.get("total_amount"),
            })
        elif v.get("status") != "sold" and v.get("status") != "in_repair":
            mismatches.append({
                "sale_id": s["id"], "vehicle_id": s.get("vehicle_id"), "issue": "vehicle_status_mismatch",
                "vehicle_info": f"{v.get('brand','')} {v.get('model','')} {v.get('year','')}".strip(),
                "vehicle_status": v.get("status"),
                "sale_date": s.get("sale_date"), "total_amount": s.get("total_amount"),
            })
    return {"count": len(mismatches), "mismatches": mismatches}

@api_router.get("/sales/{sid}")
async def get_sale(sid: str, cu: dict = Depends(require("sales", "view"))):
    s = await db.sales.find_one({"id": sid}, {"_id": 0})
    if not s: raise HTTPException(404, "Not found")
    v = await db.vehicles.find_one({"id": s.get("vehicle_id")}, {"_id": 0})
    if v:
        s["vehicle_info"] = f"{v.get('brand','')} {v.get('model','')} {v.get('year','')}".strip()
        s["vehicle_brand"] = v.get("brand"); s["vehicle_model"] = v.get("model")
        s["vehicle_year"] = v.get("year"); s["registration_number"] = v.get("registration_number")
        s["engine_cc"] = v.get("engine_cc"); s["fuel_type"] = v.get("fuel_type")
        s["vehicle_status"] = v.get("status")
    c = await db.customers.find_one({"id": s.get("customer_id")}, {"_id": 0}) if s.get("customer_id") else None
    s["customer_name"] = c["name"] if c else "Walk-in Customer"
    s["customer_contact"] = c.get("contact_number") if c else None
    s["customer_address"] = c.get("address") if c else None
    # Margin/profit reveal what the shop paid for the vehicle — restricted to Super Admin
    # to keep that number away from front desk, same as the vehicle-level fields.
    if cu.get("role", "admin") == "admin" and v:
        investment = await _vehicle_investment(s["vehicle_id"], v)
        total = s.get("total_amount", 0)
        s["total_investment"] = investment
        s["profit"] = total - investment
        s["profit_margin"] = round(((total - investment) / total) * 100, 2) if total else None
    return s

@api_router.put("/sales/{sid}")
async def update_sale(sid: str, sale: SaleUpdate, cu: dict = Depends(get_current_user)):
    if cu.get("role") != "admin":
        raise HTTPException(403, "Only admin accounts can edit sales records")
    existing = await db.sales.find_one({"id": sid}, {"_id": 0})
    if not existing: raise HTTPException(404, "Not found")
    v = await db.vehicles.find_one({"id": sale.vehicle_id}, {"_id": 0})
    if not v: raise HTTPException(404, "Vehicle not found")
    expenses_total = sum(float(e.get("amount", 0)) for e in sale.extra_expenses)
    total_amount = sale.sale_price + expenses_total
    paid_total = (sale.paid_cash or 0) + (sale.paid_bank or 0)
    due_amount = max(round(total_amount - paid_total, 2), 0)
    payment_status = "Paid" if due_amount <= 0 else ("Partial" if paid_total > 0 else "Unpaid")
    sale_date = sale.sale_date or existing.get("sale_date")
    update_doc = {
        "vehicle_id": sale.vehicle_id,
        "customer_id": sale.customer_id,
        "sale_price": sale.sale_price,
        "extra_expenses": sale.extra_expenses,
        "expenses_total": expenses_total,
        "total_amount": total_amount,
        "payment_method": sale.payment_method,
        "paid_cash": sale.paid_cash or 0,
        "paid_bank": sale.paid_bank or 0,
        "due_amount": due_amount,
        "due_date": sale.due_date,
        "payment_status": payment_status,
        "sale_date": sale_date,
        "notes": sale.notes,
        "updated_by": cu.get("username"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sales.update_one({"id": sid}, {"$set": update_doc})
    # Keep vehicle record in sync (price/date/customer may have changed)
    await db.vehicles.update_one({"id": sale.vehicle_id}, {"$set": {
        "selling_price": sale.sale_price,
        "sold_date": sale_date,
        "customer_id": sale.customer_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    if sale.customer_id:
        await db.customers.update_one({"id": sale.customer_id}, {"$set": {"last_purchase_date": sale_date}})
    updated = await db.sales.find_one({"id": sid}, {"_id": 0})
    return updated

@api_router.delete("/sales/{sid}")
async def delete_sale(sid: str, cu: dict = Depends(get_current_user)):
    if cu.get("role") != "admin":
        raise HTTPException(403, "Only admin accounts can delete sales records")
    s = await db.sales.find_one({"id": sid}, {"_id": 0})
    if not s: raise HTTPException(404, "Not found")
    await db.sales.delete_one({"id": sid})
    # Restore vehicle to available
    await db.vehicles.update_one({"id": s["vehicle_id"]}, {"$set": {
        "status": "available", "sold_date": None, "customer_id": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"message": "Sale deleted, vehicle restored to available"}

# ── TEAM ──────────────────────────────────────────────────────────────
@api_router.get("/team")
async def get_team(cu: dict = Depends(require("team", "view"))):
    members = await db.team_members.find({}, {"_id": 0}).to_list(100)
    for m in members:
        if m.get("role") == "mechanic":
            m["total_jobs"] = await db.job_cards.count_documents({"mechanic_id": m["id"]})
            m["completed_jobs"] = await db.job_cards.count_documents({"mechanic_id": m["id"], "status": "completed"})
            m["completion_rate"] = round(m["completed_jobs"] / m["total_jobs"] * 100) if m["total_jobs"] > 0 else 0
    return members

@api_router.get("/team/leaderboard")
async def get_leaderboard(cu: dict = Depends(require("team", "view"))):
    sales_staff = await db.team_members.find({"role": "sales"}, {"_id": 0}).to_list(50)
    sales_board = []
    for s in sales_staff:
        sold = await db.vehicles.find({"salesperson_id": s["id"]}, {"_id": 0}).to_list(500)
        revenue = sum((v.get("selling_price") or 0) for v in sold)
        sales_board.append({**s, "vehicles_sold": len(sold), "revenue_generated": revenue})
    sales_board.sort(key=lambda x: x["vehicles_sold"], reverse=True)

    mechanics = await db.team_members.find({"role": "mechanic"}, {"_id": 0}).to_list(50)
    mech_board = []
    for m in mechanics:
        total = await db.job_cards.count_documents({"mechanic_id": m["id"]})
        done = await db.job_cards.count_documents({"mechanic_id": m["id"], "status": "completed"})
        mech_board.append({**m, "total_jobs": total, "completed_jobs": done,
                           "completion_rate": round(done/total*100) if total > 0 else 0})
    mech_board.sort(key=lambda x: x["completed_jobs"], reverse=True)
    return {"sales_leaderboard": sales_board, "mechanics_leaderboard": mech_board}

@api_router.post("/team")
async def create_team_member(member: TeamMemberCreate, cu: dict = Depends(require("team", "create"))):
    m = member.model_dump()
    m["id"] = str(uuid.uuid4()); m["is_active"] = True
    m["joining_date"] = m.get("joining_date") or datetime.now(timezone.utc).date().isoformat()
    m["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.team_members.insert_one(m)
    m.pop("_id", None)
    return m

@api_router.put("/team/{mid}")
async def update_team_member(mid: str, member: TeamMemberCreate, cu: dict = Depends(require("team", "edit"))):
    r = await db.team_members.update_one({"id": mid}, {"$set": member.model_dump()})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.team_members.find_one({"id": mid}, {"_id": 0})

@api_router.delete("/team/{mid}")
async def delete_team_member(mid: str, cu: dict = Depends(require("team", "delete"))):
    r = await db.team_members.delete_one({"id": mid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

# ── PARTNERS ──────────────────────────────────────────────────────────
@api_router.get("/partners")
async def get_partners(cu: dict = Depends(admin_only)):
    return await db.partners.find({}, {"_id": 0}).to_list(100)

@api_router.post("/partners")
async def create_partner(partner: PartnerCreate, cu: dict = Depends(admin_only)):
    p = partner.model_dump()
    p["id"] = str(uuid.uuid4()); p["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.partners.insert_one(p)
    p.pop("_id", None)
    return p

@api_router.put("/partners/{pid}")
async def update_partner(pid: str, partner: PartnerCreate, cu: dict = Depends(admin_only)):
    r = await db.partners.update_one({"id": pid}, {"$set": partner.model_dump()})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.partners.find_one({"id": pid}, {"_id": 0})

@api_router.delete("/partners/{pid}")
async def delete_partner(pid: str, cu: dict = Depends(admin_only)):
    r = await db.partners.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

# ── VENDORS ───────────────────────────────────────────────────────────
@api_router.get("/vendors")
async def get_vendors(cu: dict = Depends(require("vendors", "view"))):
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(200)
    for v in vendors:
        vehicles = await db.vehicles.find({"vendor_id": v["id"]}, {"_id": 0}).to_list(200)
        parts = await db.spare_parts.find({"vendor_id": v["id"]}, {"_id": 0}).to_list(1000)
        vehicle_owed = sum(vh.get("purchase_price", 0) for vh in vehicles)
        parts_owed = sum(p.get("quantity", 0) * p.get("unit_cost", 0) for p in parts)
        total_owed = vehicle_owed + parts_owed
        payments = await db.vendor_payments.find({"vendor_id": v["id"]}, {"_id": 0}).to_list(500)
        total_paid = sum(p["amount"] for p in payments)
        v["total_purchased"] = total_owed; v["total_paid"] = total_paid
        v["remaining_due"] = max(0, total_owed - total_paid)
        v["vehicle_count"] = len(vehicles)
        v["parts_count"] = len(parts)
        v["parts_purchased"] = parts_owed
        v["overdue"] = v["remaining_due"] > 0
    return vendors

@api_router.post("/vendors")
async def create_vendor(vendor: VendorCreate, cu: dict = Depends(require("vendor_lookup", "create"))):
    v = vendor.model_dump()
    v["id"] = str(uuid.uuid4()); v["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.vendors.insert_one(v)
    v.pop("_id", None)
    return v

@api_router.put("/vendors/{vid}")
async def update_vendor(vid: str, vendor: VendorCreate, cu: dict = Depends(require("vendors", "edit"))):
    r = await db.vendors.update_one({"id": vid}, {"$set": vendor.model_dump()})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return await db.vendors.find_one({"id": vid}, {"_id": 0})

@api_router.delete("/vendors/{vid}")
async def delete_vendor(vid: str, cu: dict = Depends(require("vendors", "delete"))):
    r = await db.vendors.delete_one({"id": vid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

@api_router.get("/vendors/search")
async def search_vendors(q: str = "", vendor_type: Optional[str] = None, cu: dict = Depends(require("vendor_lookup", "view"))):
    """Fast vendor name search for autocomplete."""
    vendors = await db.vendors.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "vendor_type": 1}).to_list(200)
    if vendor_type:
        vendors = [v for v in vendors if v.get("vendor_type", "both") in (vendor_type, "both")]
    if q:
        q_lower = q.lower()
        vendors = [v for v in vendors if q_lower in v.get("name", "").lower()]
    return vendors[:8] if q else vendors

@api_router.get("/vendors/{vid}/payments")
async def get_vendor_payments(vid: str, cu: dict = Depends(require("vendors", "view"))):
    payments = await db.vendor_payments.find({"vendor_id": vid}, {"_id": 0}).sort("payment_date", -1).to_list(500)
    vehicles = await db.vehicles.find({"vendor_id": vid}, {"_id": 0}).to_list(200)
    parts = await db.spare_parts.find({"vendor_id": vid}, {"_id": 0}).to_list(1000)
    vehicle_owed = sum(v.get("purchase_price", 0) for v in vehicles)
    parts_owed = sum(p.get("quantity", 0) * p.get("unit_cost", 0) for p in parts)
    total_owed = vehicle_owed + parts_owed
    total_paid = sum(p["amount"] for p in payments)
    bills = {}
    for p in parts:
        key = p.get("bill_no") or "No Bill No."
        b = bills.setdefault(key, {"bill_no": key, "entry_date": p.get("entry_date") or (p.get("created_at", "")[:10]), "items": [], "total": 0})
        b["items"].append(p)
        b["total"] += p.get("quantity", 0) * p.get("unit_cost", 0)
    parts_bills = sorted(bills.values(), key=lambda b: b["entry_date"] or "", reverse=True)
    return {"payments": payments, "total_paid": total_paid,
            "total_owed": total_owed, "remaining_due": max(0, total_owed - total_paid),
            "vehicles": vehicles, "parts_bills": parts_bills}

@api_router.post("/vendor-payments")
async def create_vendor_payment(payment: VendorPaymentCreate, cu: dict = Depends(require("vendors", "manage_payments"))):
    p = payment.model_dump()
    p["id"] = str(uuid.uuid4())
    p["payment_date"] = p.get("payment_date") or datetime.now(timezone.utc).date().isoformat()
    p["recorded_by"] = cu["username"]
    p["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.vendor_payments.insert_one(p)
    p.pop("_id", None)
    return p

@api_router.delete("/vendor-payments/{pid}")
async def delete_vendor_payment(pid: str, cu: dict = Depends(require("vendors", "manage_payments"))):
    r = await db.vendor_payments.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

# ── EMI ───────────────────────────────────────────────────────────────
@api_router.get("/emi")
async def get_emi_list(cu: dict = Depends(admin_only)):
    emis = await db.emi_records.find({}, {"_id": 0}).to_list(500)
    for e in emis:
        payments = await db.emi_payments.find({"emi_id": e["id"]}, {"_id": 0}).to_list(200)
        paid = sum(p["amount"] for p in payments)
        e["total_paid"] = paid
        e["remaining_balance"] = max(0, e.get("loan_amount", 0) - paid)
        e["payments_made"] = len(payments)
        e["is_active"] = e["remaining_balance"] > 0
    return emis

@api_router.post("/emi")
async def create_emi(emi: EMICreate, cu: dict = Depends(admin_only)):
    e = emi.model_dump()
    e["id"] = str(uuid.uuid4())
    # Calculate monthly installment: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    p_val = e["loan_amount"]
    r = e["interest_rate"] / 100 / 12
    n = e["tenure_months"]
    if r > 0:
        monthly = p_val * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)
    else:
        monthly = p_val / n
    e["monthly_installment"] = round(monthly, 2)
    e["total_payable"] = round(monthly * n, 2)
    e["total_interest"] = round(monthly * n - p_val, 2)
    e["status"] = "active"
    e["created_at"] = datetime.now(timezone.utc).isoformat()
    # Get customer info
    customer = await db.customers.find_one({"id": emi.customer_id}, {"_id": 0})
    if customer:
        e["customer_name"] = customer.get("name")
        e["customer_phone"] = customer.get("contact_number")
    # Get vehicle info
    vehicle = await db.vehicles.find_one({"id": emi.vehicle_id}, {"_id": 0})
    if vehicle:
        e["vehicle_name"] = f"{vehicle.get('brand')} {vehicle.get('model')} {vehicle.get('year')}"
    await db.emi_records.insert_one(e)
    e.pop("_id", None)
    return e

@api_router.post("/emi-payments")
async def add_emi_payment(payment: EMIPaymentCreate, cu: dict = Depends(admin_only)):
    p = payment.model_dump()
    p["id"] = str(uuid.uuid4())
    p["payment_date"] = p.get("payment_date") or datetime.now(timezone.utc).date().isoformat()
    p["recorded_by"] = cu["username"]
    p["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.emi_payments.insert_one(p)
    p.pop("_id", None)
    return p

# ── FINANCE ───────────────────────────────────────────────────────────
@api_router.get("/finance/summary")
async def finance_summary(cu: dict = Depends(admin_only)):
    # Inventory value (available vehicles)
    avail = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(1000)
    inventory_value = sum(
        [await _vehicle_investment(v["id"], v) for v in avail]
    )
    # Revenue & COGS from Sales table (single source of truth)
    sales_records = await db.sales.find({}, {"_id": 0}).to_list(1000)
    total_revenue = sum(_sale_revenue(s) for s in sales_records)
    # Dedupe: a vehicle sold, returned, then resold appears in two sales rows but its
    # investment (purchase price + expenses) should only count once toward COGS.
    sold_vehicle_ids = {s["vehicle_id"] for s in sales_records}
    total_cogs = 0
    for vid in sold_vehicle_ids:
        v = await db.vehicles.find_one({"id": vid}, {"_id": 0})
        if v:
            total_cogs += await _vehicle_investment(vid, v)
    gross_profit = total_revenue - total_cogs

    # Vendor payables
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(100)
    vendor_payables = sum([await _vendor_payable(v["id"]) for v in vendors])

    # EMI receivables
    emis = await db.emi_records.find({"status": "active"}, {"_id": 0}).to_list(200)
    emi_receivables = sum([await _emi_remaining(e["id"], e.get("loan_amount", 0)) for e in emis])

    partners = await db.partners.find({}, {"_id": 0}).to_list(100)
    total_capital = sum(p.get("capital_contribution", 0) for p in partners)

    return {
        "inventory_value": inventory_value,
        "total_revenue": total_revenue,
        "total_cogs": total_cogs,
        "gross_profit": gross_profit,
        "profit_margin_pct": round((gross_profit / total_revenue * 100), 2) if total_revenue > 0 else 0,
        "vendor_payables": vendor_payables,
        "emi_receivables": emi_receivables,
        "total_partner_capital": total_capital,
        "vehicles_in_stock": len(avail),
        "vehicles_sold": len(sales_records),
    }

# ── REPORTS ───────────────────────────────────────────────────────────
@api_router.get("/reports/dashboard")
async def dashboard_stats(cu: dict = Depends(admin_only)):
    total = await db.vehicles.count_documents({})
    available = await db.vehicles.count_documents({"status": "available"})
    reserved = await db.vehicles.count_documents({"status": "reserved"})
    in_repair = await db.vehicles.count_documents({"status": "in_repair"})

    avail_v = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(1000)
    locked_capital = sum([await _vehicle_investment(v["id"], v) for v in avail_v])
    aging = _aging_counts(avail_v)

    # Use Sales table as single source of truth for sold count & profit
    sales_records = await db.sales.find({}, {"_id": 0}).to_list(1000)
    sold = len(sales_records)
    total_profit = 0
    for s in sales_records:
        if s.get("returned"):
            # The vehicle's investment cost stays attributed to inventory (it'll be
            # subtracted again on its actual resale) — only the retained refund fee
            # counts as profit here, so it isn't double-charged against COGS.
            total_profit += s.get("retained_amount", 0)
            continue
        v = await db.vehicles.find_one({"id": s["vehicle_id"]}, {"_id": 0})
        if v:
            inv = await _vehicle_investment(s["vehicle_id"], v)
            total_profit += s.get("total_amount", 0) - inv

    vendors = await db.vendors.find({}, {"_id": 0}).to_list(100)
    total_vendor_due = sum([await _vendor_payable(v["id"]) for v in vendors])

    return {
        "total_vehicles": total, "available": available, "sold": sold,
        "reserved": reserved, "in_repair": in_repair,
        "locked_capital": locked_capital, "total_realized_profit": total_profit,
        "dead_stock_count": aging["dead"], "slow_moving_count": aging["slow"],
        "normal_count": aging["normal"], "fresh_count": aging["fresh"],
        "pending_jobs": await db.job_cards.count_documents({"status": "pending"}),
        "in_progress_jobs": await db.job_cards.count_documents({"status": "in_progress"}),
        "total_customers": await db.customers.count_documents({}),
        "total_vendor_due": total_vendor_due,
        "total_vendors": await db.vendors.count_documents({}),
    }

@api_router.get("/reports/inventory")
async def inventory_report(cu: dict = Depends(admin_only)):
    vehicles = await db.vehicles.find({}, {"_id": 0}).to_list(1000)
    report = {"by_brand": {}, "by_status": {}, "by_aging": {"fresh": 0, "normal": 0, "slow": 0, "dead": 0},
              "by_source": {}, "slow_moving": [], "dead_stock": [], "by_fuel": {}}
    for v in vehicles:
        brand = v.get("brand", "Unknown")
        report["by_brand"][brand] = report["by_brand"].get(brand, 0) + 1
        st = v.get("status", "available")
        report["by_status"][st] = report["by_status"].get(st, 0) + 1
        src = v.get("purchase_source", "Unknown")
        if src not in report["by_source"]: report["by_source"][src] = {"count": 0}
        report["by_source"][src]["count"] += 1
        fuel = v.get("fuel_type", "Petrol")
        report["by_fuel"][fuel] = report["by_fuel"].get(fuel, 0) + 1
        if v.get("status") == "available":
            ag = stock_aging(v.get("purchase_date", ""))
            cat = ag["category"]
            if cat in report["by_aging"]: report["by_aging"][cat] += 1
            item = {"id": v["id"], "brand": v.get("brand"), "model": v.get("model"),
                    "year": v.get("year"), "days": ag["days"],
                    "purchase_price": v.get("purchase_price"), "selling_price": v.get("selling_price")}
            if cat == "slow": report["slow_moving"].append(item)
            elif cat == "dead": report["dead_stock"].append(item)
    return report

@api_router.get("/reports/financial")
async def financial_report(cu: dict = Depends(admin_only)):
    sold = await db.vehicles.find({"status": "sold"}, {"_id": 0}).to_list(1000)
    monthly = {}
    for v in sold:
        sd = v.get("sold_date") or v.get("updated_at", "")
        month = sd[:7] if sd else "unknown"
        if month not in monthly: monthly[month] = {"revenue": 0, "investment": 0, "profit": 0, "count": 0}
        exps = await db.expenses.find({"vehicle_id": v["id"]}, {"_id": 0}).to_list(200)
        inv = v.get("purchase_price", 0) + v.get("accessories_cost", 0) + sum(e["amount"] for e in exps)
        sp = v.get("selling_price") or 0
        monthly[month]["revenue"] += sp
        monthly[month]["investment"] += inv
        monthly[month]["profit"] += sp - inv
        monthly[month]["count"] += 1
    partners = await db.partners.find({}, {"_id": 0}).to_list(100)
    total_profit = sum(m["profit"] for m in monthly.values())
    partner_shares = [{"name": p["name"], "stake": p["stake_percentage"],
                       "capital": p["capital_contribution"],
                       "profit_share": round(total_profit * p["stake_percentage"] / 100, 2)} for p in partners]
    return {"monthly_breakdown": monthly, "total_profit": total_profit, "partner_shares": partner_shares}

# ── ACCOUNTING SUMMARY ────────────────────────────────────────────────
@api_router.get("/reports/accounting-summary")
async def accounting_summary(start_date: str, end_date: str, cu: dict = Depends(admin_only)):
    """Returns cost/sales/profit for vehicles purchased/sold within [start_date, end_date]."""
    # Vehicles purchased in period (total cost = purchase + expenses)
    purchased = await db.vehicles.find(
        {"purchase_date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
    ).to_list(5000)
    total_cost, purchase_count = 0, len(purchased)
    for v in purchased:
        exps = await db.expenses.find({"vehicle_id": v["id"]}, {"_id": 0}).to_list(200)
        total_cost += v.get("purchase_price", 0) + v.get("accessories_cost", 0) + sum(e["amount"] for e in exps)

    # Sales in period — use Sales table as source of truth
    sales_in_period = await db.sales.find(
        {"sale_date": {"$gte": start_date, "$lte": end_date}}, {"_id": 0}
    ).to_list(5000)
    total_sales, total_investment_sold, sold_count = 0, 0, len(sales_in_period)
    for s in sales_in_period:
        total_sales += _sale_revenue(s)
        if s.get("returned"):
            # Retained refund fee has no cost basis subtracted — the vehicle's investment
            # is still attributed to inventory until it's actually resold.
            continue
        v = await db.vehicles.find_one({"id": s["vehicle_id"]}, {"_id": 0})
        if v:
            exps = await db.expenses.find({"vehicle_id": s["vehicle_id"]}, {"_id": 0}).to_list(200)
            total_investment_sold += v.get("purchase_price", 0) + v.get("accessories_cost", 0) + sum(e["amount"] for e in exps)

    net_profit = total_sales - total_investment_sold
    return {
        "period": {"start": start_date, "end": end_date},
        "total_cost": total_cost,
        "purchase_count": purchase_count,
        "total_sales": total_sales,
        "sold_count": sold_count,
        "net_profit": net_profit,
        "total_investment_sold": total_investment_sold,
    }

# ── AUDIT LOGS ────────────────────────────────────────────────────────
@api_router.get("/audit-logs")
async def get_audit_logs(cu: dict = Depends(admin_only)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return logs

# ── LEADS (storefront Sell / Exchange / Book Service submissions) ─────
@api_router.get("/leads")
async def get_leads(cu: dict = Depends(admin_only)):
    return await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.put("/leads/{lid}")
async def update_lead(lid: str, lead: LeadUpdate, cu: dict = Depends(admin_only)):
    r = await db.leads.update_one({"id": lid}, {"$set": {"status": lead.status}})
    if r.matched_count == 0: raise HTTPException(404, "Lead not found")
    return await db.leads.find_one({"id": lid}, {"_id": 0})

@api_router.delete("/leads/{lid}")
async def delete_lead(lid: str, cu: dict = Depends(admin_only)):
    r = await db.leads.delete_one({"id": lid})
    if r.deleted_count == 0: raise HTTPException(404, "Lead not found")
    return {"message": "Deleted"}

# ── SETTINGS (storefront branding/contact info) ────────────────────────
@api_router.get("/settings")
async def get_settings(cu: dict = Depends(admin_only)):
    s = await db.settings.find_one({"id": "general"}, {"_id": 0})
    return s or {}

@api_router.put("/settings")
async def update_settings(settings: SettingsUpdate, cu: dict = Depends(admin_only)):
    updates = {k: v for k, v in settings.model_dump().items() if v is not None}
    await db.settings.update_one({"id": "general"}, {"$set": updates}, upsert=True)
    return await db.settings.find_one({"id": "general"}, {"_id": 0})

# ── STARTUP ───────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "admin",
            "password_hash": hash_pw("admin123"), "name": "Super admin", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info("Default admin created: admin / admin123")
    else:
        # Super admin: the original account, unchanged except display name.
        await db.users.update_one({"username": "admin"}, {"$set": {"name": "Super admin"}})

    ADDITIONAL_ACCOUNTS = [
        {"username": "frontdesk", "password": "frontdesk123", "name": "Front desk stock", "role": "stock_supervisor"},
        {"username": "parts", "password": "parts123", "name": "Parts department", "role": "parts_supervisor"},
    ]
    for acct in ADDITIONAL_ACCOUNTS:
        if not await db.users.find_one({"username": acct["username"]}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "username": acct["username"],
                "password_hash": hash_pw(acct["password"]), "name": acct["name"], "role": acct["role"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"Default account created: {acct['username']} / {acct['password']}")
    if await db.partners.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await db.partners.insert_many([
            {"id": str(uuid.uuid4()), "name": "Partner A", "capital_contribution": 500000, "stake_percentage": 33.33, "contact": "", "created_at": now},
            {"id": str(uuid.uuid4()), "name": "Partner B", "capital_contribution": 500000, "stake_percentage": 33.33, "contact": "", "created_at": now},
            {"id": str(uuid.uuid4()), "name": "You (Owner)", "capital_contribution": 500000, "stake_percentage": 33.34, "contact": "", "created_at": now},
        ])
    if not await db.settings.find_one({"id": "general"}):
        await db.settings.insert_one({
            "id": "general",
            "logo_url": "https://images.unsplash.com/photo-1777288411485-1eb05bd4a289?q=80&w=880&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
            "business_name": "G&G AUTO Enterprises",
            "contact_phone": "9860087161",
            "contact_email": "info@ggautonp.com",
            "address": "Nayabasti, Boudha",
            "hero_image_url": "https://images.unsplash.com/photo-1622185135505-2d795003994a?q=80&w=1470&auto=format&fit=crop",
            "service_image_url": "",
        })

app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])


# ══════════════════════════════════════════════════════════════════════
# ── VEHICLE PHOTO UPLOAD ──────────────────────────────────────────────
# Stored as base64 in MongoDB (db.vehicle_photos), NOT local disk — Render's
# free-tier filesystem is ephemeral and wipes local files on every restart,
# which was causing uploaded photos/docs to vanish after the backend slept.
# ══════════════════════════════════════════════════════════════════════
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}

def _upload_type_ok(file: UploadFile, allowed_types: set, allowed_extensions: set) -> bool:
    """True if the upload's content-type OR filename extension is on the allow-list.
    Browsers (Windows Chrome/Edge especially) frequently can't identify HEIC/HEIF —
    e.g. photos extracted from a zip lose the extended-attribute MIME hint — and report
    a generic "application/octet-stream" instead. Falling back to the extension avoids
    rejecting legitimate photos just because the browser guessed wrong; the bytes are
    still decoded (and validated) for real by Pillow at compression time below."""
    if file.content_type in allowed_types:
        return True
    ext = os.path.splitext(file.filename or "")[1].lower()
    return ext in allowed_extensions

_EXT_CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf",
}

def _resolved_content_type(file: UploadFile) -> str:
    """The content-type to actually store. Falls back to a lookup by extension when the
    browser reported a generic/missing type — otherwise the wrong MIME ends up baked into
    the stored `data:` URI and browsers refuse to render or download it correctly."""
    if file.content_type and file.content_type != "application/octet-stream":
        return file.content_type
    ext = os.path.splitext(file.filename or "")[1].lower()
    return _EXT_CONTENT_TYPES.get(ext, file.content_type or "application/octet-stream")

MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5 MB, enforced on the compressed output
RAW_UPLOAD_MAX = 25 * 1024 * 1024  # 25 MB cap on the original file straight off a phone camera
PHOTO_MAX_DIMENSION = 1600  # px, longest side
PHOTO_JPEG_QUALITY = 80

def _compress_photo(content: bytes) -> tuple[bytes, str]:
    """Downscales and re-encodes an uploaded photo as JPEG. Raw phone-camera
    uploads were routinely 2-3MB+, which meant next/image on the storefront
    had to download the full original from Render on every cache miss just
    to produce a ~30KB resized thumbnail — this is why the storefront felt
    slow. Compressing once at upload time fixes it for every consumer."""
    img = Image.open(io.BytesIO(content))
    img = ImageOps.exif_transpose(img)  # respect phone camera orientation before resizing
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=PHOTO_JPEG_QUALITY, optimize=True)
    return out.getvalue(), "image/jpeg"

def _photo_out(p: dict) -> dict:
    return {"id": p["id"], "filename": p["filename"], "uploaded_at": p["uploaded_at"],
            "size": p["size"], "url": f"data:{p['content_type']};base64,{p['data']}"}

@api_router.get("/vehicles/{vid}/photos")
async def get_vehicle_photos(vid: str, cu: dict = Depends(require("vehicle_media", "view"))):
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0, "id": 1})
    if not v: raise HTTPException(404, "Vehicle not found")
    photos = await db.vehicle_photos.find({"vehicle_id": vid}, {"_id": 0}).sort("uploaded_at", 1).to_list(200)
    return [_photo_out(p) for p in photos]

@api_router.post("/vehicles/{vid}/photos")
async def upload_vehicle_photo(vid: str, file: UploadFile = File(...), cu: dict = Depends(require("vehicle_media", "create"))):
    v = await db.vehicles.find_one({"id": vid})
    if not v: raise HTTPException(404, "Vehicle not found")
    if not _upload_type_ok(file, ALLOWED_IMAGE_TYPES, IMAGE_EXTENSIONS):
        raise HTTPException(400, f"File type {file.content_type} not allowed. Use JPEG/PNG/WebP/HEIC.")
    content = await file.read()
    if len(content) > RAW_UPLOAD_MAX:
        raise HTTPException(400, "File too large. Max 25MB.")
    content_type = _resolved_content_type(file)
    try:
        content, content_type = _compress_photo(content)
    except Exception:
        logger.warning(f"Photo compression failed for upload to vehicle {vid}, storing original", exc_info=True)
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(400, "File too large. Max 5MB.")
    photo_id = str(uuid.uuid4())
    photo = {
        "id": photo_id, "vehicle_id": vid, "filename": file.filename or f"{photo_id}.jpg",
        "content_type": content_type, "data": base64.b64encode(content).decode("ascii"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "size": len(content),
    }
    await db.vehicle_photos.insert_one(photo)
    return _photo_out(photo)

@api_router.delete("/vehicles/{vid}/photos/{photo_id}")
async def delete_vehicle_photo(vid: str, photo_id: str, cu: dict = Depends(require("vehicle_media", "delete"))):
    r = await db.vehicle_photos.delete_one({"id": photo_id, "vehicle_id": vid})
    if r.deleted_count == 0: raise HTTPException(404, "Photo not found")
    return {"message": "Photo deleted"}

# ══════════════════════════════════════════════════════════════════════
# ── LEGAL DOCUMENT UPLOAD ─────────────────────────────────────────────
# Also stored as base64 in MongoDB (db.legal_documents) for the same reason.
# ══════════════════════════════════════════════════════════════════════
ALLOWED_DOC_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
DOC_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}
DOC_TYPES = ["bluebook", "insurance", "tax_clearance", "transfer", "other"]

def _doc_out(d: dict) -> dict:
    return {"id": d["id"], "filename": d["filename"], "doc_type": d["doc_type"],
            "original_name": d["original_name"], "uploaded_at": d["uploaded_at"], "size": d["size"],
            "url": f"data:{d['content_type']};base64,{d['data']}"}

@api_router.get("/vehicles/{vid}/legal-documents")
async def get_legal_documents(vid: str, cu: dict = Depends(require("vehicle_media", "view"))):
    v = await db.vehicles.find_one({"id": vid}, {"_id": 0, "id": 1})
    if not v: raise HTTPException(404, "Vehicle not found")
    docs = await db.legal_documents.find({"vehicle_id": vid}, {"_id": 0}).sort("uploaded_at", 1).to_list(200)
    return [_doc_out(d) for d in docs]

@api_router.post("/vehicles/{vid}/legal-documents")
async def upload_legal_document(vid: str, file: UploadFile = File(...), doc_type: str = Form("other"), cu: dict = Depends(require("vehicle_media", "create"))):
    v = await db.vehicles.find_one({"id": vid})
    if not v: raise HTTPException(404, "Vehicle not found")
    if not _upload_type_ok(file, ALLOWED_DOC_TYPES, DOC_EXTENSIONS):
        raise HTTPException(400, "Only PDF/JPEG/PNG/HEIC allowed for documents.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 10MB.")
    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id, "vehicle_id": vid, "filename": file.filename or f"{doc_id}.pdf",
        "content_type": _resolved_content_type(file), "data": base64.b64encode(content).decode("ascii"),
        "doc_type": doc_type, "original_name": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "size": len(content),
    }
    await db.legal_documents.insert_one(doc)
    # Update status field
    status_field = f"{doc_type}_status" if doc_type != "other" else None
    if status_field: await db.vehicles.update_one({"id": vid}, {"$set": {status_field: "ok"}})
    return _doc_out(doc)

@api_router.delete("/vehicles/{vid}/legal-documents/{doc_id}")
async def delete_legal_document(vid: str, doc_id: str, cu: dict = Depends(require("vehicle_media", "delete"))):
    r = await db.legal_documents.delete_one({"id": doc_id, "vehicle_id": vid})
    if r.deleted_count == 0: raise HTTPException(404, "Document not found")
    return {"message": "Document deleted"}

# ══════════════════════════════════════════════════════════════════════
# ── SPARE PARTS ───────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════
class SparePartCreate(BaseModel):
    name: str
    category: str = "General"
    brand_compatibility: Optional[str] = None
    part_number: Optional[str] = None
    quantity: int = 0
    unit_cost: float = 0
    selling_price: Optional[float] = None
    vendor_id: Optional[str] = None
    bill_no: Optional[str] = None
    entry_date: Optional[str] = None
    supplier: Optional[str] = None  # kept for backward compat
    min_stock_alert: int = 2
    location: Optional[str] = None
    notes: Optional[str] = None

class SparePartUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand_compatibility: Optional[str] = None
    part_number: Optional[str] = None
    quantity: Optional[int] = None
    unit_cost: Optional[float] = None
    selling_price: Optional[float] = None
    vendor_id: Optional[str] = None
    bill_no: Optional[str] = None
    entry_date: Optional[str] = None
    supplier: Optional[str] = None
    min_stock_alert: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None

@api_router.get("/spare-parts")
async def get_spare_parts(category: Optional[str] = None, low_stock: Optional[bool] = None, cu: dict = Depends(require("spare_parts", "view"))):
    query = {}
    if category: query["category"] = category
    parts = await db.spare_parts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if low_stock: parts = [p for p in parts if p.get("quantity", 0) <= p.get("min_stock_alert", 2)]
    # Batch-fetch vendor names
    vendor_ids = {p["vendor_id"] for p in parts if p.get("vendor_id")}
    vendor_map = {}
    if vendor_ids:
        vdocs = await db.vendors.find({"id": {"$in": list(vendor_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
        vendor_map = {v["id"]: v["name"] for v in vdocs}
    for p in parts:
        p["total_value"] = p.get("quantity", 0) * p.get("unit_cost", 0)
        p["low_stock"] = p.get("quantity", 0) <= p.get("min_stock_alert", 2)
        p["margin"] = round(((p.get("selling_price", 0) - p.get("unit_cost", 0)) / p.get("unit_cost", 1)) * 100, 1) if p.get("selling_price") and p.get("unit_cost") else None
        p["vendor_name"] = vendor_map.get(p.get("vendor_id", ""))
    return parts

@api_router.post("/spare-parts")
async def create_spare_part(part: SparePartCreate, cu: dict = Depends(require("spare_parts", "create"))):
    doc = {"id": str(uuid.uuid4()), **part.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    if not doc.get("entry_date"): doc["entry_date"] = datetime.now(timezone.utc).date().isoformat()
    await db.spare_parts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/spare-parts/{pid}")
async def update_spare_part(pid: str, part: SparePartUpdate, cu: dict = Depends(require("spare_parts", "edit"))):
    upd = {k: v for k, v in part.dict().items() if v is not None}
    if not upd: raise HTTPException(400, "No fields to update")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.spare_parts.update_one({"id": pid}, {"$set": upd})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    doc = await db.spare_parts.find_one({"id": pid}, {"_id": 0})
    return doc

@api_router.delete("/spare-parts/{pid}")
async def delete_spare_part(pid: str, cu: dict = Depends(require("spare_parts", "delete"))):
    r = await db.spare_parts.delete_one({"id": pid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Deleted"}

@api_router.post("/spare-parts/{pid}/adjust-stock")
async def adjust_spare_stock(pid: str, req: dict, cu: dict = Depends(require("spare_parts", "edit"))):
    delta = req.get("delta", 0)
    p = await db.spare_parts.find_one({"id": pid}, {"_id": 0, "quantity": 1})
    if not p: raise HTTPException(404, "Not found")
    new_qty = max(0, p.get("quantity", 0) + int(delta))
    await db.spare_parts.update_one({"id": pid}, {"$set": {"quantity": new_qty}})
    return {"quantity": new_qty}

@api_router.post("/spare-parts/{pid}/stock-out")
async def stock_out_part(pid: str, req: PartStockOut, cu: dict = Depends(require("spare_parts", "edit"))):
    p = await db.spare_parts.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    if req.quantity <= 0: raise HTTPException(400, "Quantity must be positive")
    current_qty = p.get("quantity", 0)
    if req.quantity > current_qty: raise HTTPException(400, f"Insufficient stock. Available: {current_qty}")
    new_qty = current_qty - req.quantity
    await db.spare_parts.update_one({"id": pid}, {"$set": {"quantity": new_qty}})
    txn = {
        "id": str(uuid.uuid4()), "part_id": pid, "part_name": p.get("name"),
        "type": "out", "quantity": req.quantity, "reason": req.reason,
        "date": req.date or datetime.now(timezone.utc).isoformat()[:10],
        "job_id": req.job_id, "notes": req.notes,
        "created_by": cu.get("username"), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.part_transactions.insert_one(txn)
    txn.pop("_id", None)
    return {"quantity": new_qty, "transaction": txn}

@api_router.get("/spare-parts/summary")
async def spare_parts_summary(cu: dict = Depends(require("spare_parts", "view"))):
    parts = await db.spare_parts.find({}, {"_id": 0}).to_list(1000)
    total_value = sum(p.get("quantity", 0) * p.get("unit_cost", 0) for p in parts)
    low_stock = [p for p in parts if p.get("quantity", 0) <= p.get("min_stock_alert", 2)]
    categories = list({p.get("category", "General") for p in parts})
    return {"total_parts": len(parts), "total_value": total_value, "low_stock_count": len(low_stock), "categories": categories}

@api_router.get("/spare-parts/{pid}/transactions")
async def get_part_transactions(pid: str, cu: dict = Depends(require("spare_parts", "view"))):
    txns = await db.part_transactions.find({"part_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return txns

# ══════════════════════════════════════════════════════════════════════
# ── WEBSITE SYNC (hamroauto.com.np) ───────────────────────────────────
# ══════════════════════════════════════════════════════════════════════
@api_router.get("/sync/export")
async def export_for_website(cu: dict = Depends(admin_only)):
    """Export available inventory in hamroauto.com.np listing format."""
    vehicles = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(200)
    listings = []
    for v in vehicles:
        photos = await db.vehicle_photos.find({"vehicle_id": v["id"]}, {"_id": 0}).sort("uploaded_at", 1).to_list(50)
        listings.append({
            "title": f"{v.get('brand')} {v.get('model')} {v.get('year')}",
            "brand": v.get("brand"), "model": v.get("model"), "year": v.get("year"),
            "price": v.get("selling_price"), "engine_cc": v.get("engine_cc"),
            "fuel_type": v.get("fuel_type"), "ownership": v.get("ownership_number"),
            "color": v.get("color"), "condition": v.get("condition"),
            "km_run": v.get("kilometer_run"), "registration": v.get("registration_number"),
            "notes": v.get("notes"),
            "docs": {
                "bluebook": v.get("bluebook_status"), "insurance": v.get("insurance_status"),
                "tax": v.get("tax_clearance_status"), "transfer": v.get("transfer_status"),
            },
            "photos": [f"data:{p['content_type']};base64,{p['data']}" for p in photos],
            "contact": "Hamro G&G Auto · Kathmandu · 98XXXXXXXX",
            "source": "hamro_gng_auto",
            "exported_at": datetime.now(timezone.utc).isoformat(),
        })
    return {"count": len(listings), "listings": listings, "exported_at": datetime.now(timezone.utc).isoformat()}

@api_router.post("/sync/push")
async def push_to_website(cu: dict = Depends(admin_only)):
    """Simulate push to hamroauto.com.np — in production connect to their API."""
    vehicles = await db.vehicles.find({"status": "available"}, {"_id": 0}).to_list(200)
    sync_log = {"pushed_at": datetime.now(timezone.utc).isoformat(), "count": len(vehicles),
                "status": "exported", "message": f"Ready to sync {len(vehicles)} vehicles to hamroauto.com.np"}
    await db.sync_logs.insert_one({**sync_log, "id": str(uuid.uuid4())})
    sync_log.pop("_id", None)
    return sync_log

# ══════════════════════════════════════════════════════════════════════
# ── PUBLIC SHOP API (no auth — safe for an external storefront site) ──
# Read-only. Only ever returns the explicit allowlist below — never spread
# a raw vehicle dict here. Fields intentionally EXCLUDED as internal/
# sensitive: purchase_price, accessories_cost, minimum_selling_price,
# vendor_id, purchase_from, purchase_source, chassis_number, engine_number,
# customer_id, salesperson_id/name, discount, notes, created_by/at.
# ══════════════════════════════════════════════════════════════════════
def _public_vehicle_fields(v: dict) -> dict:
    return {
        "id": v.get("id"),
        "title": f"{v.get('brand', '')} {v.get('model', '')} {v.get('year', '')}".strip(),
        "brand": v.get("brand"),
        "model": v.get("model"),
        "variant": v.get("variant"),
        "type": v.get("vehicle_type", "bike"),
        "year": v.get("year"),
        "engine_cc": v.get("engine_cc"),
        "fuel_type": v.get("fuel_type"),
        "ownership_number": v.get("ownership_number"),
        "kilometer_run": v.get("kilometer_run"),
        "condition": v.get("condition"),
        "condition_rating": v.get("condition_rating"),
        "color": v.get("color"),
        "registration_number": v.get("registration_number"),
        "price": v.get("selling_price"),
        "status": "available",
        "created_at": v.get("created_at"),
    }

def _public_photo_url(request: Request, vid: str, photo_id: str) -> str:
    return f"{request.base_url}api/public/vehicles/{vid}/photos/{photo_id}"

@api_router.get("/public/vehicles")
async def public_list_vehicles(request: Request):
    """Public, unauthenticated listing of available vehicles for an external shop frontend.
    Returns one cover photo URL per vehicle (the first uploaded) to keep the payload light —
    use /public/vehicles/{id} for the full photo gallery of a single vehicle."""
    vehicles = await db.vehicles.find({"status": "available"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for v in vehicles:
        item = _public_vehicle_fields(v)
        cover = await db.vehicle_photos.find_one({"vehicle_id": v["id"]}, {"_id": 0}, sort=[("uploaded_at", 1)])
        item["cover_photo"] = _public_photo_url(request, v["id"], cover["id"]) if cover else None
        item["image_urls"] = [item["cover_photo"]] if cover else []
        out.append(item)
    return {"count": len(out), "vehicles": out}

@api_router.get("/public/vehicles/{vid}")
async def public_get_vehicle(vid: str, request: Request):
    """Public, unauthenticated single-vehicle detail with the full photo gallery."""
    v = await db.vehicles.find_one({"id": vid, "status": "available"}, {"_id": 0})
    if not v: raise HTTPException(404, "Vehicle not found or not available")
    item = _public_vehicle_fields(v)
    photos = await db.vehicle_photos.find({"vehicle_id": vid}, {"_id": 0}).sort("uploaded_at", 1).to_list(50)
    item["image_urls"] = [_public_photo_url(request, vid, p["id"]) for p in photos]
    item["photos"] = item["image_urls"]  # kept for backwards compatibility with earlier consumers
    return item

@api_router.get("/public/vehicles/{vid}/photos/{photo_id}")
async def public_get_photo(vid: str, photo_id: str):
    """Serves a single vehicle photo as a real image response (not JSON) — this gives
    hamroauto.com.np (or any consumer) a stable HTTPS URL per photo, so it can be added
    to an image-CDN allowlist (e.g. Next.js next/image remotePatterns) instead of having
    to handle inline base64 data URIs."""
    p = await db.vehicle_photos.find_one({"id": photo_id, "vehicle_id": vid}, {"_id": 0})
    if not p: raise HTTPException(404, "Photo not found")
    return Response(content=base64.b64decode(p["data"]), media_type=p["content_type"])

@api_router.get("/public/settings")
async def public_get_settings():
    """Public, unauthenticated site branding/contact info for the storefront."""
    s = await db.settings.find_one({"id": "general"}, {"_id": 0, "id": 0})
    return s or {}

@api_router.post("/public/leads")
async def public_create_lead(lead: LeadCreate):
    """Public, unauthenticated — Sell / Exchange / Book Service form submissions
    from the storefront. Reviewed and managed from the admin Leads screen."""
    l = lead.model_dump()
    l["id"] = str(uuid.uuid4())
    l["status"] = "new"
    l["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.leads.insert_one(l)
    l.pop("_id", None)
    return l

@app.on_event("shutdown")
async def shutdown(): client.close()

app.include_router(api_router)