import { canAccessPath, marketingTabsFor, featureOn, featureForPath, ALL_FEATURES_ON, itemsMode, STATUS_FEATURE, ROLE_FEATURE, GENERIC_TERMS } from "./permissions";

const all = ALL_FEATURES_ON;
const off = (...keys) => ({ ...all, ...Object.fromEntries(keys.map((k) => [k, false])) });

test("no features known: nothing is hidden (role-only behaviour as before)", () => {
  for (const f of [null, undefined]) {
    expect(canAccessPath("admin", "/jobs", f)).toBe(true);
    expect(marketingTabsFor("admin", f)).toEqual(["leads", "crm", "share", "offers", "visits"]);
  }
});

test("a switched-off feature hides its page, even for admin", () => {
  expect(canAccessPath("admin", "/jobs", off("stock.job_cards"))).toBe(false);
  expect(canAccessPath("admin", "/warranty", off("stock.warranty"))).toBe(false);
  expect(canAccessPath("admin", "/sanakhat", off("stock.sanakhat"))).toBe(false);
  expect(canAccessPath("admin", "/spare-parts", off("stock.spare_parts"))).toBe(false);
  expect(canAccessPath("admin", "/ai", off("stock.ai_assistant"))).toBe(false);
  expect(canAccessPath("admin", "/jobs", all)).toBe(true);
});

test("the role still decides first: a feature that is on does not open a page the role cannot see", () => {
  expect(canAccessPath("social_media", "/jobs", all)).toBe(false);
  expect(canAccessPath("sanakhat_officer", "/sanakhat", all)).toBe(true);
  expect(canAccessPath("sanakhat_officer", "/sanakhat", off("stock.sanakhat"))).toBe(false);
  expect(canAccessPath("parts_supervisor", "/jobs", off("stock.job_cards"))).toBe(false);
});

test("core pages are never hidden by a feature", () => {
  const nothingOn = Object.fromEntries(Object.keys(all).map((k) => [k, false]));
  for (const p of ["/", "/sales", "/inventory", "/ledger", "/reports", "/finance", "/settings"]) {
    expect(canAccessPath("admin", p, nothingOn)).toBe(true);
  }
});

test("marketing tabs follow their features; no tab left means no Marketing page", () => {
  expect(marketingTabsFor("admin", off("stock.offers", "stock.visits"))).toEqual(["leads", "crm", "share"]);
  expect(marketingTabsFor("social_media", off("stock.share"))).toEqual([]);
  expect(canAccessPath("social_media", "/marketing", off("stock.share"))).toBe(false);
  expect(canAccessPath("admin", "/marketing", off("stock.leads", "stock.crm", "stock.share", "stock.offers", "stock.visits"))).toBe(false);
  expect(canAccessPath("admin", "/marketing", off("stock.offers"))).toBe(true);
});

test("a missing key in a loaded map reads as the catalogue default", () => {
  expect(featureOn({}, "stock.warranty")).toBe(true);
  expect(featureOn({}, "stock.vehicles")).toBe(false);
  expect(featureOn({ "stock.vehicles": true }, "stock.vehicles")).toBe(true);
  expect(featureOn({}, "something.core")).toBe(true);
});

test("paths map to their feature", () => {
  expect(featureForPath("/jobs")).toBe("stock.job_cards");
  expect(featureForPath("/jobs/12")).toBe("stock.job_cards");
  expect(featureForPath("/jobsx")).toBe(null);
  expect(featureForPath("/sales")).toBe(null);
});

describe("items mode and feature-owned statuses/roles", () => {
  test("only an organization that says vehicles are off is in items mode", () => {
    expect(itemsMode(null)).toBe(false);
    expect(itemsMode({ "stock.vehicles": true })).toBe(false);
    expect(itemsMode({ "stock.vehicles": false })).toBe(true);
    expect(itemsMode({ "stock.crm": true })).toBe(true); // a loaded map without the key reads as the catalogue default: off
  });
  test("In Repair and Scrap follow Job Cards, parts and sanakhat roles follow their features", () => {
    expect(STATUS_FEATURE.in_repair).toBe("stock.job_cards");
    expect(STATUS_FEATURE.scrap).toBe("stock.job_cards");
    expect(ROLE_FEATURE.parts_supervisor).toBe("stock.spare_parts");
    expect(featureOn({ "stock.job_cards": false }, STATUS_FEATURE.in_repair)).toBe(false);
    expect(featureOn(null, STATUS_FEATURE.in_repair)).toBe(true);
  });
  test("front desk and social media can open Items, parts staff cannot", () => {
    expect(canAccessPath("stock_supervisor", "/items")).toBe(true);
    expect(canAccessPath("social_media", "/items")).toBe(true);
    expect(canAccessPath("parts_supervisor", "/items")).toBe(false);
    expect(canAccessPath("admin", "/items", { "stock.vehicles": false })).toBe(true);
  });
  test("the generic words never say vehicle", () => {
    expect(Object.values(GENERIC_TERMS).some((v) => /vehicle/i.test(v))).toBe(false);
  });
});
