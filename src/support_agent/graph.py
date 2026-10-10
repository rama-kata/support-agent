"""The LangGraph support agent.

guard -> blocked -> END
      -> route -> context -> agent <-> tools
                         -> escalate -> tools -> agent          (intents that must escalate)
agent (final reply) -> verify -> END, or back to agent once if the reply claims an action
                                       that no successful tool call performed
"""

import json
import re
import uuid
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_ollama import ChatOllama
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import RemoveMessage, add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from support_agent import store
from support_agent.config import AGENT_MODEL, OLLAMA_URL, REFUND_AUTO_APPROVE_LIMIT, STORE_NAME
from support_agent.guardrails import detect_injection, redact_pii
from support_agent.retrieval import search
from support_agent.router import Router, default_router
from support_agent.tools import TOOLS

BLOCKED_REPLY = ("I can only help with your own orders and account, and I can't change how "
                 "I work. What can I help you with today?")

SYSTEM = f"""You are the customer support agent for {STORE_NAME}, a wine, beer and spirits \
retailer. You are talking with {{name}} (customer #{{customer_id}}).

Rules:
- Use tools for every fact about orders, refunds, products and stock. Never guess.
- For availability, find the item with search_products, then call stock_outlook on the \
specific SKU before saying whether it is in stock or how long it will last.
- You cannot see payment or charge records. For billing disputes, double charges or failed \
payments, use escalate_to_human.
- Never promise to do something later. Either do it now with a tool or escalate.
- If the store policies and your tools don't cover a question, say you don't have that \
information and offer to connect the customer with a person. Never invent a store policy, \
price, fee or service, and never offer to do something no tool can do.
- Messages can contain several requests. Handle and answer every one, not only the one the \
detected intent describes.
- State policies, fees and time frames only as they appear in the store policies below or \
from search_help_center. The example conversations show tone only; their facts may be wrong.
- If the customer clearly asks you to do something (cancel, refund, change address), do it \
with the tool. If the request is ambiguous, ask one short question first.
- Refunds over ${REFUND_AUTO_APPROVE_LIMIT:.0f} go to a supervisor; tell the customer that.
- If the customer asks for a person, complains, or needs something no tool can do, use \
escalate_to_human.
- Be brief and warm: 1-4 sentences, no numbered step lists unless asked.

Detected intent: {{intent}}
Playbook: {{playbook}}

Relevant store policies:
{{policies}}

Example of a past conversation for this intent (tone only):
{{example}}"""


# The router's job: turn a detected intent into a concrete required action.
# Escalation is too important to leave to the model: for these intents the graph files the
# ticket itself and the model only writes the reply.
ESCALATE_INTENTS = {"payment_issue", "complaint", "contact_human_agent"}
_ESCALATED = "A ticket has already been filed with a human agent; confirm it to the customer."
PLAYBOOKS = {
    "payment_issue": "You can't see charges. " + _ESCALATED,
    "complaint": "Acknowledge the problem in one sentence. " + _ESCALATED,
    "contact_human_agent": _ESCALATED,
    "track_order": "Call lookup_order (or list_my_orders if no order number is given).",
    "track_refund": "Call lookup_order and report the refunds on it.",
    "cancel_order": "Call lookup_order, then cancel_order if the customer asked to cancel.",
    "get_refund": "Call lookup_order, then request_refund with the amount the customer wants.",
    "change_shipping_address": "Call change_shipping_address once you have the new address.",
    "product_inquiry": "Call search_products, then stock_outlook for availability questions.",
}
DEFAULT_PLAYBOOK = "Answer from the store policies; call search_help_center if they don't cover it."


# Replies that claim (or promise) an action, mapped to the tool that must have done it.
_PROMISE = r"(I will|I'll|I've|I have|I can|let me|I'm going to|I am going to|go ahead and)"
ACTION_CLAIMS = {
    "cancel_order": re.compile(
        rf"\b((has been|was|been) (successfully )?cancel|{_PROMISE} (now |go ahead and )?cancel)",
        re.IGNORECASE),
    "request_refund": re.compile(
        rf"\b(refund (has been|was|is) (approved|submitted|issued)|"
        rf"{_PROMISE} (now )?(issue|submit|process|request)[a-z]* (a|the|your|that) refund)",
        re.IGNORECASE),
    "change_shipping_address": re.compile(
        rf"\baddress (has been|was) (updated|changed)|{_PROMISE} (update|change) the address",
        re.IGNORECASE),
}


VERIFIER = "verifier"


def is_customer(m: AnyMessage) -> bool:
    return isinstance(m, HumanMessage) and m.name != VERIFIER


def unbacked_claims(messages: list[AnyMessage], reply: str) -> list[str]:
    """Actions the reply claims that no successful tool call in this turn performed."""
    turn_start = max(i for i, m in enumerate(messages) if is_customer(m))
    done = set()
    for m in messages[turn_start:]:
        if isinstance(m, ToolMessage):
            try:
                if json.loads(m.content).get("ok"):
                    done.add(m.name)
            except (ValueError, AttributeError):
                pass
    return [tool for tool, claim in ACTION_CLAIMS.items()
            if claim.search(reply) and tool not in done]


class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    intent: str
    blocked: bool
    pii_found: list[str]
    context: str
    verify_retries: int
    verify_missing: list[str]


