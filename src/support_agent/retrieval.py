"""LlamaIndex retrieval over store policies, past resolutions and the product catalog.

Three separate indexes so each can be tuned and evaluated on its own:
- policies: the store's rules (source of truth for facts)
- examples: resolved Bitext conversations (tone and procedure, never facts)
- products: the catalog, for fuzzy product-name lookup
"""

import json
import re
import sqlite3
from functools import lru_cache

from llama_index.core import Settings, StorageContext, VectorStoreIndex, load_index_from_storage
from llama_index.core.schema import TextNode
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from support_agent.config import DATA, EMBED_MODEL, INDEX_DIR, KB_DIR, STORE_DB

INDEXES = ("policies", "examples", "products")

# Catalog names use distributor shorthand ("CAB", "S/BLC"); expand it so embeddings
# match how customers actually ask ("cabernet", "sauvignon blanc").
ABBREVIATIONS = {
    "CAB": "Cabernet Sauvignon", "CHARD": "Chardonnay", "S/BLC": "Sauvignon Blanc",
    "P/GRIG": "Pinot Grigio", "P/NOIR": "Pinot Noir", "MER": "Merlot",
    "WH/ZIN": "White Zinfandel", "RIES": "Riesling", "CEL": "Cellars", "CAL": "California",
    "BIB": "bag in box", "RES": "Reserve", "VINT": "Vintners", "EST": "Estate",
    "NR": "non-returnable bottles", "CYT": "Concha y Toro", "SEL": "Select",
}


def expand_name(name: str) -> str:
    return " ".join(ABBREVIATIONS.get(word, word) for word in name.split())


def _configure():
    Settings.embed_model = HuggingFaceEmbedding(
        model_name=EMBED_MODEL, device="cpu",
        # bge models are trained with this prefix on queries (not on documents).
        query_instruction="Represent this sentence for searching relevant passages: ",
    )


def policy_nodes() -> list[TextNode]:
    text = (KB_DIR / "policies.md").read_text()
    sections = re.split(r"\n(?=## )", text)[1:]
    return [
        TextNode(text=s.strip(), metadata={"section": s.splitlines()[0].lstrip("# ")})
        for s in sections
    ]


def example_nodes() -> list[TextNode]:
    nodes = []
    with open(DATA / "kb_examples.jsonl") as f:
        for line in f:
            r = json.loads(line)
            nodes.append(TextNode(
                text=f"Customer: {r['instruction']}\nAgent: {r['response']}",
                metadata={"intent": r["intent"], "category": r["category"]},
                excluded_embed_metadata_keys=["intent", "category"],
            ))
    return nodes


def product_nodes() -> list[TextNode]:
    with sqlite3.connect(STORE_DB) as conn:
        rows = conn.execute("SELECT sku, name, type, supplier FROM products").fetchall()
    return [
        TextNode(text=f"{expand_name(name)} ({ptype.lower()}, {supplier.title()})",
                 metadata={"sku": sku}, excluded_embed_metadata_keys=["sku"])
        for sku, name, ptype, supplier in rows
    ]


def build_indexes():
    _configure()
    builders = {"policies": policy_nodes, "examples": example_nodes, "products": product_nodes}
    for name, build in builders.items():
        nodes = build()
        index = VectorStoreIndex(nodes, show_progress=False)
        index.storage_context.persist(INDEX_DIR / name)
        print(f"{name}: {len(nodes)} nodes")
    _load.cache_clear()


@lru_cache(maxsize=len(INDEXES))
def _load(name: str) -> VectorStoreIndex:
    _configure()
    storage = StorageContext.from_defaults(persist_dir=str(INDEX_DIR / name))
    return load_index_from_storage(storage)


def search(name: str, query: str, k: int = 4) -> list[dict]:
    retriever = _load(name).as_retriever(similarity_top_k=k)
    return [
        {"text": hit.node.get_content(), "score": round(hit.score or 0.0, 3),
         **hit.node.metadata}
        for hit in retriever.retrieve(query)
    ]
