"""Score an intent router on the held-out Bitext test split plus product_inquiry messages.

    uv run python evals/run_router_eval.py --router prompt
"""

import argparse
import json
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

from support_agent.config import SPLITS
from support_agent.router import PromptRouter

HERE = Path(__file__).parent
ROUTERS = {"prompt": PromptRouter}


def load():
    items = [json.loads(line) for line in (SPLITS / "test.jsonl").read_text().splitlines()]
    items += [json.loads(line) for line in
              (HERE / "product_inquiry_test.jsonl").read_text().splitlines()]
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--router", choices=ROUTERS, default="prompt")
    args = parser.parse_args()

    router = ROUTERS[args.router]()
    items = load()
    rows, latencies = [], []
    for item in items:
        start = time.perf_counter()
        predicted = router.classify(item["instruction"])
        latencies.append(time.perf_counter() - start)
        rows.append({**item, "predicted": predicted, "correct": predicted == item["intent"]})

    latencies.sort()
    confusions = Counter((r["intent"], r["predicted"]) for r in rows if not r["correct"])
    summary = {
        "router": router.name, "n": len(rows),
        "accuracy": round(sum(r["correct"] for r in rows) / len(rows), 3),
        "p50_ms": round(latencies[len(latencies) // 2] * 1000),
        "p95_ms": round(latencies[int(len(latencies) * 0.95)] * 1000),
        "top_confusions": [f"{a} -> {b} ({n})" for (a, b), n in confusions.most_common(8)],
    }
    print(json.dumps(summary, indent=2))
    out = HERE / "results" / f"router-{args.router}-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "results": rows}, indent=2))


if __name__ == "__main__":
    main()
