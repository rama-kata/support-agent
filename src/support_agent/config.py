"""Central settings, overridable with SUPPORT_AGENT_* environment variables."""

import os
from pathlib import Path

ROOT = Path(os.getenv("SUPPORT_AGENT_ROOT", Path(__file__).resolve().parents[2]))
DATA = ROOT / "data"
RAW = DATA / "raw"
STORE_DB = Path(os.getenv("SUPPORT_AGENT_STORE_DB", DATA / "store.db"))
SPLITS = DATA / "splits"
INDEX_DIR = DATA / "index"
KB_DIR = Path(__file__).parent / "kb"

OLLAMA_URL = os.getenv("SUPPORT_AGENT_OLLAMA_URL", "http://localhost:11434")
AGENT_MODEL = os.getenv("SUPPORT_AGENT_MODEL", "qwen3:14b")
ROUTER_MODEL = os.getenv("SUPPORT_AGENT_ROUTER_MODEL", "qwen2.5:3b")
EMBED_MODEL = os.getenv("SUPPORT_AGENT_EMBED_MODEL", "BAAI/bge-small-en-v1.5")

STORE_NAME = "Cellar & Co."
REFUND_AUTO_APPROVE_LIMIT = 100.00
MINIMUM_AGE = 21

# Store-level values substituted into Bitext response templates.
STORE_FACTS = {
    "Company Name": STORE_NAME,
    "Company": STORE_NAME,
    "Website URL": "cellarandco.example",
    "Login Page URL": "cellarandco.example/login",
    "Account Recovery Page URL": "cellarandco.example/recover",
    "Customer Support Phone Number": "(555) 010-2244",
    "Toll-Free Number": "(800) 555-0199",
    "Customer Support Hours": "9am-8pm ET, Monday to Saturday",
    "Customer Support Email": "help@cellarandco.example",
    "Feedback Email Address": "feedback@cellarandco.example",
    "Live Chat Support": "Live Chat",
    "Currency Symbol": "$",
    "Online Company Portal Info": "account at cellarandco.example",
    "Online Order Interaction": "Orders",
}
