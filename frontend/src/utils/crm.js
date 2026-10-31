import { Footprints, Globe, Facebook, Users, MoreHorizontal } from "lucide-react";

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
