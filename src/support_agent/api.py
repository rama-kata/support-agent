"""HTTP API for the web demo.

    uv run uvicorn support_agent.api:app --port 8000

Auth: a demo login returns a signed token naming one persona; every request resolves the
customer from that token, and tools get it through the run config (never from the model).
Chat streams Server-Sent Events: the agent's steps live (intent, tool calls, tool results),
then the reply once the verify node has passed it, so a retracted claim never reaches the UI.
"""

import json
import os
import secrets
import shutil
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, Field

from support_agent import flywheel, store
from support_agent.config import DATA, MINIMUM_AGE, STORE_DB, STORE_NAME
from support_agent.graph import build_graph, is_customer, turn_reply
from support_agent.router import INTENTS, default_router

DEMO = DATA / "demo"
DEMO_STORE = DEMO / "store.db"
APP_DB = DEMO / "app.db"
TOKEN_TTL = timedelta(hours=12)
MESSAGES_PER_MINUTE = 12
# The demo runs on a home GPU behind a public URL: cap total load, not just per persona
# (visitors share personas, so one script could otherwise multiply the per-persona limit).
GLOBAL_MESSAGES_PER_MINUTE = 40
MAX_WAITING = 3          # turns queued behind the one running; beyond that, answer 503
QUEUE_TIMEOUT_S = 90     # a queued turn gives up rather than holding a worker forever
MAX_MESSAGE_CHARS = 1000

PERSONAS = {
    186: "Long-time customer with orders in every state",
    51: "Regular customer, a few shipments on the way",
    101: "Several orders still processing: try cancelling one",
    150: "Under 21: the agent won't share product information",
}

TOOL_LABELS = {
    "search_help_center": "Checking store policies",
    "list_my_orders": "Looking up your recent orders",
    "lookup_order": "Looking up order {order_id}",
    "cancel_order": "Cancelling order {order_id}",
    "change_shipping_address": "Updating the address on {order_id}",
    "request_refund": "Requesting a ${amount} refund on {order_id}",
    "search_products": "Searching the catalog for “{query}”",
    "stock_outlook": "Checking stock and the demand forecast",
    "escalate_to_human": "Handing off to a team member",
}

APP_SCHEMA = """
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, customer_id INTEGER,
    thread_id TEXT, turn_id TEXT, message TEXT, reply TEXT, intent TEXT, tools TEXT,
    rating INTEGER, comment TEXT, label TEXT, answer TEXT, status TEXT DEFAULT 'new');
CREATE TABLE IF NOT EXISTS turns (
    turn_id TEXT PRIMARY KEY, created_at TEXT, customer_id INTEGER, thread_id TEXT,
    message TEXT, reply TEXT, intent TEXT, tools TEXT, latency_ms INTEGER);
"""


def _secret(name: str) -> str:
    """From the environment, else generated once and kept in data/demo/."""
    if value := os.getenv(f"SUPPORT_AGENT_{name}"):
        return value
    path = DEMO / f".{name.lower()}"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(32))
        path.chmod(0o600)
    return path.read_text().strip()


def reset_demo_store():
    """Visitors change orders, so the demo runs on a copy that can be restored."""
    shutil.copy(STORE_DB, DEMO_STORE)


DEMO.mkdir(parents=True, exist_ok=True)
if not DEMO_STORE.exists():
    reset_demo_store()
store.STORE_DB = DEMO_STORE
with sqlite3.connect(APP_DB) as _conn:
    _conn.executescript(APP_SCHEMA)

JWT_SECRET = _secret("JWT_SECRET")
ADMIN_TOKEN = _secret("ADMIN_TOKEN")

_checkpoints = sqlite3.connect(DEMO / "threads.db", check_same_thread=False)
router = default_router()
graph = build_graph(router=router, checkpointer=SqliteSaver(_checkpoints))
# One agent turn at a time: the GPUs are the bottleneck, and queueing beats thrashing.
_gpu = threading.Semaphore(1)
_recent: dict[int, deque] = defaultdict(deque)
_recent_all: deque = deque()
_waiting = 0
_waiting_lock = threading.Lock()

app = FastAPI(title=f"{STORE_NAME} support agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("SUPPORT_AGENT_CORS", "http://localhost:3000")
                   .split(",") if o],
    allow_origin_regex=os.getenv("SUPPORT_AGENT_CORS_REGEX"),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def app_db():
    conn = sqlite3.connect(APP_DB)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- auth ----------

