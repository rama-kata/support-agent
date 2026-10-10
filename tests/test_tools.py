import json

from support_agent import store
from support_agent.tools import cancel_order, lookup_order, request_refund, stock_outlook


def call(tool, customer_id=1, **args):
    return json.loads(tool.invoke(args, config={"configurable": {"customer_id": customer_id}}))


def test_customer_cannot_see_another_customers_order():
    assert "error" in call(lookup_order, order_id="ORD-4")
    assert call(lookup_order, customer_id=2, order_id="ORD-4")["id"] == "ORD-4"


def test_customer_cannot_cancel_another_customers_order():
    assert "error" in call(cancel_order, order_id="ORD-4")
    assert store.get_order(2, "ORD-4")["status"] == "processing"


def test_order_ids_are_normalized():
    assert call(lookup_order, order_id=" ord-1 ")["id"] == "ORD-1"


def test_cancel_only_processing_orders():
    assert call(cancel_order, order_id="ORD-1")["status"] == "cancelled"
    assert "error" in call(cancel_order, order_id="ORD-3")
    assert store.get_order(1, "ORD-3")["status"] == "shipped"


def test_small_refund_auto_approved_large_needs_supervisor():
    assert call(request_refund, order_id="ORD-2", amount=40, reason="corked")["status"] == \
        "approved"
    assert call(request_refund, order_id="ORD-2", amount=150, reason="broken")["status"] == \
        "pending_approval"


def test_refund_cannot_exceed_order_total_minus_previous_refunds():
    call(request_refund, order_id="ORD-2", amount=200, reason="broken")
    assert "error" in call(request_refund, order_id="ORD-2", amount=60, reason="more")


def test_refund_rejected_for_undelivered_or_nonpositive():
    assert "error" in call(request_refund, order_id="ORD-1", amount=10, reason="x")
    assert "error" in call(request_refund, order_id="ORD-2", amount=-5, reason="x")


def test_underage_customer_gets_no_product_info():
    assert "error" in call(stock_outlook, customer_id=3, sku="100")
    assert call(stock_outlook, customer_id=1, sku="200")["restock_eta"] == "2026-10-20"


def test_missing_session_customer_is_rejected():
    try:
        lookup_order.invoke({"order_id": "ORD-1"}, config={"configurable": {}})
    except ValueError:
        return
    raise AssertionError("expected ValueError without an authenticated customer")
