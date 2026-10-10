"""Intent routing. Day 1 ships the prompting baseline; RAG (kNN) and LoRA routers plug in
behind the same interface so they can be compared on the same eval set."""

import json
from collections import defaultdict
from typing import Literal, Protocol

import numpy as np
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from support_agent.config import DATA, INDEX_DIR, OLLAMA_URL, ROUTER_MODEL, SPLITS

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


# Fine-tuned routers learn the label set from data, so their prompt stays short.
FINETUNE_SYSTEM = "Classify the customer support message into one intent label."


def training_examples() -> list[dict]:
    """Bitext train split plus synthetic product_inquiry messages."""
    items = []
    for path in (SPLITS / "train.jsonl", DATA / "synthetic" / "product_inquiry.jsonl"):
        with open(path) as f:
            items += [json.loads(line) for line in f]
    return items


class KnnRouter:
    """Retrieval: label = similarity-weighted vote of the k nearest training messages.
    No LLM call; the embeddings of ~26K training messages are computed once and cached."""

    name = "knn"

    def __init__(self, k: int = 10):
        from support_agent.retrieval import embed_model

        self.k = k
        self.embed = embed_model()
        cache = INDEX_DIR / "knn_router.npz"
        examples = training_examples()
        texts = [e["instruction"] for e in examples]
        if cache.exists() and json.loads(str(np.load(cache)["texts"])) == texts:
            self.vectors = np.load(cache)["vectors"]
        else:
            vectors = np.array(self.embed.get_text_embedding_batch(texts, show_progress=True))
            self.vectors = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
            np.savez(cache, vectors=self.vectors, texts=json.dumps(texts))
        self.labels = [e["intent"] for e in examples]
        self.name = f"knn:k={k}"

    def classify(self, text: str) -> str:
        query = np.array(self.embed.get_query_embedding(text))
        scores = self.vectors @ (query / np.linalg.norm(query))
        votes = defaultdict(float)
        for i in np.argpartition(-scores, self.k)[: self.k]:
            votes[self.labels[i]] += scores[i]
        return max(votes, key=votes.get)


class LoraRouter:
    """Fine-tuned: a small Qwen model with a QLoRA adapter trained on the intent labels."""

    def __init__(self, adapter: str = "models/router-qwen2.5-3b", device: str = "cuda:0"):
        import torch
        from peft import AutoPeftModelForCausalLM
        from transformers import AutoTokenizer, BitsAndBytesConfig

        # bf16 needs Ampere or newer (the 3060); fall back to fp16 on Turing (the 2070).
        major, _ = torch.cuda.get_device_capability(device)
        dtype = torch.bfloat16 if major >= 8 else torch.float16
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(adapter)
        self.model = AutoPeftModelForCausalLM.from_pretrained(
            adapter, device_map={"": device}, dtype=dtype,
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype),
        ).eval()
        self.device = device
        self.name = f"lora:{adapter.rstrip('/').split('/')[-1]}"

    def classify(self, text: str) -> str:
        messages = [{"role": "system", "content": FINETUNE_SYSTEM},
                    {"role": "user", "content": text}]
        inputs = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt", return_dict=True,
        ).to(self.device)
        with self.torch.no_grad():
            out = self.model.generate(**inputs, max_new_tokens=8, do_sample=False)
        label = self.tokenizer.decode(out[0, inputs["input_ids"].shape[1]:],
                                      skip_special_tokens=True).strip()
        return label if label in INTENTS else _closest_intent(label)


def _closest_intent(label: str) -> str:
    """Map a malformed label to the intent sharing the longest prefix (rarely needed)."""
    from os.path import commonprefix

    return max(INTENTS, key=lambda i: len(commonprefix([i, label])))
