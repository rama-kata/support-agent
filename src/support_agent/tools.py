"""Tools the agent can call. The customer id comes from the run config (the authenticated
session), never from the model, so a prompt cannot reach another customer's data."""

import json
import math

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pipeline.forecasting import forecast_next

from support_agent import store
from support_agent.config import MINIMUM_AGE, REFUND_AUTO_APPROVE_LIMIT
from support_agent.retrieval import search


def _customer_id(config: RunnableConfig) -> int:
    customer_id = config.get("configurable", {}).get("customer_id")
    if customer_id is None:
        raise ValueError("No authenticated customer in this session.")
    return int(customer_id)


def _json(obj) -> str:
    return json.dumps(obj, default=str)


def _underage(config: RunnableConfig) -> str | None:
    """Enforced in code, not the prompt: under-21 customers can't browse alcohol."""
    customer = store.get_customer(_customer_id(config))
    if store.customer_age(customer) < MINIMUM_AGE:
        return _json({"error": f"Customer is under {MINIMUM_AGE}; product information "
                               "can't be shared. Explain the age requirement politely."})
    return None


@tool
def search_help_center(query: str) -> str:
    """Search Cellar & Co. store policies (returns, shipping, fees, accounts, payments, age
    rules). Use this before stating any policy, fee, time frame or rule."""
    return _json([{"section": h["section"], "text": h["text"]}
                  for h in search("policies", query, k=3)])


@tool
def list_my_orders(config: RunnableConfig) -> str:
    """List the customer's 5 most recent orders. Use when they don't give an order number."""
    return _json(store.list_orders(_customer_id(config)))


@tool
def lookup_order(order_id: str, config: RunnableConfig) -> str:
    """Get status, items, tracking number, shipping address and refunds for an order
    (format ORD-12345)."""
    order = store.get_order(_customer_id(config), order_id)
    return _json(order or {"error": f"No order {order_id} found on this account."})


@tool
def cancel_order(order_id: str, config: RunnableConfig) -> str:
    """Cancel an order. Only orders that are still processing can be cancelled."""
    order = store.get_order(_customer_id(config), order_id)
    if not order:
        return _json({"error": f"No order {order_id} found on this account."})
    if order["status"] != "processing":
        return _json({"error": f"Order is {order['status']} and can no longer be cancelled."})
    store.update_order(order["id"], status="cancelled")
    return _json({"ok": True, "order_id": order["id"], "status": "cancelled",
                  "refund": f"${order['total']:.2f} to the original payment method"})


@tool
def change_shipping_address(order_id: str, new_address: str, config: RunnableConfig) -> str:
    """Change the shipping address of an order that is still processing."""
    order = store.get_order(_customer_id(config), order_id)
    if not order:
        return _json({"error": f"No order {order_id} found on this account."})
    if order["status"] != "processing":
        return _json({"error": f"Order is {order['status']}; the address can't be changed."})
    store.update_order(order["id"], shipping_address=new_address)
    return _json({"ok": True, "order_id": order["id"], "shipping_address": new_address})


@tool
def request_refund(order_id: str, amount: float, reason: str, config: RunnableConfig) -> str:
    """Request a refund for a delivered order. Refunds up to $100 are approved immediately;
    larger ones go to a supervisor for review."""
    order = store.get_order(_customer_id(config), order_id)
    if not order:
        return _json({"error": f"No order {order_id} found on this account."})
    if order["status"] != "delivered":
        return _json({"error": f"Order is {order['status']}; only delivered orders can be "
                               "refunded (processing orders can be cancelled instead)."})
    already = sum(r["amount"] for r in order["refunds"] if r["status"] != "rejected")
    if amount <= 0 or amount + already > order["total"]:
        return _json({"error": f"Amount must be between $0 and ${order['total'] - already:.2f} "
                               "(order total minus previous refunds)."})
    status = "approved" if amount <= REFUND_AUTO_APPROVE_LIMIT else "pending_approval"
    refund_id = store.add_refund(order["id"], amount, reason, status)
    # Facts the reply must carry live in the tool result; models follow these more
    # reliably than rules in the system prompt.
    tell_customer = (
        "Approved. The money returns to the original payment method in 5-7 business days."
        if status == "approved" else
        f"Refunds over ${REFUND_AUTO_APPROVE_LIMIT:.0f} are reviewed by a supervisor within "
        "1 business day; after approval it takes 5-7 business days to arrive."
    )
    return _json({"ok": True, "refund_id": refund_id, "amount": amount, "status": status,
                  "tell_customer": tell_customer})


@tool
def search_products(query: str, config: RunnableConfig, max_price: float | None = None) -> str:
    """Find products by name, brand, grape, type or size. Optionally only those at or under
    max_price dollars. Returns SKUs, prices and stock. Follow up with stock_outlook for
    restock dates or how long stock will last."""
    if error := _underage(config):
        return error
    results = []
    for hit in search("products", query, k=20):
        p = store.get_product(hit["sku"])
        if max_price is None or p["price"] <= max_price:
            results.append({k: p[k] for k in ("sku", "name", "type", "price", "stock")})
    return _json(results[:5])


@tool
def stock_outlook(sku: str, config: RunnableConfig) -> str:
    """Check stock for a SKU: units on hand, restock date if out of stock, and forecast
    demand to estimate how long current stock will last."""
    if error := _underage(config):
        return error
    product = store.get_product(sku)
    if not product:
        return _json({"error": f"No product with SKU {sku}."})
    outlook = {k: product[k] for k in ("sku", "name", "stock", "restock_eta")}
    forecast = forecast_next(store.sales_history(product["sku"]), product["sku"], horizon=3)
    if forecast:
        monthly = forecast["predicted"][0]
        outlook["forecast_units_next_month"] = round(monthly)
        if product["stock"] > 0 and monthly > 0:
            outlook["est_days_until_sold_out"] = math.floor(product["stock"] / (monthly / 30))
    return _json(outlook)


@tool
def escalate_to_human(reason: str, summary: str, config: RunnableConfig) -> str:
    """Hand the conversation to a human agent. Use when the customer asks for a person, is
    making a complaint, or the request is outside what the tools can do."""
    ticket = store.add_ticket(_customer_id(config), reason, summary)
    return _json({"ok": True, "ticket_id": ticket,
                  "message": "A support agent will reply within 2 business days."})


TOOLS = [search_help_center, list_my_orders, lookup_order, cancel_order,
         change_shipping_address, request_refund, search_products, stock_outlook,
         escalate_to_human]
