"""Real timings, kept in memory (they start over when the app restarts) so slow screens can be seen instead of guessed at.

Two views of the same screens:
  * SERVER: how long the app took to answer, how many database questions it asked and how long they took in all.
    A middleware (PerfMiddleware, wired up in server.py) records every /api request and adds a `Server-Timing` header to the
    answer, which the browser's developer tools show under the request's Timing tab.
  * STAFF DEVICES: how long each request took as seen from the browser, which also includes the trip over the internet and
    the download. The web app reports these in small batches (POST /api/perf/report), together with how long the app took
    to open. The gap between the two views is the network.
GET /api/admin/performance (admin only) returns both, and Settings shows them.
"""
import contextvars
import re
import time
from collections import deque
from datetime import datetime, timezone

KEEP = 300          # samples kept per screen
MAX_SCREENS = 400   # distinct screens kept (a safety limit, the real number is well under 100)
SLOW_MS = 1500      # a request slower than this is also listed on its own
_STARTED = time.time()

_request = contextvars.ContextVar("perf_request", default=None)
_server: dict = {}
_client: dict = {}
_boots: deque = deque(maxlen=100)
_slow: deque = deque(maxlen=60)

_UUID = re.compile(r"/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_NUMBER = re.compile(r"/\d+(?=/|$)")
_SKIP = ("/api/perf/report", "/api/presence/heartbeat")


def normalize(path: str) -> str:
    """`/api/vehicles/3f2a...-uuid/photos` -> `/api/vehicles/{id}/photos`, so every vehicle counts as the same screen."""
    path = _NUMBER.sub("/{n}", _UUID.sub("/{id}", (path or "").split("?")[0]))
    return path[:120]


# ── one request ─────────────────────────────────────────────────────────────
def begin():
    state = {"q": 0, "db_ms": 0.0}
    return state, _request.set(state)


def end(token) -> None:
    try:
        _request.reset(token)
    except ValueError:  # reset from another context: the value just stays until this task ends
        pass


def note_query(ms: float) -> None:
    """Called by the database layer after every question (including the time spent waiting for a free connection)."""
    state = _request.get()
    if state is not None:
        state["q"] += 1
        state["db_ms"] += ms


def _bucket(store: dict, key: str):
    b = store.get(key)
    if b is None:
        if len(store) >= MAX_SCREENS:
            return None
        b = store[key] = {"n": 0, "ms": deque(maxlen=KEEP), "db": deque(maxlen=KEEP), "q": deque(maxlen=KEEP), "kb": deque(maxlen=KEEP), "err": 0, "max": 0.0}
    return b


def finish(method: str, path: str, status: int, total_ms: float, state: dict) -> None:
    path = normalize(path)
    if path in _SKIP:
        return
    b = _bucket(_server, f"{method} {path}")
    if b is not None:
        b["n"] += 1
        b["ms"].append(total_ms)
        b["db"].append(state["db_ms"])
        b["q"].append(state["q"])
        b["max"] = max(b["max"], total_ms)
        if status >= 500 or status == 0:
            b["err"] += 1
    if total_ms >= SLOW_MS:
        _slow.appendleft({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "route": f"{method} {path}", "ms": round(total_ms),
                          "db_ms": round(state["db_ms"]), "queries": state["q"], "status": status})


# ── reports from the web app ─────────────────────────────────────────────────
def add_client(samples, boot) -> None:
    for s in samples[:100]:
        try:
            path = normalize(s.p if s.p.startswith("/api") else "/api" + s.p)
            ms = float(s.ms)
        except (TypeError, ValueError, AttributeError):
            continue
        if path in _SKIP or not (0 <= ms < 600_000):
            continue
        b = _bucket(_client, f"{(s.m or 'GET').upper()[:7]} {path}")
        if b is None:
            continue
        b["n"] += 1
        b["ms"].append(ms)
        if s.kb is not None and 0 <= s.kb < 1_000_000:
            b["kb"].append(float(s.kb))
        b["max"] = max(b["max"], ms)
        if s.st is not None and s.st >= 500:
            b["err"] += 1
    if boot is not None:
        _boots.append({"ttfb": boot.ttfb, "dcl": boot.dcl, "load": boot.load, "js_kb": boot.js_kb, "cached": bool(boot.cached)})


# ── reading it back ──────────────────────────────────────────────────────────
def _pct(values, p: float):
    v = sorted(values)
    if not v:
        return None
    return v[min(len(v) - 1, int(round(p * (len(v) - 1))))]


def _med(values):
    return _pct(values, 0.5)


def _round(x):
    return None if x is None else round(x)


def snapshot() -> dict:
    routes = []
    for key in sorted(set(_server) | set(_client)):
        s, c = _server.get(key), _client.get(key)
        routes.append({
            "route": key,
            "server": None if not s else {"calls": s["n"], "p50": _round(_med(s["ms"])), "p95": _round(_pct(s["ms"], 0.95)), "max": _round(s["max"]),
                                           "db_p50": _round(_med(s["db"])), "queries": _round(_med(s["q"])), "errors": s["err"]},
            "staff": None if not c else {"calls": c["n"], "p50": _round(_med(c["ms"])), "p95": _round(_pct(c["ms"], 0.95)), "max": _round(c["max"]),
                                          "kb": _round(_med(c["kb"])) if c["kb"] else None, "errors": c["err"]},
        })
    # worst first: what staff felt if we have it (it includes the network), otherwise what the server took
    routes.sort(key=lambda r: -((r["staff"] or r["server"])["p50"] or 0))
    boots = list(_boots)
    boot = None
    if boots:
        fresh = [b for b in boots if not b["cached"]]
        boot = {"opens": len(boots), "first_byte_p50": _round(_med([b["ttfb"] for b in boots if b["ttfb"] is not None])),
                "ready_p50": _round(_med([b["dcl"] for b in boots if b["dcl"] is not None])),
                "loaded_p50": _round(_med([b["load"] for b in boots if b["load"] is not None])),
                "script_kb_downloaded_p50": _round(_med([b["js_kb"] for b in fresh if b["js_kb"] is not None])) if fresh else None,
                "opened_from_cache": len(boots) - len(fresh)}
    return {"since": datetime.fromtimestamp(_STARTED, timezone.utc).isoformat(timespec="seconds"),
            "minutes_running": round((time.time() - _STARTED) / 60), "routes": routes[:60], "boot": boot, "slow": list(_slow)}


class PerfMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware, which would copy every response body): times /api requests and adds Server-Timing."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api"):
            return await self.app(scope, receive, send)
        t0 = time.perf_counter()
        state, token = begin()
        status = {"code": 0}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                took = (time.perf_counter() - t0) * 1000
                header = f'app;dur={took:.0f}, db;dur={state["db_ms"]:.0f};desc="{state["q"]} queries"'
                message = {**message, "headers": [*message.get("headers", []), (b"server-timing", header.encode())]}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            finish(scope.get("method", "GET"), scope["path"], status["code"], (time.perf_counter() - t0) * 1000, state)
            end(token)
