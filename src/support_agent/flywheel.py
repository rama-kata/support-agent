"""The feedback loop: turn labeled feedback into knowledge the agent uses immediately.

An admin labels a thumbs-down conversation with an intent (existing or new) and, if the
store had no answer, the policy text that should have been used. `apply` then:
  - adds the labeled messages to the kNN router, which uses them on the next message
    (no retraining; the fine-tuned router picks them up at its next training run),
  - registers new intents so the agent gets a playbook for them,
  - appends new policy sections and re-indexes policies for retrieval.

Everything learned lives in data/learned/, separate from the seed data, so it can be
inspected, versioned and rolled back.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from support_agent.config import DATA

LEARNED = DATA / "learned"


@dataclass
class Learned:
    intents: dict[str, str] = field(default_factory=dict)  # name -> description
    examples: list[dict] = field(default_factory=list)  # {"instruction", "intent"}
    policies: list[dict] = field(default_factory=list)  # {"title", "text"}

    @classmethod
    def load(cls, root: Path = LEARNED) -> "Learned":
        path = root / "learned.json"
        return cls(**json.loads(path.read_text())) if path.exists() else cls()

    def save(self, root: Path = LEARNED):
        root.mkdir(parents=True, exist_ok=True)
        (root / "learned.json").write_text(json.dumps(self.__dict__, indent=2))
        (root / "policies.md").write_text(
            "".join(f"\n## {p['title']}\n{p['text'].strip()}\n" for p in self.policies))


@dataclass
class Label:
    message: str
    intent: str
    intent_description: str | None = None  # set when the intent is new
    policy_title: str | None = None  # set when the store had no answer
    policy_text: str | None = None


def apply(labels: list[Label], router=None, root: Path = LEARNED) -> dict:
    """Merge labels into the learned store, then refresh the live router and policy index."""
    learned = Learned.load(root)
    known = {(e["instruction"].lower(), e["intent"]) for e in learned.examples}
    new_examples, new_intents, new_policies = [], [], []
    titles = {p["title"].lower() for p in learned.policies}

    for label in labels:
        if label.intent_description and label.intent not in learned.intents:
            learned.intents[label.intent] = label.intent_description
            new_intents.append(label.intent)
        if (label.message.lower(), label.intent) not in known:
            example = {"instruction": label.message, "intent": label.intent}
            learned.examples.append(example)
            new_examples.append(example)
            known.add((label.message.lower(), label.intent))
        if label.policy_title and label.policy_text and label.policy_title.lower() not in titles:
            learned.policies.append({"title": label.policy_title, "text": label.policy_text})
            new_policies.append(label.policy_title)
            titles.add(label.policy_title.lower())

    learned.save(root)
    if router is not None and new_examples and hasattr(router, "add_examples"):
        router.add_examples(new_examples)
    if new_policies:
        from support_agent.retrieval import build_indexes

        build_indexes(["policies"])
    return {"examples": len(new_examples), "intents": new_intents, "policies": new_policies}
