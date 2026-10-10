"""Measure one turn of the feedback loop on topics the store didn't cover.

    uv run python evals/run_flywheel.py

Customers ask about two topics with no intent, no policy and no training data (wine
tastings, gift cards). For each topic, 15 messages play the role of thumbs-down feedback
that an admin labels (intent + the policy text that should have been used); 15 different
messages are held out. The agent is scored on the held-out set before (v1) and after (v2)
applying the feedback, with no retraining. Bitext router accuracy is re-checked to catch
regressions. Runs on temporary copies of the store, indexes and learned data.
"""

import argparse
import json
import shutil
import tempfile
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent


def score_reply(reply: str, message: dict) -> bool:
    """Each test message lists the facts its answer needs: every group must be matched by
    at least one of its alternatives ("2 weeks" or "two weeks")."""
    low = reply.lower()
    return all(any(alt.lower() in low for alt in group) for group in message["facts"])


def summarize(rows: list[dict], topics: dict) -> dict:
    by_topic = {}
    for t in topics:
        subset = [r for r in rows if r["topic"] == t]
        by_topic[t] = {"routed": f"{sum(r['routed'] for r in subset)}/{len(subset)}",
                       "answered": f"{sum(r['answered'] for r in subset)}/{len(subset)}"}
    return {"routed": round(sum(r["routed"] for r in rows) / len(rows), 3),
            "answered": round(sum(r["answered"] for r in rows) / len(rows), 3),
            "by_topic": by_topic}


def rescore(path: Path):
    """Re-score a saved run from its stored replies (no agent calls)."""
    data = json.loads(path.read_text())
    topics = json.loads((HERE / "flywheel" / "topics.json").read_text())
    facts = {m["text"]: m["facts"] for m in map(json.loads, (HERE / "flywheel" / "messages.jsonl")
                                                .read_text().splitlines()) if "facts" in m}
    for version in ("v1", "v2"):
        for r in data[version]:
            r["facts"] = facts[r["text"]]
            r["answered"] = score_reply(r["reply"], r)
        data["summary"][version].update(summarize(data[version], topics))
    path.write_text(json.dumps(data, indent=2))
    print(json.dumps(data["summary"], indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rescore", type=Path, help="re-score a saved results file")
    args = parser.parse_args()
    if args.rescore:
        rescore(args.rescore)
        return

    tmp = Path(tempfile.mkdtemp())
    from support_agent import config, flywheel, retrieval, router, store

    shutil.copytree(config.INDEX_DIR, tmp / "index")
    shutil.copy(config.STORE_DB, tmp / "store.db")
    retrieval.INDEX_DIR = router.INDEX_DIR = tmp / "index"
    store.STORE_DB = tmp / "store.db"
    flywheel.LEARNED = tmp / "learned"

    from support_agent.graph import build_graph, run_turn, turn_reply

    topics = json.loads((HERE / "flywheel" / "topics.json").read_text())
    messages = [json.loads(line) for line in
                (HERE / "flywheel" / "messages.jsonl").read_text().splitlines()]
    test = [m for m in messages if m["split"] == "test"]
    feedback = [m for m in messages if m["split"] == "feedback"]
    bitext = [json.loads(line) for line in
              (config.SPLITS / "test.jsonl").read_text().splitlines()]

    knn = router.KnnRouter()
    graph = build_graph(router=knn)

    def evaluate(version: str) -> dict:
        rows = []
        for i, m in enumerate(test):
            start = time.perf_counter()
            state = run_turn(graph, m["text"], customer_id=186, thread_id=f"{version}-{i}")
            rows.append({
                **m, "intent": state.get("intent"), "reply": turn_reply(state["messages"]),
                "latency_s": round(time.perf_counter() - start, 2),
            })
            rows[-1]["routed"] = rows[-1]["intent"] == m["topic"]
            rows[-1]["answered"] = score_reply(rows[-1]["reply"], m)
            print(f"[{version} {i + 1}/{len(test)}] routed={rows[-1]['routed']!s:5} "
                  f"answered={rows[-1]['answered']!s:5} {m['text'][:50]}")
        bitext_acc = sum(knn.classify(b["instruction"]) == b["intent"] for b in bitext) / len(bitext)
        return {**summarize(rows, topics), "bitext_router_accuracy": round(bitext_acc, 3),
                "rows": rows}

    v1 = evaluate("v1")
    labels = [flywheel.Label(
        message=m["text"], intent=m["topic"],
        intent_description=topics[m["topic"]]["description"],
        policy_title=topics[m["topic"]]["policy_title"],
        policy_text=topics[m["topic"]]["policy_text"],
    ) for m in feedback]
    applied = flywheel.apply(labels, router=knn, root=flywheel.LEARNED)
    print(f"applied feedback: {applied}")
    v2 = evaluate("v2")

    summary = {
        "test_messages": len(test), "feedback_labels": len(labels), "applied": applied,
        "v1": {k: v for k, v in v1.items() if k != "rows"},
        "v2": {k: v for k, v in v2.items() if k != "rows"},
    }
    print(json.dumps(summary, indent=2))
    out = HERE / "results" / f"flywheel-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "v1": v1["rows"], "v2": v2["rows"]}, indent=2))
    print(f"saved {out}")


if __name__ == "__main__":
    main()
