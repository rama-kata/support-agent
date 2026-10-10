"""Split Bitext into train/test and build the resolved-conversation knowledge base.

- data/splits/test.jsonl: 10 held-out messages per intent (270), never indexed or trained on.
- data/splits/train.jsonl: everything else, used for the KB and (Day 2) LoRA fine-tuning.
- data/kb_examples.jsonl: 15 diverse train examples per intent with filled responses.
"""

import json
import random

import pandas as pd

from support_agent.config import DATA, RAW, SPLITS
from support_agent.text import fill_instruction, fill_response

TEST_PER_INTENT = 10
KB_PER_INTENT = 15


def write_jsonl(path, records):
    with open(path, "w") as f:
        f.writelines(json.dumps(r) + "\n" for r in records)


def main():
    rng = random.Random(7)
    df = pd.read_csv(RAW / "bitext.csv")
    df["instruction"] = [fill_instruction(t, rng) for t in df["instruction"]]
    df = df.drop_duplicates("instruction")

    test = df.groupby("intent", group_keys=False).sample(TEST_PER_INTENT, random_state=7)
    train = df.drop(test.index)

    # Prefer clean, well-formed messages for the KB ('Q' = colloquial, 'Z' = typos).
    clean = train[~train["flags"].str.contains("Z|Q")]
    kb = clean.groupby("intent", group_keys=False).sample(KB_PER_INTENT, random_state=7)

    SPLITS.mkdir(parents=True, exist_ok=True)
    cols = ["instruction", "intent", "category", "response"]
    write_jsonl(SPLITS / "train.jsonl", train[cols].to_dict("records"))
    write_jsonl(SPLITS / "test.jsonl", test[cols].to_dict("records"))
    write_jsonl(DATA / "kb_examples.jsonl", [
        {**r, "response": fill_response(r["response"])} for r in kb[cols].to_dict("records")
    ])
    print(f"train={len(train)} test={len(test)} kb={len(kb)}")


if __name__ == "__main__":
    main()
