import { formatNPR, formatOwnership } from "./helpers";

export const TEMPLATE_KEY = "share_stock_template_v1";
export const PLACEHOLDERS = ["title", "brand", "model", "variant", "year", "km", "cc", "fuel", "color", "owner", "condition", "reg", "price", "bluebook", "insurance", "tax", "highlights", "business", "phone", "address", "hashtags"];

// One post per vehicle. A line whose {placeholder} has no value for that vehicle is dropped,
// so the same template works for every vehicle, however much of it is filled in.
export const DEFAULT_TEMPLATE = `🔥 {title} 🔥
{highlights}

💰 Price: {price}
📅 Year: {year}
🛣️ Run: {km}
⚙️ Engine: {cc}
⛽ Fuel: {fuel}
🎨 Color: {color}
👤 Ownership: {owner}
⭐ Condition: {condition}
🔢 Reg. No: {reg}
📄 Bluebook: {bluebook}
🛡️ Insurance: {insurance}
🧾 Tax clearance: {tax}

📞 Call / WhatsApp: {phone}
📍 {address}
🏢 {business}

{hashtags}`;

const docStatus = (s) => (s === "ok" ? "Clear ✅" : null);

export const vehicleValues = (v, settings, showPrice) => {
  const km = v.kilometer_run != null && v.kilometer_run !== "" ? Number(v.kilometer_run) : null;
  const rating = v.condition_rating ? `${v.condition_rating}/10` : null;
  const docsClear = [v.bluebook_status, v.tax_clearance_status, v.insurance_status].every(s => s === "ok");
  const highlights = [
    v.ownership_number === 1 && "1st owner",
    km != null && km <= 10000 && "Low run",
    v.condition_rating >= 8 && "Excellent condition",
    docsClear && "All papers clear",
    v.year && new Date().getFullYear() - Number(v.year) <= 2 && "Almost new",
  ].filter(Boolean).join(" · ");
  const tag = (x) => x && `#${String(x).replace(/[^A-Za-z0-9]/g, "")}`;
  return {
    title: [v.brand, v.model, v.variant, v.year].filter(Boolean).join(" "),
    brand: v.brand, model: v.model, variant: v.variant, year: v.year,
    km: km != null ? `${km.toLocaleString()} km` : null,
    cc: v.engine_cc ? `${v.engine_cc}cc` : null,
    fuel: v.fuel_type, color: v.color,
    owner: v.ownership_number ? formatOwnership(v.ownership_number) : null,
    condition: [v.condition, rating].filter(Boolean).join(" · ") || null,
    reg: v.registration_number,
    price: showPrice ? (v.selling_price ? formatNPR(v.selling_price) : "Call for price") : null,
    bluebook: docStatus(v.bluebook_status),
    insurance: docStatus(v.insurance_status),
    tax: docStatus(v.tax_clearance_status),
    highlights: highlights ? `✨ ${highlights} ✨` : null,
    business: settings.business_name, phone: settings.contact_phone, address: settings.address,
    hashtags: [tag(v.brand), tag(v.model), tag(v.vehicle_type), "#SecondHand", "#Nepal"].filter(Boolean).join(" "),
  };
};

// Fields for Hamrobazar's Post Ad form. Its posting rules ban prices and phone numbers in
// titles, hype wording, and ads that mainly send buyers to another website, so this is plain
// specs: no emoji, phone or link (price and phone have their own fields on the form).
export const hamroBazarFields = (v, showPrice) => {
  const val = vehicleValues(v, {}, showPrice);
  const plain = (s) => s && String(s).replace(/\s*✅/g, "");
  const rows = [
    ["Year", val.year], ["Run", val.km], ["Engine", val.cc], ["Fuel", val.fuel], ["Color", val.color],
    ["Ownership", val.owner], ["Condition", val.condition], ["Reg. No", val.reg],
    ["Bluebook", plain(val.bluebook)], ["Insurance", plain(val.insurance)], ["Tax clearance", plain(val.tax)],
  ];
  const price = Number(v.selling_price);
  return {
    title: val.title,
    price: showPrice && price > 0 ? String(Math.round(price)) : null,
    description: rows.filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join("\n"),
  };
};

export const renderVehicle = (template, values) =>
  template
    .split("\n")
    .filter(line => !(line.match(/\{\w+\}/g) || []).some(m => !values[m.slice(1, -1)]))
    .map(line => line.replace(/\{(\w+)\}/g, (_, k) => values[k]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const buildCaption = (list, settings, showPrice, template) =>
  list.map(v => renderVehicle(template, vehicleValues(v, settings, showPrice))).join("\n\n━━━━━━━━━━\n\n");

// Photo URLs from the API are relative ("/api/vehicle-photos/..."); in the Capacitor app that
// would resolve against the app's own origin, so anchor them to the backend instead.
export const absoluteUrl = (api, url) => {
  const origin = (api.defaults.baseURL || "").replace(/\/api$/, "");
  return /^https?:/.test(url) ? url : `${origin}${url}`;
};
