"""Confirmation before irreversible actions.

The agent decides; the customer approves. Previews are built from the database, not from
the model, so the card can't misstate an amount. An action that would fail anyway (e.g.
cancelling a shipped order) gets no confirmation: the tool's error explains it instead.
"""

import json
from datetime import datetime

from langchain_core.messages import ToolMessage

from support_agent import store
from support_agent.config import REFUND_AUTO_APPROVE_LIMIT
from support_agent.retrieval import expand_name

SENSITIVE = {"cancel_order", "request_refund", "change_shipping_address"}
CONFIRM, DECLINE = "confirm", "decline"


def _items(order: dict) -> str:
    names = [f"{expand_name(i['name'].split(' - ')[0]).title()} × {i['quantity']}"
             for i in order["items"]]
    return names[0] if len(names) == 1 else f"{names[0]} and {len(names) - 1} more"


def _placed(order: dict) -> str:
    try:
        d = datetime.fromisoformat(order["created_at"])
        return f"{d:%b} {d.day}, {order['status']}"
    except ValueError:
        return order["status"]


def preview(call: dict, customer_id: int) -> dict | None:
    """What the customer is asked to approve, or None if no confirmation is needed."""
    name, args = call["name"], call.get("args", {})
    if name not in SENSITIVE:
        return None
    order = store.get_order(customer_id, str(args.get("order_id", "")))
    if not order:
        return None

    if name == "cancel_order":
        if order["status"] != "processing":
            return None
        return {"tool": name, "call_id": call["id"], "order_id": order["id"],
                "title": f"Cancel {order['id']}?",
                "lines": [["Order", _items(order)], ["Placed", _placed(order)],
                          ["Refund", f"${order['total']:.2f} to your original payment method"],
                          ["Arrives", "5 to 7 business days"]],
                "warning": "This can't be undone.",
                "confirm_label": "Cancel order", "decline_label": "Keep it"}

    if name == "request_refund":
        try:
            amount = float(args.get("amount", 0))
        except (TypeError, ValueError):
            return None
        already = sum(r["amount"] for r in order["refunds"] if r["status"] != "rejected")
        if order["status"] != "delivered" or amount <= 0 or amount + already > order["total"]:
            return None
        review = ("Approved right away" if amount <= REFUND_AUTO_APPROVE_LIMIT
                  else "Reviewed by a supervisor within 1 business day")
        return {"tool": name, "call_id": call["id"], "order_id": order["id"],
                "title": f"Refund ${amount:.2f} on {order['id']}?",
                "lines": [["Order", _items(order)], ["Placed", _placed(order)],
                          ["Amount", f"${amount:.2f}"],
                          ["Approval", review],
                          ["Arrives", "5 to 7 business days after approval"]],
                "warning": None,
                "confirm_label": "Request refund", "decline_label": "Not now"}

    if name == "change_shipping_address":
        if order["status"] != "processing" or not args.get("new_address"):
            return None
        return {"tool": name, "call_id": call["id"], "order_id": order["id"],
                "title": f"Ship {order['id']} to a new address?",
                "lines": [["Placed", _placed(order)], ["From", order["shipping_address"]],
                          ["To", args["new_address"]]],
                "warning": None,
                "confirm_label": "Change address", "decline_label": "Keep current address"}
    return None


def declined_message(call: dict) -> ToolMessage:
    """What the agent sees when the customer says no: nothing ran."""
    return ToolMessage(
        content=json.dumps({"declined": True,
                            "tell_customer": "You chose not to go ahead, so nothing was changed."}),
        tool_call_id=call["id"], name=call["name"])
