"""Intent routing. Day 1 ships the prompting baseline; RAG (kNN) and LoRA routers plug in
behind the same interface so they can be compared on the same eval set."""

from typing import Literal, Protocol

from langchain_ollama import ChatOllama
from pydantic import BaseModel

from support_agent.config import OLLAMA_URL, ROUTER_MODEL

INTENTS = {
    "cancel_order": "cancel an order",
    "change_order": "add, remove or swap items in an order",
    "place_order": "buy something or place a new order",
    "track_order": "where an order is / its status",
    "change_shipping_address": "change the address on an order",
    "set_up_shipping_address": "add or save a new shipping address on the account",
    "delivery_options": "what shipping methods exist",
    "delivery_period": "how long delivery takes / when it will arrive",
    "get_refund": "ask for money back",
    "track_refund": "status of a refund already requested",
    "check_refund_policy": "rules for refunds and returns",
    "check_cancellation_fee": "whether cancelling costs a fee",
    "check_invoice": "see or look up an invoice/bill",
    "get_invoice": "receive or download an invoice",
    "check_payment_methods": "which payment methods are accepted",
    "payment_issue": "a payment failed or was charged wrong",
    "create_account": "open a new account",
    "edit_account": "change profile/account details",
    "delete_account": "close or delete the account",
    "switch_account": "change account type or switch accounts",
    "recover_password": "forgot or reset password",
    "registration_problems": "errors while signing up",
    "newsletter_subscription": "subscribe/unsubscribe to the newsletter",
    "contact_customer_service": "how to reach customer service",
    "contact_human_agent": "wants to talk to a real person",
    "complaint": "complaining about service or a problem",
    "review": "leave feedback or a review",
    # Not in Bitext: added for this store, so it needs synthetic training data.
    "product_inquiry": "product availability, stock, prices or recommendations",
}
Intent = Literal[tuple(INTENTS)]


class Router(Protocol):
    name: str

    def classify(self, text: str) -> str: ...


class _Classification(BaseModel):
    intent: Intent


class PromptRouter:
    """Zero-shot: intent list in the prompt, constrained JSON output from a small model."""

    name = "prompt"

    def __init__(self, model: str = ROUTER_MODEL):
        self.name = f"prompt:{model}"
        self.llm = ChatOllama(model=model, base_url=OLLAMA_URL, temperature=0) \
            .with_structured_output(_Classification, method="json_schema")
        catalog = "\n".join(f"- {k}: {v}" for k, v in INTENTS.items())
        self.system = ("Classify the customer support message into exactly one intent.\n"
                       f"Intents:\n{catalog}")

    def classify(self, text: str) -> str:
        return self.llm.invoke([("system", self.system), ("human", text)]).intent