def current_customer(authorization: str = Header("")) -> int:
    token = authorization.removeprefix("Bearer ").strip()
    try:
        return int(jwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as e:
        raise HTTPException(401, "Sign in again.") from e


def require_admin(authorization: str = Header("")):
    if not secrets.compare_digest(authorization.removeprefix("Bearer ").strip(), ADMIN_TOKEN):
        raise HTTPException(403, "Admin token required.")


def _within(window: deque, limit: int) -> bool:
    now = time.monotonic()
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def rate_limit(customer_id: int):
    if _waiting >= MAX_WAITING or not _within(_recent_all, GLOBAL_MESSAGES_PER_MINUTE):
        raise HTTPException(503, "The demo is busy right now. Please try again in a minute.")
    if not _within(_recent[customer_id], MESSAGES_PER_MINUTE):
        raise HTTPException(429, "You're sending messages quickly. Try again in a minute.")


def persona(customer_id: int) -> dict:
    c = store.get_customer(customer_id)
    return {"id": c["id"], "name": c["name"], "first_name": c["name"].split()[0],
            "age": store.customer_age(c), "under_age": store.customer_age(c) < MINIMUM_AGE,
            "address": c["address"], "blurb": PERSONAS.get(customer_id, "")}


class Login(BaseModel):
    customer_id: int


@app.get("/api/health")
def health():
    return {"ok": True, "store": STORE_NAME}


@app.get("/api/personas")
def personas():
    return [persona(cid) for cid in PERSONAS]


@app.post("/api/auth/login")
def login(body: Login):
    if body.customer_id not in PERSONAS:
        raise HTTPException(404, "Unknown demo customer.")
    exp = datetime.now(UTC) + TOKEN_TTL
    token = jwt.encode({"sub": str(body.customer_id), "exp": exp}, JWT_SECRET, "HS256")
    return {"token": token, "customer": persona(body.customer_id)}


@app.get("/api/me")
def me(customer_id: int = Depends(current_customer)):
    orders = store.list_orders(customer_id, limit=12)
    return {"customer": persona(customer_id),
            "orders": [store.get_order(customer_id, o["id"]) for o in orders]}


# ---------- chat ----------

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    thread_id: str | None = None


def _event(kind: str, **data) -> str:
    return f"event: {kind}\ndata: {json.dumps(data, default=str)}\n\n"


def _tool_label(name: str, args: dict) -> str:
    try:
        return TOOL_LABELS.get(name, name).format(**args)
    except (KeyError, ValueError):
        return TOOL_LABELS.get(name, name).split(" {")[0]


def _tool_summary(msg: ToolMessage) -> dict:
    try:
        data = json.loads(msg.content)
    except ValueError:
        return {"ok": True}
    if isinstance(data, dict) and "error" in data:
        return {"ok": False, "detail": data["error"]}
    if isinstance(data, list):
        return {"ok": True, "detail": f"{len(data)} result{'s' if len(data) != 1 else ''}"}
    for key in ("status", "stock", "ticket_id"):
        if key in data:
            return {"ok": True, "detail": f"{key.replace('_', ' ')}: {data[key]}"}
    return {"ok": True}


def _stream_turn(customer_id: int, text: str, thread_id: str):
    config = {"configurable": {"customer_id": customer_id, "thread_id": thread_id},
              "recursion_limit": 20}
    global _waiting
    start = time.perf_counter()
    yield _event("start", thread_id=thread_id)
    with _waiting_lock:
        _waiting += 1
    try:
        got_gpu = _gpu.acquire(timeout=QUEUE_TIMEOUT_S)
    finally:
        with _waiting_lock:
            _waiting -= 1
    if not got_gpu:
        yield _event("error", message="The demo is busy right now. Please try again shortly.",
                     detail="queue_timeout")
        return
    try:
        state = None
        for update in graph.stream({"messages": [HumanMessage(content=text)]}, config,
                                   stream_mode="updates"):
            for node, delta in update.items():
                delta = delta or {}
                if node == "guard" and delta.get("pii_found"):
                    yield _event("guard", redacted=delta["pii_found"])
                if node == "route":
                    yield _event("intent", intent=delta.get("intent"))
                for msg in delta.get("messages", []) if isinstance(delta, dict) else []:
                    if isinstance(msg, AIMessage):
                        for call in msg.tool_calls:
                            yield _event("tool_start", id=call["id"], name=call["name"],
                                         label=_tool_label(call["name"], call["args"]))
                    elif isinstance(msg, ToolMessage):
                        yield _event("tool_end", id=msg.tool_call_id, **_tool_summary(msg))
        state = graph.get_state(config).values
    finally:
        _gpu.release()

    messages = state["messages"]
    turn_id = next(m.id for m in reversed(messages) if is_customer(m))
    tools = [c["name"] for m in messages[[m.id for m in messages].index(turn_id):]
             if isinstance(m, AIMessage) for c in m.tool_calls]
    reply = turn_reply(messages)
    latency_ms = int((time.perf_counter() - start) * 1000)
    with app_db() as conn:
        conn.execute("INSERT OR REPLACE INTO turns VALUES (?,?,?,?,?,?,?,?,?)",
                     (turn_id, datetime.now(UTC).isoformat(), customer_id, thread_id,
                      messages[[m.id for m in messages].index(turn_id)].content, reply,
                      state.get("intent"), json.dumps(tools), latency_ms))
    yield _event("reply", turn_id=turn_id, text=reply, intent=state.get("intent"),
                 tools=tools, latency_ms=latency_ms, blocked=state.get("blocked", False))


@app.post("/api/chat")
def chat(body: ChatRequest, customer_id: int = Depends(current_customer)):
    rate_limit(customer_id)
    # Threads are namespaced by customer, so a client can't continue someone else's.
    thread_id = body.thread_id or uuid.uuid4().hex
    if not thread_id.startswith(f"c{customer_id}-"):
        thread_id = f"c{customer_id}-{thread_id[-32:]}"

    def events():
        try:
            yield from _stream_turn(customer_id, body.message.strip(), thread_id)
        except Exception as e:  # noqa: BLE001 - report to the client instead of a broken stream
            yield _event("error", message="Something went wrong on our side. Please try again.",
                         detail=type(e).__name__)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/threads/{thread_id}")
def thread(thread_id: str, customer_id: int = Depends(current_customer)):
    if not thread_id.startswith(f"c{customer_id}-"):
        raise HTTPException(404, "Conversation not found.")
    messages = graph.get_state({"configurable": {"thread_id": thread_id}}).values.get(
        "messages", [])
    with app_db() as conn:
        meta = {r["turn_id"]: r for r in conn.execute(
            "SELECT turn_id, intent, latency_ms FROM turns WHERE thread_id = ?", (thread_id,))}
    out = []
    for i, m in enumerate(messages):
        if is_customer(m):
            nxt = next((j for j in range(i + 1, len(messages)) if is_customer(messages[j])),
                       len(messages))
            out.append({"role": "customer", "text": m.content, "turn_id": m.id})
            row = meta.get(m.id)
            out.append({"role": "agent", "text": turn_reply(messages[: nxt]), "turn_id": m.id,
                        "steps": _turn_steps(messages[i + 1: nxt]),
                        "intent": row["intent"] if row else None,
                        "latency_ms": row["latency_ms"] if row else None})
    return {"thread_id": thread_id, "messages": out}


def _turn_steps(messages: list) -> list[dict]:
    """Tool steps of a past turn, labelled exactly as they were streamed live."""
    results = {m.tool_call_id: _tool_summary(m) for m in messages if isinstance(m, ToolMessage)}
    steps = []
    for m in messages:
        for call in getattr(m, "tool_calls", None) or []:
            summary = results.get(call["id"], {"ok": False})
            steps.append({"id": call["id"], "name": call["name"],
                          "label": _tool_label(call["name"], call["args"]),
                          "status": "ok" if summary.get("ok") else "error",
                          "detail": summary.get("detail")})
    return steps


# ---------- feedback ----------

class Feedback(BaseModel):
    turn_id: str
    rating: int = Field(ge=-1, le=1)
    comment: str | None = Field(default=None, max_length=1000)


@app.post("/api/feedback")
def feedback(body: Feedback, customer_id: int = Depends(current_customer)):
    with app_db() as conn:
        turn = conn.execute("SELECT * FROM turns WHERE turn_id = ? AND customer_id = ?",
                            (body.turn_id, customer_id)).fetchone()
        if not turn:
            raise HTTPException(404, "Message not found.")
        existing = conn.execute("SELECT id FROM feedback WHERE turn_id = ?",
                                (body.turn_id,)).fetchone()
        if existing:
            conn.execute("UPDATE feedback SET rating = ?, comment = ? WHERE id = ?",
                         (body.rating, body.comment, existing["id"]))
        else:
            conn.execute(
                "INSERT INTO feedback (created_at, customer_id, thread_id, turn_id, message, "
                "reply, intent, tools, rating, comment) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (datetime.now(UTC).isoformat(), customer_id, turn["thread_id"], body.turn_id,
                 turn["message"], turn["reply"], turn["intent"], turn["tools"], body.rating,
                 body.comment))
    return {"ok": True}


