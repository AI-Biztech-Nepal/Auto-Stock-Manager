import { Footprints, Globe, Facebook, Users, MoreHorizontal, Phone, MessageCircle, Store, StickyNote, CalendarCheck } from "lucide-react";
import { adToBsDate, BS_MONTHS, getBSMonthRange, getCurrentBSDate } from "./nepali-date";

// How a customer found the shop. The keys are what the backend stores (CRM_SOURCES in server.py).
export const SOURCES = [
  { key: "walk_in", label: "Walk-in", Icon: Footprints },
  { key: "website", label: "Website", Icon: Globe },
  { key: "facebook", label: "Facebook", Icon: Facebook },
  { key: "referral", label: "Referral", Icon: Users },
  { key: "other", label: "Other", Icon: MoreHorizontal },
];

export const SOURCE_LABEL = { ...Object.fromEntries(SOURCES.map(s => [s.key, s.label])), unknown: "Not tagged yet" };

// One colour per source, used for pills and bars everywhere in the CRM.
export const SOURCE_STYLE = {
  walk_in: { pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  website: { pill: "bg-indigo-50 text-indigo-700", bar: "bg-indigo-500" },
  facebook: { pill: "bg-blue-50 text-blue-700", bar: "bg-blue-500" },
  referral: { pill: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  other: { pill: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
  unknown: { pill: "bg-red-50 text-red-600", bar: "bg-slate-300" },
};

// The "Referred by" column is just a name: who referred them, or for "Other" the detail typed in
// ("TikTok", "signboard"). The kind of lead itself lives in the "Lead" dropdown.
export const referredByLabel = (c) => {
  if (c.source === "referral") return c.referred_by_name || c.source_note || "";
  if (c.source === "other") return c.source_note || "";
  return "";
};

export const leadLabel = (c) => (c.source ? SOURCE_LABEL[c.source] : "");

export const EMPTY_SOURCE ={ source: "", source_note: "", referred_by_id: "" };

export const sourceFromCustomer = (c) => ({
  source: c?.source || "",
  source_note: c?.source_note || "",
  referred_by_id: c?.referred_by_id || "",
});

// A source is complete once one is picked; a referral also needs to say who referred them
// (a customer from the list, or a name typed in for someone who isn't a customer).
export const isSourceComplete = (v) =>
  !!v?.source && (v.source !== "referral" || !!v.referred_by_id || !!(v.source_note || "").trim());

// What the API stores; blanks become null so a cleared field really clears it.
export const sourcePayload = (v) => ({
  source: v?.source || null,
  source_note: (v?.source_note || "").trim() || null,
  referred_by_id: v?.source === "referral" ? v.referred_by_id || null : null,
});

// ── lead status ───────────────────────────────────────────────────────
// Converted is never picked by hand: it is what a customer is once a sale stands (the backend works it out).
export const LEAD_STATUSES = [
  { key: "new", label: "New", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  { key: "contacted", label: "Contacted", pill: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  { key: "interested", label: "Interested", pill: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" },
  { key: "converted", label: "Converted", pill: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  { key: "lost", label: "Lost", pill: "bg-red-50 text-red-700 ring-1 ring-red-200" },
];
export const STATUS_BY_KEY = Object.fromEntries(LEAD_STATUSES.map(s => [s.key, s]));
export const PICKABLE_STATUSES = LEAD_STATUSES.filter(s => s.key !== "converted");

// What was done: the kinds of entry in a customer's history.
export const CONTACT_KINDS = {
  call: { label: "Call", Icon: Phone, tone: "bg-sky-50 text-sky-700" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, tone: "bg-green-50 text-green-700" },
  visit: { label: "Showroom visit", Icon: Store, tone: "bg-indigo-50 text-indigo-700" },
  note: { label: "Note", Icon: StickyNote, tone: "bg-amber-50 text-amber-700" },
  followup: { label: "Follow-up done", Icon: CalendarCheck, tone: "bg-emerald-50 text-emerald-700" },
  other: { label: "Other", Icon: MoreHorizontal, tone: "bg-slate-100 text-slate-600" },
};
export const LOGGABLE_KINDS = ["call", "whatsapp", "visit", "note", "other"];
export const FOLLOWUP_PURPOSES = ["Call back", "Showroom visit", "Test drive", "Share price", "Documents", "Payment reminder", "Service reminder"];

// ── dates: Bikram Sambat first (as everywhere in the app), times in the browser's (Nepal) time ──
const pad = (n) => String(n).padStart(2, "0");
export const localDateOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const shortBS = (iso) => {
  const bs = iso ? adToBsDate(localDateOf(iso)) : null;
  return bs ? `${BS_MONTHS[bs.month - 1]} ${bs.day}` : "—";
};
export const fullBS = (iso) => {
  const bs = iso ? adToBsDate(localDateOf(iso)) : null;
  return bs ? `${bs.year} ${BS_MONTHS[bs.month - 1]} ${bs.day}` : "—";
};
export const timeOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};
export const dateTimeTitle = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${localDateOf(iso)} ${timeOf(iso)}`;
};
// <input type="datetime-local"> works in local time with no zone: 2026-11-05T10:00
export const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
export const tomorrowAt = (hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d.toISOString());
};
// This BS month and the one before it as AD dates, for the "new this month" card and its trend.
export const bsMonthRanges = () => {
  const bs = getCurrentBSDate();
  if (!bs) return null;
  const prevYear = bs.month === 1 ? bs.year - 1 : bs.year;
  const prev = getBSMonthRange(prevYear, bs.month === 1 ? 12 : bs.month - 1);
  const cur = getBSMonthRange(bs.year, bs.month);
  return cur && prev ? { month_start: cur.start, month_end: cur.end, prev_start: prev.start, prev_end: prev.end } : null;
};

export const phoneLooksValid = (p) => /^\+?[\d\s\-()]{7,20}$/.test((p || "").trim()) && (p.match(/\d/g) || []).length >= 7 && (p.match(/\d/g) || []).length <= 15;

// The initials avatar: one soft colour per name, the same everywhere.
const AVATARS = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700"];
export const avatarTone = (name) => AVATARS[[...(name || "")].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATARS.length];
export const initialsOf = (name) => (name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
export const waNumber = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `977${d}` : d;
};
