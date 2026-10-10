"""Run the golden scenarios against the agent on a fresh copy of the store.

    uv run python evals/run_agent_eval.py [--limit N] [--category track]

Each scenario checks tool calls, database side effects and required/forbidden facts in the
reply. Results go to evals/results/agent-<timestamp>.json.
"""

import argparse
import json
import os
import shutil
import sqlite3
import tempfile
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent


def check(scenario, called, reply, db_path) -> list[str]:
    failures = []
    for name in scenario.get("expect_tools", []):
        if name not in called:
            failures.append(f"missing tool {name}")
    for name in scenario.get("forbid_tools", []):
        if name in called:
            failures.append(f"forbidden tool {name}")
    low = reply.lower()
    for fact in scenario.get("must_mention", []):
        if fact.lower() not in low:
            failures.append(f"reply missing '{fact}'")
    if (any_of := scenario.get("must_mention_any")) and not any(f.lower() in low for f in any_of):
        failures.append(f"reply missing any of {any_of}")
    for fact in scenario.get("must_not_mention", []):
        if fact.lower() in low:
            failures.append(f"reply leaked '{fact}'")

    expect = scenario.get("expect_db", {})
    with sqlite3.connect(db_path) as conn:
        for order_id, status in expect.get("order_status", {}).items():
            got = conn.execute("SELECT status FROM orders WHERE id = ?", (order_id,)).fetchone()[0]
            if got != status:
                failures.append(f"{order_id} status {got}, expected {status}")
        for order_id, status in expect.get("refund_status", {}).items():
            row = conn.execute("SELECT status FROM refunds WHERE order_id = ? ORDER BY id DESC",
                               (order_id,)).fetchone()
            if (row[0] if row else None) != status:
                failures.append(f"{order_id} refund {row[0] if row else None}, expected {status}")
        for order_id, address in expect.get("order_address", {}).items():
            got = conn.execute("SELECT shipping_address FROM orders WHERE id = ?",
                               (order_id,)).fetchone()[0]
            if got != address:
                failures.append(f"{order_id} address '{got}'")
        if expect.get("ticket"):
            n = conn.execute("SELECT COUNT(*) FROM tickets WHERE customer_id = ? AND id > ?",
                             (scenario["customer_id"], scenario["_tickets_before"])).fetchone()[0]
            if not n:
                failures.append("no ticket created")
    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--category")
    parser.add_argument("--model", help="agent model override")
    args = parser.parse_args()

    # Fresh store copy before support_agent is imported (config reads the env at import).
    tmp = Path(tempfile.mkdtemp()) / "store.db"
    from support_agent.config import STORE_DB
    shutil.copy(STORE_DB, tmp)
    os.environ["SUPPORT_AGENT_STORE_DB"] = str(tmp)
    from support_agent import store
    store.STORE_DB = tmp

    from langchain_core.messages import AIMessage

    from support_agent.config import AGENT_MODEL
    from support_agent.graph import build_graph, run_turn

    model = args.model or AGENT_MODEL
    graph = build_graph(model=model)
    scenarios = [json.loads(line) for line in (HERE / "scenarios.jsonl").read_text().splitlines()]
    if args.category:
        scenarios = [s for s in scenarios if s["category"] == args.category]
    scenarios = scenarios[: args.limit]

    results = []
    for i, s in enumerate(scenarios, 1):
        with sqlite3.connect(tmp) as conn:
            s["_tickets_before"] = conn.execute("SELECT COALESCE(MAX(id), 0) FROM tickets") \
                .fetchone()[0]
        start = time.perf_counter()
        state = run_turn(graph, s["message"], s["customer_id"], thread_id=s["id"])
        latency = time.perf_counter() - start
        called = [c["name"] for m in state["messages"] if isinstance(m, AIMessage)
                  for c in m.tool_calls]
        reply = state["messages"][-1].content
        failures = check(s, called, reply, tmp)
        results.append({"id": s["id"], "category": s["category"], "message": s["message"],
                        "intent": state.get("intent"), "tools": called, "reply": reply,
                        "latency_s": round(latency, 2), "passed": not failures,
                        "failures": failures})
        mark = "PASS" if not failures else "FAIL"
        print(f"[{i}/{len(scenarios)}] {mark} {s['id']:<20} {latency:5.1f}s {'; '.join(failures)}")

    by_cat = defaultdict(list)
    for r in results:
        by_cat[r["category"]].append(r["passed"])
    tool_ok = [not any(f.startswith(("missing tool", "forbidden tool")) for f in r["failures"])
               for r in results]
    latencies = sorted(r["latency_s"] for r in results)
    summary = {
        "model": model, "scenarios": len(results),
        "pass_rate": round(sum(r["passed"] for r in results) / len(results), 3),
        "tool_call_accuracy": round(sum(tool_ok) / len(results), 3),
        "p50_latency_s": latencies[len(latencies) // 2],
        "p95_latency_s": latencies[int(len(latencies) * 0.95)],
        "by_category": {c: f"{sum(v)}/{len(v)}" for c, v in sorted(by_cat.items())},
    }
    print(json.dumps(summary, indent=2))

    out = HERE / "results" / f"agent-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "results": results}, indent=2))
    print(f"saved {out}")


if __name__ == "__main__":
    main()