# ---------- admin ----------

@app.get("/api/admin/feedback", dependencies=[Depends(require_admin)])
def admin_feedback(status: str | None = None):
    with app_db() as conn:
        sql = "SELECT * FROM feedback" + (" WHERE status = ?" if status else "") + \
            " ORDER BY id DESC LIMIT 200"
        rows = conn.execute(sql, (status,) if status else ()).fetchall()
    return [dict(r) | {"tools": json.loads(r["tools"] or "[]")} for r in rows]


@app.get("/api/admin/stats", dependencies=[Depends(require_admin)])
def admin_stats():
    with app_db() as conn:
        turns = conn.execute("SELECT COUNT(*), AVG(latency_ms) FROM turns").fetchone()
        ratings = conn.execute(
            "SELECT SUM(rating = 1), SUM(rating = -1) FROM feedback").fetchone()
        intents = conn.execute("SELECT intent, COUNT(*) n FROM turns GROUP BY intent "
                               "ORDER BY n DESC LIMIT 10").fetchall()
    with store.connect() as conn:
        tickets = [dict(r) for r in conn.execute(
            "SELECT * FROM tickets ORDER BY id DESC LIMIT 20").fetchall()]
    return {"turns": turns[0], "avg_latency_ms": round(turns[1] or 0),
            "thumbs_up": ratings[0] or 0, "thumbs_down": ratings[1] or 0,
            "intents": [dict(r) for r in intents], "tickets": tickets}


