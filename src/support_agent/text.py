"""Fill Bitext {{placeholder}} templates with store facts or readable slots."""

import random
import re

from support_agent.config import STORE_FACTS

PLACEHOLDER = re.compile(r"\{\{([^}]+)\}\}")


def fill_response(text: str) -> str:
    """Store-level placeholders get real values; case-specific ones become [Slot]."""
    return PLACEHOLDER.sub(lambda m: STORE_FACTS.get(m.group(1), f"[{m.group(1)}]"), text)


def fill_instruction(text: str, rng: random.Random) -> str:
    """Make customer messages look like real ones (ORD-12345 instead of {{Order Number}})."""
    values = {
        "Order Number": lambda: f"ORD-{rng.randint(10001, 11200)}",
        "Invoice Number": lambda: f"INV-{rng.randint(50000, 59999)}",
        "Person Name": lambda: rng.choice(["Ava", "Omar", "Priya", "Lucas", "Nia", "Diego"]),
        "Refund Amount": lambda: f"{rng.randint(12, 260)}",
        "Currency Symbol": lambda: "$",
        "Delivery City": lambda: rng.choice(["Rockville", "Bethesda", "Arlington"]),
        "Delivery Country": lambda: "the US",
        "Account Type": lambda: rng.choice(["Standard", "Cellar Club"]),
        "Account Category": lambda: rng.choice(["Standard", "Cellar Club"]),
    }
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), lambda: m.group(1))(), text)
