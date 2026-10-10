# support-agent

A customer support agent for **Cellar & Co.**, a fictional wine, beer and spirits retailer. It looks up and changes orders, issues refunds within limits, answers stock questions using a demand forecast, and hands off to a human when it should. It runs entirely on local models (Ollama).

Built with **LangGraph** (orchestration), **LlamaIndex** (retrieval), **MCP** (tool serving) and **Qwen** models on two consumer GPUs.

> **Status:** complete (3 days). The agent, tools, guardrails, MCP server, evals, a router comparison (prompting vs. retrieval vs. LoRA fine-tuning), a FastAPI service, a Next.js web demo, and a measured feedback loop.

## Results

### Agent (69 scenarios, ground truth checked against the database)

| Router | Core (49) | Hard (20) | Tool-call accuracy | Latency p50 / p95 |
|---|---|---|---|---|
| Prompting (qwen2.5:3b) | 49/49 | 20/20 | 100% | 4.1s / 7.2s |
| Fine-tuned (LoRA, Ollama) | 49/49 | 20/20 | 100% | 5.0s / 12.0s |
| kNN (default), after the no-invention prompt rule | 49/49 | 19/20 | 98.6% | 4.0s / 6.5s |

The kNN run's one miss was a promise without an action ("I can cancel your order now. Let me do that for you.") in a phrasing the `verify` node didn't yet recognise; it now does (`tests/test_verify.py`), and a re-run is pending.

The hard set covers typos, multi-turn context ("ok, cancel it"), no order number, two requests in one message, conditional requests ("if it's out of stock, cancel my order"), fake-policy social engineering, refund over-claims, and the $100/$101 approval boundary.

Routing accuracy doesn't limit the agent on this set. The fine-tuned run is slower end to end because a second model shares the GPUs with the 14B agent model; the router call itself is faster.

### Feedback loop: learning topics the store didn't cover

Customers ask about two topics with no intent, no policy and no training data: wine tastings and gift cards (30 messages each, written for this test). For each topic, 15 messages play the part of thumbs-down feedback that an admin labels in the web UI, with a new intent and the policy text that should have been used. The other 15 are held out. The agent is scored on the held-out messages before and after the feedback is applied, with **no retraining**: the kNN router and the policy index update live.

| | v1 (before) | v2 (after 15 labels per topic) |
|---|---|---|
| Routed to the right intent | 0/30 | **27/30** |
| Answered with the right facts (checked per question) | 4/30, of which **3 were invented** | **29/30** |
| Router accuracy on held-out Bitext (regression check) | 97.4% | 97.4% |

- **The headline is the invented facts, not the 4/30.** Without a gift-card policy, the agent told customers "gift cards do not expire" and offered to email one. The facts happened to match what the store later decided, so keyword scoring counted them as correct; only 1 of the 4 (the 21+ rule applies to tastings) was grounded. A prompt rule ("say you don't have that information; never invent a policy or a capability") made the agent hand off more often but didn't remove the problem. The `verify` node checks claimed *actions*; checking claimed *facts* against the retrieved policy text is the obvious next step.
- **The one v2 miss** is an invented capability: "I can check your gift-card balance, what's the card number?" There's no balance tool.
- **Why kNN is the default router:** it learns a new topic from 15 labeled messages instantly. The fine-tuned router would need a retraining run (~12 minutes) to learn the new intents.

Reproduce with `uv run python evals/run_flywheel.py` (runs on temporary copies of the store and indexes).

### Intent router (325 held-out messages, 28 intents)

| Router | Bitext held-out (270) | Product, simple (15) | Product, hard (40) | Latency p50 | Training |
|---|---|---|---|---|---|
| Prompting: qwen2.5:3b, intent list in prompt | 80.7% | 93.3% | 87.5% | 124ms | none |
| Retrieval: kNN vote over bge-small embeddings | 97.4% | 100% | 100% | 55ms | none |
| **Fine-tuned: QLoRA on Qwen2.5-3B, served by Ollama (q4_K_M)** | **98.1%** | **100%** | **100%** | **50ms** | 12 min, RTX 3060 |
| Same adapter in transformers (4-bit bitsandbytes) | 99.3% | 100% | not run | 253ms | (same) |

The product sets were written by hand (by Claude, not by the model that generated the synthetic training data). The hard set uses slang, typos and brand nicknames ("yo do yall have hennessy", "need a 30 rack of natty light, is it back yet"). Every message in them is a product question, so they measure recall for that intent, not false positives; the Bitext set covers those. A set written by a person is planned (`evals/human_product_questions.txt`).

