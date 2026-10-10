"""Generate synthetic `product_inquiry` training messages with the local LLM.

Bitext has no product/stock intent, so the router has nothing to learn it from. Each call
gets a few real catalog products and a writing style, so the messages vary in both content
and tone. Output: data/synthetic/product_inquiry.jsonl (training only; test messages are
written by a human so the test doesn't reward the generator's own style).
"""

import json
import random
import sqlite3

from langchain_ollama import ChatOllama
from pydantic import BaseModel

from support_agent.config import AGENT_MODEL, DATA, OLLAMA_URL, STORE_DB

N_CALLS = 60
PER_CALL = 10
STYLES = [
    "very short and casual, lowercase, no punctuation",
    "texting style with slang and abbreviations (u, ur, rn, yall, pls)",
    "with one or two typos, like someone typing fast on a phone",
    "polite and complete sentences",
    "a little impatient",
    "rambling, gives context about an occasion (party, dinner, gift, game day)",
    "asks about price or a budget",
    "asks whether it will still be available later (this weekend, next week)",
    "asks for a recommendation without naming a specific product",
    "asks about quantity for a large event (cases, kegs, how many bottles)",
]
ASPECTS = ["availability", "restock date", "price", "recommendation", "size or pack options",
           "how many are left"]


class Batch(BaseModel):
    messages: list[str]


def casual_name(name: str) -> str:
    return name.split(" - ")[0].title()


def main():
    rng = random.Random(3)
    with sqlite3.connect(STORE_DB) as conn:
        names = [r[0] for r in conn.execute("SELECT name FROM products")]
    # num_predict caps runaway generations: at high temperature the model sometimes keeps
    # appending to the JSON list until it hits the context limit.
    llm = ChatOllama(model=AGENT_MODEL, base_url=OLLAMA_URL, temperature=0.9, num_predict=500,
                     reasoning=False).with_structured_output(Batch, method="json_schema")

    out = DATA / "synthetic" / "product_inquiry.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Resume: keep what's already generated and skip duplicates of it.
    seen = set()
    if out.exists():
        with open(out) as f:
            seen = {json.loads(line)["instruction"].lower() for line in f}
    with open(out, "a") as f:
        for i in range(N_CALLS):
            style = STYLES[i % len(STYLES)]
            products = ", ".join(casual_name(n) for n in rng.sample(names, 4))
            prompt = (
                f"Write {PER_CALL} different messages a customer might send to a wine, beer "
                "and spirits store's support chat, asking about products. Cover these aspects "
                f"across the messages: {', '.join(rng.sample(ASPECTS, 3))}. Some may mention "
                f"these products (shorten or misspell names like real people do): {products}. "
                "Others can mention common brands or just a type of drink. "
                f"Style: {style}. Do not mention orders, refunds, accounts or shipping. "
                "Return only the messages."
            )
            try:
                batch = llm.invoke(prompt).messages
            except ValueError:  # truncated JSON from a capped runaway generation
                print(f"[{i + 1}/{N_CALLS}] skipped malformed batch", flush=True)
                continue
            for msg in batch[:PER_CALL]:
                key = msg.strip().lower()
                if key and key not in seen:
                    seen.add(key)
                    f.write(json.dumps({"instruction": msg.strip(),
                                        "intent": "product_inquiry", "style": style}) + "\n")
            f.flush()
            print(f"[{i + 1}/{N_CALLS}] {len(seen)} unique", flush=True)


if __name__ == "__main__":
    main()
