from support_agent import confirm


def call(name, **args):
    return {"name": name, "id": f"call_{name}", "args": args}


def test_cancel_processing_order_asks_with_refund_amount():
    p = confirm.preview(call("cancel_order", order_id="ORD-1"), customer_id=1)
    assert p["title"] == "Cancel ORD-1?"
    assert ["Refund", "$50.00 to your original payment method"] in p["lines"]
    assert p["warning"] == "This can't be undone."


def test_no_confirmation_when_the_action_would_fail_anyway():
    assert confirm.preview(call("cancel_order", order_id="ORD-3"), 1) is None   # shipped
    assert confirm.preview(call("cancel_order", order_id="ORD-4"), 1) is None   # not theirs
    assert confirm.preview(call("request_refund", order_id="ORD-1", amount=10), 1) is None
    assert confirm.preview(call("request_refund", order_id="ORD-2", amount=999), 1) is None


def test_refund_preview_states_who_approves():
    small = confirm.preview(call("request_refund", order_id="ORD-2", amount=40), 1)
    large = confirm.preview(call("request_refund", order_id="ORD-2", amount=150), 1)
    assert ["Approval", "Approved right away"] in small["lines"]
    assert ["Approval", "Reviewed by a supervisor within 1 business day"] in large["lines"]


def test_address_change_shows_old_and_new():
    p = confirm.preview(call("change_shipping_address", order_id="ORD-1",
                             new_address="9 Pine St"), 1)
    assert ["From", "1 Oak St"] in p["lines"] and ["To", "9 Pine St"] in p["lines"]


def test_lookups_never_need_confirmation():
    assert confirm.preview(call("lookup_order", order_id="ORD-1"), 1) is None


def test_declined_message_tells_agent_nothing_changed():
    msg = confirm.declined_message(call("cancel_order", order_id="ORD-1"))
    assert '"declined": true' in msg.content and msg.tool_call_id == "call_cancel_order"
