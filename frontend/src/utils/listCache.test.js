import api from "./api";
import { cacheTicket, forgetAll, peek, remember } from "./listCache";

// A fake server: every request succeeds at once, so only the interceptors (which forget the remembered lists after a change) are under test.
const fakeServer = () => {
  api.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: "OK", headers: {}, config });
};

beforeEach(() => {
  if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => "test-device" };   // the test environment has none; real browsers do
  forgetAll();
  fakeServer();
  jest.useRealTimers();
});

describe("remembering the last list", () => {
  test("nothing is remembered at first", () => {
    expect(peek("customers")).toBeUndefined();
  });

  test("a remembered list comes back, as a copy the page can change freely", () => {
    const list = [{ id: 1, name: "A" }];
    remember("customers", list);
    const first = peek("customers");
    expect(first).toEqual(list);
    first[0].name = "changed";
    first.push({ id: 2 });
    expect(peek("customers")).toEqual([{ id: 1, name: "A" }]);
    list[0].name = "changed too";   // and changing the original afterwards does not change what is remembered either
    expect(peek("customers")).toEqual([{ id: 1, name: "A" }]);
  });

  test("an empty list is a real answer, not 'nothing remembered'", () => {
    remember("jobs", []);
    expect(peek("jobs")).toEqual([]);
  });

  test("a list older than 30 minutes is not shown", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-13T10:00:00Z"));
    remember("jobs", [1]);
    jest.setSystemTime(new Date("2026-11-13T10:29:00Z"));
    expect(peek("jobs")).toEqual([1]);
    jest.setSystemTime(new Date("2026-11-13T10:31:00Z"));
    expect(peek("jobs")).toBeUndefined();
  });

  test("forgetting clears everything", () => {
    remember("a", [1]); remember("b", [2]);
    forgetAll();
    expect(peek("a")).toBeUndefined();
    expect(peek("b")).toBeUndefined();
  });

  test("an answer that was asked for before a change is not kept (it may predate the change)", () => {
    const ticket = cacheTicket();      // the page asks the server...
    forgetAll();                       // ...someone saves something meanwhile...
    remember("customers", [{ id: 1 }], ticket);   // ...and the old answer arrives
    expect(peek("customers")).toBeUndefined();
    remember("customers", [{ id: 2 }], cacheTicket());   // an answer asked for after the change is kept
    expect(peek("customers")).toEqual([{ id: 2 }]);
  });
});

describe("what makes the app forget", () => {
  test("a save, an edit and a delete each forget the remembered lists", async () => {
    for (const call of [() => api.post("/customers", {}), () => api.put("/customers/1", {}), () => api.delete("/customers/1")]) {
      remember("customers", [1]);
      await call();
      expect(peek("customers")).toBeUndefined();
    }
  });

  test("a failed save forgets them too (the server may have changed anyway)", async () => {
    remember("customers", [1]);
    api.defaults.adapter = async (config) => { const err = new Error("boom"); err.config = config; err.response = { status: 500, data: {}, headers: {}, config }; throw err; };
    await expect(api.post("/customers", {})).rejects.toBeTruthy();
    expect(peek("customers")).toBeUndefined();
  });

  test("reading a list does not", async () => {
    remember("customers", [1]);
    await api.get("/customers");
    expect(peek("customers")).toEqual([1]);
  });

  test("the 30-second 'I am online' ping does not (it would empty the memory twice a minute)", async () => {
    remember("customers", [1]);
    await api.post("/presence/heartbeat");
    expect(peek("customers")).toEqual([1]);
  });

  test("a save that is still running when a page asks for its list does not leave an old copy behind", async () => {
    // page starts loading: takes a ticket, asks...
    const ticket = cacheTicket();
    // ...a save completes before the page's answer arrives
    await api.put("/customers/1", {});
    remember("customers", [{ stale: true }], ticket);
    expect(peek("customers")).toBeUndefined();
  });
});