@app.get("/api/admin/evals", dependencies=[Depends(require_admin)])
def admin_evals():
    """Latest summary per agent configuration and per router, from evals/results/."""
    results = Path(__file__).resolve().parents[2] / "evals" / "results"
    latest = {}
    for path in sorted(results.glob("*.json")):
        summary = json.loads(path.read_text())["summary"]
        if path.name.startswith("flywheel-"):
            key = "flywheel"
        elif path.name.startswith("router-"):
            key = summary.get("router")
        else:
            key = f"agent:{summary.get('router', 'prompt')}"
        latest[key] = {"file": path.name, **summary}
    return latest


@app.get("/api/admin/intents", dependencies=[Depends(require_admin)])
def admin_intents():
    learned = flywheel.Learned.load()
    return {"builtin": INTENTS, "learned": learned.intents,
            "learned_examples": len(learned.examples),
            "learned_policies": [p["title"] for p in learned.policies],
            "router": router.name, "router_learns_live": hasattr(router, "add_examples")}


class LabelRequest(BaseModel):
    intent: str = Field(min_length=2, max_length=60, pattern=r"^[a-z][a-z0-9_]*$")
    intent_description: str | None = Field(default=None, max_length=200)
    policy_title: str | None = Field(default=None, max_length=80)
    policy_text: str | None = Field(default=None, max_length=2000)


@app.post("/api/admin/feedback/{feedback_id}/label", dependencies=[Depends(require_admin)])
def admin_label(feedback_id: int, body: LabelRequest):
    learned = flywheel.Learned.load()
    if body.intent not in INTENTS and body.intent not in learned.intents \
            and not body.intent_description:
        raise HTTPException(422, "A new intent needs a short description.")
    if bool(body.policy_title) != bool(body.policy_text):
        raise HTTPException(422, "A policy needs both a title and text.")
    with app_db() as conn:
        updated = conn.execute(
            "UPDATE feedback SET label = ?, answer = ?, status = 'labeled' WHERE id = ?",
            (body.intent, json.dumps(body.model_dump(exclude={"intent"})), feedback_id),
        ).rowcount
    if not updated:
        raise HTTPException(404, "Feedback not found.")
    return {"ok": True}


@app.post("/api/admin/improve", dependencies=[Depends(require_admin)])
def admin_improve():
    """Apply all labeled feedback: the kNN router and policy index learn it immediately."""
    with app_db() as conn:
        rows = conn.execute("SELECT * FROM feedback WHERE status = 'labeled'").fetchall()
    labels = [flywheel.Label(message=r["message"], intent=r["label"],
                             **json.loads(r["answer"] or "{}")) for r in rows]
    with _gpu:  # don't change the router or index under a running turn
        result = flywheel.apply(labels, router=router)
    with app_db() as conn:
        conn.executemany("UPDATE feedback SET status = 'applied' WHERE id = ?",
                         [(r["id"],) for r in rows])
    return {"applied_feedback": len(rows), **result}


@app.post("/api/admin/reset-demo", dependencies=[Depends(require_admin)])
def admin_reset():
    with _gpu:
        reset_demo_store()
    return {"ok": True}
