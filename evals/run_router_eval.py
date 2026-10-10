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
from support_agent.router import FinetunedOllamaRouter, KnnRouter, LoraRouter, PromptRouter

HERE = Path(__file__).parent
ROUTERS = {"prompt": PromptRouter, "knn": KnnRouter, "lora": LoraRouter,
           "finetuned": FinetunedOllamaRouter}


def load():
    """Test messages tagged by source, so in-distribution and human-written accuracy can be
    reported separately."""
    items = [{**json.loads(line), "source": "bitext_heldout"}
             for line in (SPLITS / "test.jsonl").read_text().splitlines()]
    items += [{**json.loads(line), "source": "product_handwritten"}
              for line in (HERE / "product_inquiry_test.jsonl").read_text().splitlines()]
    human = HERE / "human_product_questions.txt"
    if human.exists():
        items += [{"instruction": line.strip(), "intent": "product_inquiry", "source": "human"}
                  for line in human.read_text().splitlines()
                  if line.strip() and not line.startswith("#")]
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--router", choices=ROUTERS, default="prompt")
    parser.add_argument("--adapter", help="LoRA adapter directory (lora router only)")
    parser.add_argument("--model", help="Ollama model (prompt and finetuned routers)")
    args = parser.parse_args()

    kwargs = {}
    if args.router == "lora" and args.adapter:
        kwargs["adapter"] = args.adapter
    if args.router in ("prompt", "finetuned") and args.model:
        kwargs["model"] = args.model
    router = ROUTERS[args.router](**kwargs)
    items = load()
    rows, latencies = [], []
    for item in items:
        start = time.perf_counter()
        predicted = router.classify(item["instruction"])
        latencies.append(time.perf_counter() - start)
        rows.append({**item, "predicted": predicted, "correct": predicted == item["intent"]})

    latencies.sort()
    confusions = Counter((r["intent"], r["predicted"]) for r in rows if not r["correct"])
    by_source = {}
    for source in dict.fromkeys(r["source"] for r in rows):
        hits = [r["correct"] for r in rows if r["source"] == source]
        by_source[source] = f"{sum(hits)}/{len(hits)} ({sum(hits) / len(hits):.1%})"
    summary = {
        "router": router.name, "n": len(rows),
        "accuracy": round(sum(r["correct"] for r in rows) / len(rows), 3),
        "by_source": by_source,
        "p50_ms": round(latencies[len(latencies) // 2] * 1000),
        "p95_ms": round(latencies[int(len(latencies) * 0.95)] * 1000),
        "top_confusions": [f"{a} -> {b} ({n})" for (a, b), n in confusions.most_common(8)],
    }
    print(json.dumps(summary, indent=2))
    tag = router.name.replace(":", "-").replace("/", "-")
    out = HERE / "results" / f"router-{tag}-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"summary": summary, "results": rows}, indent=2))


if __name__ == "__main__":
    main()