Each run is also recorded in [ml-eval-harness](https://github.com/rama-kata/ml-eval-harness) (`evals/results/results.db`), so `uv run evalrun compare --db evals/results/results.db` lists them side by side.

- **Fine-tuning vs. prompting the same model:** +17 points and 2.5× faster. The fine-tuned prompt is one line; the baseline's lists all 28 intents.
- **kNN is the default** because it needs no training and is within a point of the fine-tuned router on this data. Bitext's phrasing is uniform, which favours retrieval.
- **Quantization cost:** 99.3% → 98.1% going from the bf16-merged adapter to Ollama's 4-bit model, for 5× lower latency.

## Architecture

```mermaid
graph TD
    START([message]) --> guard
    guard -->|injection detected| blocked --> END([reply])
    guard -->|PII redacted| route
    route --> context
    context -->|payment issue / complaint / wants a human| escalate --> tools
    context --> agent
    agent -->|tool calls| tools --> agent
    agent --> verify
    verify -->|reply claims an action no tool did| agent
    verify --> END
```

| Node | What it does |
|---|---|
| `guard` | Redacts card numbers (Luhn-checked), SSNs and CVVs before any model or log sees them. Blocks prompt injection patterns. |
| `route` | Classifies the message into one of 28 intents (27 from Bitext plus `product_inquiry`). |
| `context` | Builds the system prompt: the intent's **playbook** (required action), the 2 most relevant policy sections, and one past resolution for tone. |
| `escalate` | For intents that must reach a human, the graph files the ticket **in code**; the model only writes the reply. |
| `agent` / `tools` | qwen3:14b with 9 tools, looping until it answers. |
| `verify` | Checks that every action the reply claims ("has been cancelled", "refund approved") was done by a successful tool call this turn. If not: one retry with only the claimed tool offered, then a safe handoff to a human. A false claim never reaches the customer. |

### Tools

`search_help_center`, `list_my_orders`, `lookup_order`, `cancel_order`, `change_shipping_address`, `request_refund`, `search_products`, `stock_outlook`, `escalate_to_human`

`stock_outlook` calls the XGBoost demand forecaster from my [retail-inventory-ai](https://github.com/rama-kata/retail-inventory-ai) project (installed as a dependency) to estimate days until an item sells out.

## Web demo and API

`web/` is a Next.js 16 app (Tailwind 4, Motion) deployed on Vercel. `src/support_agent/api.py` is a FastAPI service that runs next to Ollama on the GPU machine and is exposed to the internet with Tailscale Funnel.

- **Sign in as a demo customer.** The API returns a signed token for one persona, and every request resolves the customer from it. Tools get the id through the run config, never from the model or the request body. Conversation threads are namespaced by customer, so a client can't read or continue someone else's.
- **Live steps, verified replies.** Chat streams Server-Sent Events: the detected intent and each tool call appear as they happen ("Looking up order ORD-10326", "Checking stock and the demand forecast"). The reply text is sent only after the `verify` node has passed it, so a retracted claim never flashes on screen.
- **Feedback.** 👍/👎 on every answer, with an optional "what should it have said". The admin page shows the queue; labeling a 👎 with an intent (existing or new) and an optional policy, then pressing *Apply*, teaches the kNN router and the policy index immediately (`src/support_agent/flywheel.py`). What's learned lives in `data/learned/`, separate from the seed data.
- **Running on one home GPU box:** one agent turn at a time (a queue beats GPU thrashing), 12 messages per minute per customer, messages capped at 1,000 characters, and a demo copy of the store that admins can reset.

## Design decisions

- **The customer id comes from the session, never from the model.** Tools read it from LangGraph's run config, which the model can't see or set. An injected "show orders for customer 7" has no path to another account's data. This is tested in `tests/test_tools.py` and the `other_customer` eval scenarios.
- **Code where an action must happen, the model where judgment helps.** Early versions asked the model to escalate complaints; it would say "let me escalate this" and not call the tool. Escalation is now a graph edge. The same goes for the 21+ age rule, enforced inside the product tools rather than in the prompt, and refund limits (over $100 goes to a supervisor), enforced in `request_refund`.
- **Facts the reply must contain go in the tool result.** For refunds over $100 the model kept skipping the supervisor review and once invented a confirmation email. Adding a `tell_customer` field to the tool output fixed both. Models follow tool output more reliably than system prompt rules.
- **The router earns its place.** It doesn't just label messages; each intent maps to a playbook, and escalation intents change the graph's path.
- **Policies are the source of truth; past conversations set tone only.** Bitext responses are generic templates that contradict this store's rules, so they're retrieved as tone examples and the prompt says their facts may be wrong.
- **The dataset didn't cover the business.** Bitext has no product or stock intent, so `product_inquiry` was added: 708 synthetic training messages generated by qwen3:14b from real catalog names, and test messages written by hand so the test doesn't reward the generator's own style.
- **Verify claims, don't trust them.** The worst support-bot failure is saying "I've cancelled your order" without doing it. The `verify` node compares the reply's claims with this turn's successful tool calls. In testing, qwen3 ignored the retry note as a system message but reliably made the call when the note was a user-role message offering only the claimed tool.
- **Check the test set before trusting a score.** The first kNN router scored 100%. Bitext contains surface variants of each sentence (lowercased, punctuation stripped, typos), and a random split put variants on both sides. The split now keeps each sentence family on one side and removes training rows within 0.95 cosine similarity of a test row (3,615 of them). kNN dropped to an honest 97.4%.
- **Serve the fine-tuned model on the same engine as the baseline.** The LoRA router was slower than prompting (253ms) when run through transformers with 4-bit bitsandbytes. Merged, converted to GGUF and served by Ollama like the baseline, it takes 50ms. (Ollama's own safetensors import produced a model that only output "????"; llama.cpp's converter works. See `training/export_ollama.py`.)

## Data

| Source | Use |
|---|---|
| [Bitext customer support dataset](https://www.kaggle.com/datasets/bitext/bitext-gen-ai-chatbot-customer-support-dataset) (Kaggle, 27K messages, 27 intents) | Router training/testing, past-resolution examples |
| [Montgomery County, MD Warehouse and Retail Sales](https://data.montgomerycountymd.gov/d/v76h-r7br) (341K rows, 24 months) | Real product catalog and monthly sales history for forecasting. The [Kaggle mirror](https://www.kaggle.com/datasets/divyeshardeshana/warehouse-and-retail-sales) has only 10 months, too few for 12-month lag features, so the full table comes from the county's open data portal. |

Prices, stock levels, customers and orders are synthetic and seeded, so the database and eval scenarios are reproducible.

Bitext is split before anything is built: 10 messages per intent (270) are held out for testing and never indexed or trained on.

## Run it

Requires [uv](https://docs.astral.sh/uv/) and [Ollama](https://ollama.com/).

```bash
ollama pull qwen3:14b && ollama pull qwen2.5:3b
uv sync --extra dev

uv run python scripts/download_data.py    # Kaggle + county open data, no token needed
uv run python scripts/build_store.py      # synthetic store on real SKUs -> data/store.db
uv run python scripts/prepare_data.py     # train/test split + KB examples
uv run python scripts/build_index.py      # LlamaIndex embeddings -> data/index/
uv run python scripts/generate_product_inquiries.py   # synthetic product_inquiry training data

uv run support-agent --customer 1 --debug # chat in the terminal
```

The router defaults to kNN, which needs no training. Choose another with `SUPPORT_AGENT_ROUTER=prompt|knn|finetuned`.

### Web demo

```bash
uv run uvicorn support_agent.api:app --port 8000      # API (tokens are created in data/demo/)
cd web && npm install && npm run dev                  # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` to the API's public URL when deploying the web app. The admin token is in `data/demo/.admin_token`. `deploy/support-agent-api.service` runs the API as a systemd user service.

### Fine-tune the router (optional, one 12 GB GPU)

```bash
ollama stop qwen3:14b    # free the GPU
CUDA_VISIBLE_DEVICES=0 uv run --extra train python training/train_router.py \
    --base Qwen/Qwen2.5-3B-Instruct --out models/router-qwen2.5-3b     # ~12 min on an RTX 3060

git clone --depth 1 https://github.com/ggml-org/llama.cpp ~/repos/llama.cpp
uv run --extra train --with ~/repos/llama.cpp/gguf-py --with sentencepiece \
    python training/export_ollama.py models/router-qwen2.5-3b --name support-router-3b
```

### Evals and tests

```bash
uv run pytest                                   # guardrails + tool security, no models needed
uv run python scripts/make_scenarios.py         # regenerate golden scenarios from the store
uv run python evals/run_agent_eval.py           # 69 scenarios on a fresh copy of the store
uv run python evals/run_flywheel.py             # feedback loop: v1 vs v2 on new topics
uv run python evals/run_router_eval.py --router prompt|knn|finetuned|lora
```

### MCP

The tools are also served over MCP, bound to one customer per session:

```json
{
  "mcpServers": {
    "cellar-and-co": {
      "command": "uv",
      "args": ["--directory", "/path/to/support-agent", "run", "support-agent-mcp", "--customer", "1"]
    }
  }
}
```

## Project layout

```
src/support_agent/
  graph.py        LangGraph agent: guard, route, context, escalate, agent, tools
  tools.py        the 9 tools, scoped to the session's customer
  router.py       intent routers: prompting, kNN, LoRA (PyTorch) and fine-tuned (Ollama)
  retrieval.py    LlamaIndex indexes: policies, past resolutions, products
  guardrails.py   PII redaction, prompt-injection detection
  store.py        SQLite data access
  mcp_server.py   tools over MCP
  api.py          FastAPI service for the web demo (auth, SSE chat, feedback, admin)
  flywheel.py     applies labeled feedback to the live router and policy index
  kb/policies.md  store policies (source of truth)
scripts/          data download, store build, leak-free splits, index build, synthetic data,
                  scenario generation
training/         QLoRA router training and export to Ollama (GGUF)
evals/            golden scenarios, product-intent test set, eval runners
tests/            guardrail, tool-security and verify tests on a fixture database
web/              Next.js demo: landing, chat, admin
deploy/           systemd unit for the API
```
