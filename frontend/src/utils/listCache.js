// Remembers the last list a page loaded, in memory, so going back to that page shows it at once while the page quietly loads a
// fresh copy (the page always does; this only fills the gap). Gone when the tab is reloaded, on logout, and after any save or
// delete (so a list is never shown from before the user's own change). Older than 30 minutes is not shown. Whatever the
// refresh brings replaces it within a moment, so the only catch is that a list can be a moment out of date at first.
const TTL_MS = 30 * 60 * 1000;
const store = new Map();
let generation = 0;

const copy = (data) => {
  try { return structuredClone(data); } catch { return JSON.parse(JSON.stringify(data)); }
};

// Take a ticket before asking the server; hand it back to remember(). If anything was saved in between, the answer may predate the
// change, so it is not kept.
export const cacheTicket = () => generation;

// The remembered list, or undefined if there is none (or it is too old). Each caller gets its own copy.
export const peek = (key) => {
  const entry = store.get(key);
  if (!entry || Date.now() - entry.at > TTL_MS) return undefined;
  return copy(entry.data);
};

export const remember = (key, data, ticket) => {
  if (ticket !== undefined && ticket !== generation) return;
  try { store.set(key, { at: Date.now(), data: copy(data) }); } catch { /* not worth failing a page over */ }
};

export const forgetAll = () => {
  generation += 1;
  store.clear();
};
