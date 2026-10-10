"""Chat with the agent in the terminal: support-agent --customer 54"""

import argparse
import json
import uuid

from langchain_core.messages import AIMessage, ToolMessage
from rich.console import Console

from support_agent import store
from support_agent.graph import build_graph, run_turn


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--customer", type=int, default=54, help="customer id to log in as")
    parser.add_argument("--debug", action="store_true", help="show intent and tool calls")
    args = parser.parse_args()

    console = Console()
    customer = store.get_customer(args.customer)
    graph = build_graph()
    thread = str(uuid.uuid4())
    recent = ", ".join(o["id"] for o in store.list_orders(args.customer, 3))
    console.print(f"[bold]Logged in as {customer['name']}[/] (recent orders: {recent}). "
                  "Ctrl-D to quit.")

    while True:
        try:
            text = console.input("[bold cyan]you> [/]").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not text:
            continue
        seen = len(graph.get_state({"configurable": {"thread_id": thread}}).values
                   .get("messages", []))
        state = run_turn(graph, text, args.customer, thread)
        if args.debug:
            console.print(f"[dim]intent={state.get('intent')} pii={state.get('pii_found')} "
                          f"blocked={state.get('blocked')}[/]")
            for msg in state["messages"][seen:]:
                if isinstance(msg, AIMessage) and msg.tool_calls:
                    for call in msg.tool_calls:
                        console.print(f"[dim]  -> {call['name']}({json.dumps(call['args'])})[/]")
                elif isinstance(msg, ToolMessage):
                    console.print(f"[dim]  <- {msg.content[:160]}[/]")
        console.print(f"[bold green]agent>[/] {state['messages'][-1].content}")


if __name__ == "__main__":
    main()
