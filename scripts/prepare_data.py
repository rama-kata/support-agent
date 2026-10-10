"""Split Bitext into train/test and build the resolved-conversation knowledge base.

Bitext is generated from templates with surface variants of each sentence (lowercased,
punctuation stripped, typos). A random split puts variants of the same sentence on both
sides, so a nearest-neighbour "router" scored 100% by memorisation. To prevent that:
  1. split by sentence family: rows identical apart from case, punctuation, numbers and
     placeholder values share a group and land on the same side;
  2. purge from train any row whose embedding is >= 0.95 cosine to a test row (typo variants).

- data/splits/test.jsonl: 10 held-out messages per intent (270).
- data/splits/train.jsonl: the rest, minus purged near-duplicates.
- data/kb_examples.jsonl: 15 clean train examples per intent with filled responses.
"""

import json
import random
import re

import numpy as np
import pandas as pd

from support_agent.config import DATA, RAW, SPLITS
from support_agent.retrieval import embed_model
from support_agent.text import fill_instruction, fill_response

TEST_PER_INTENT = 10
KB_PER_INTENT = 15
NEAR_DUPLICATE = 0.95


def family(raw_instruction: str) -> str:
    """Letters only, placeholders removed: 'Cancel order {{Order Number}}!' -> 'cancelorder'."""
    return re.sub(r"[^a-z]", "", re.sub(r"\{\{[^}]+\}\}", "", raw_instruction.lower()))


def write_jsonl(path, records):
    with open(path, "w") as f:
        f.writelines(json.dumps(r) + "\n" for r in records)


def unit_vectors(texts) -> np.ndarray:
    vectors = np.array(embed_model().get_text_embedding_batch(list(texts), show_progress=True))
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def main():
    rng = random.Random(7)
    df = pd.read_csv(RAW / "bitext.csv")
    df["family"] = df["instruction"].map(family)
    df["instruction"] = [fill_instruction(t, rng) for t in df["instruction"]]
    df = df.drop_duplicates("instruction").reset_index(drop=True)

    # Pick test rows one family at a time, so no family is split across train and test.
    test_idx = []
    for _, group in df.groupby("intent"):
        families = group["family"].drop_duplicates().sample(frac=1, random_state=7)
        for fam in families[:TEST_PER_INTENT]:
            test_idx.append(group[group["family"] == fam].sample(1, random_state=7).index[0])
    test = df.loc[test_idx]
    train = df[~df["family"].isin(set(test["family"]))]

    sims = unit_vectors(train["instruction"]) @ unit_vectors(test["instruction"]).T
    near = sims.max(axis=1) >= NEAR_DUPLICATE
    train = train[~near]

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
    print(f"train={len(train)} (purged {near.sum()} near-duplicates of test) "
          f"test={len(test)} kb={len(kb)}")


if __name__ == "__main__":
    main()