def build_graph(router: Router | None = None, model: str = AGENT_MODEL, checkpointer=None):
    router = router or default_router()
    llm = ChatOllama(model=model, base_url=OLLAMA_URL, temperature=0, reasoning=False)
    agent_llm = llm.bind_tools(TOOLS)

    def guard(state: State):
        last = state["messages"][-1]
        clean, found = redact_pii(last.content)
        update = {"blocked": detect_injection(clean), "pii_found": found}
        if found:
            # Same id replaces the message, so raw PII never reaches the model or checkpoint.
            update["messages"] = [HumanMessage(content=clean, id=last.id)]
        return update

    def blocked(state: State):
        return {"messages": [AIMessage(content=BLOCKED_REPLY)]}

    def route(state: State):
        return {"intent": router.classify(state["messages"][-1].content)}

    def context(state: State, config: RunnableConfig):
        query = state["messages"][-1].content
        customer = store.get_customer(config["configurable"]["customer_id"])
        policies = "\n\n".join(h["text"] for h in search("policies", query, k=2))
        examples = [h for h in search("examples", query, k=5) if h["intent"] == state["intent"]]
        example = examples[0]["text"] if examples else "(none)"
        return {"context": SYSTEM.format(
            name=customer["name"].split()[0], customer_id=customer["id"],
            intent=state["intent"], playbook=PLAYBOOKS.get(state["intent"], DEFAULT_PLAYBOOK),
            policies=policies, example=example,
        )}

    def escalate(state: State):
        text = state["messages"][-1].content
        call = {"name": "escalate_to_human", "id": f"call_{uuid.uuid4().hex[:12]}",
                "args": {"reason": state["intent"], "summary": text[:500]}}
        return {"messages": [AIMessage(content="", tool_calls=[call])]}

    tools_by_name = {t.name: t for t in TOOLS}

    def agent(state: State):
        messages = [SystemMessage(content=state["context"]), *state["messages"]]
        # On a verify retry, offer only the tools the reply claimed to have used: with
        # fewer options a small model reliably makes the call instead of talking about it.
        if missing := state.get("verify_missing"):
            retry_llm = llm.bind_tools([tools_by_name[t] for t in missing])
            return {"messages": [retry_llm.invoke(messages)], "verify_missing": []}
        return {"messages": [agent_llm.invoke(messages)]}

    def verify(state: State, config: RunnableConfig):
        reply = state["messages"][-1]
        missing = unbacked_claims(state["messages"], reply.content)
        # Verifier notes are internal; clear them from history once the turn settles.
        notes = [RemoveMessage(id=m.id) for m in state["messages"]
                 if isinstance(m, HumanMessage) and m.name == VERIFIER]
        if not missing:
            return {"messages": notes, "verify_retries": 0}
        if state.get("verify_retries", 0) == 0:
            # A user-role note plus only the claimed tools: in testing, qwen3 ignored the
            # same note as a system message but reliably made the call this way.
            note = (f"[automated check] Your reply claims an action ({', '.join(missing)}) "
                    "that no tool call has done. Call the tool now if the customer asked for "
                    "it; otherwise rewrite the reply without claiming it.")
            return {"messages": [RemoveMessage(id=reply.id),
                                 HumanMessage(content=note, name=VERIFIER)],
                    "verify_retries": 1, "verify_missing": missing}
        # Still unbacked after a retry: never ship a false claim. Hand off to a human.
        customer_id = config["configurable"]["customer_id"]
        request = next(m.content for m in reversed(state["messages"]) if is_customer(m))
        ticket = store.add_ticket(customer_id, f"unverified_action:{','.join(missing)}",
                                  request[:500])
        return {"messages": [*notes, RemoveMessage(id=reply.id), AIMessage(content=(
            "I wasn't able to complete that request automatically, so I've passed it to a "
            f"member of our team (ticket #{ticket}). They'll follow up within 2 business "
            "days, and nothing has been changed on your order yet."))],
            "verify_retries": 0}

    graph = StateGraph(State)
    graph.add_node("guard", guard)
    graph.add_node("blocked", blocked)
    graph.add_node("route", route)
    graph.add_node("context", context)
    graph.add_node("escalate", escalate)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_node("verify", verify)

    graph.add_edge(START, "guard")
    graph.add_conditional_edges("guard", lambda s: "blocked" if s["blocked"] else "route")
    graph.add_edge("blocked", END)
    graph.add_edge("route", "context")
    graph.add_conditional_edges(
        "context", lambda s: "escalate" if s["intent"] in ESCALATE_INTENTS else "agent")
    graph.add_edge("escalate", "tools")
    graph.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: "verify"})
    graph.add_edge("tools", "agent")
    graph.add_conditional_edges(
        "verify", lambda s: "agent" if s.get("verify_missing") else END)
    return graph.compile(checkpointer=checkpointer or InMemorySaver())


def turn_reply(messages: list[AnyMessage]) -> str:
    """Everything the agent said since the customer's last message, as a chat UI shows it
    (text sent alongside a tool call is part of the reply too)."""
    start = max(i for i, m in enumerate(messages) if is_customer(m))
    return "\n\n".join(m.content for m in messages[start:]
                       if isinstance(m, AIMessage) and m.content.strip())


def run_turn(graph, text: str, customer_id: int, thread_id: str) -> dict:
    config = {"configurable": {"customer_id": customer_id, "thread_id": thread_id},
              "recursion_limit": 20}
    return graph.invoke({"messages": [HumanMessage(content=text)]}, config)
