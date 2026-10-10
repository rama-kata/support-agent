"""Input guardrails that run before any model sees the message."""

import re

CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CVV = re.compile(r"\b(cvv|cvc|security code)\s*:?\s*\d{3,4}\b", re.IGNORECASE)

INJECTION = [
    r"ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?|rules)",
    r"disregard (your|the|all) (instructions|rules|guidelines)",
    r"(reveal|show|print|repeat) (me )?(your|the) (system )?(prompt|instructions)",
    r"you are now (in )?(developer|dan|jailbreak|admin)",
    r"act as (an? )?(admin|administrator|developer|supervisor) (with|and)",
    r"(customer|user)[ _]?id\s*[:=]",
    r"approve (this|my|the) refund (yourself|without)",
]
INJECTION_RE = re.compile("|".join(INJECTION), re.IGNORECASE)


def _luhn(digits: str) -> bool:
    total, parity = 0, len(digits) % 2
    for i, ch in enumerate(digits):
        d = int(ch)
        if i % 2 == parity:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def redact_pii(text: str) -> tuple[str, list[str]]:
    """Mask card numbers, SSNs and CVVs. Returns the masked text and what was found."""
    found = []

    def card(match):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn(digits):
            found.append("card")
            return "[REDACTED_CARD]"
        return match.group()

    text = CARD.sub(card, text)
    text, n = SSN.subn("[REDACTED_SSN]", text)
    found += ["ssn"] * n
    text, n = CVV.subn(lambda m: f"{m.group(1)} [REDACTED]", text)
    found += ["cvv"] * n
    return text, found


def detect_injection(text: str) -> bool:
    return bool(INJECTION_RE.search(text))
