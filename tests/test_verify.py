import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from support_agent.graph import unbacked_claims


def turn(*tool_results):
    msgs = [HumanMessage(content="cancel ORD-1")]
    for name, payload in tool_results:
        msgs.append(AIMessage(content="", tool_calls=[{"name": name, "args": {}, "id": name}]))
        msgs.append(ToolMessage(content=json.dumps(payload), name=name, tool_call_id=name))
    return msgs


def test_promise_without_tool_call_is_flagged():
    assert unbacked_claims(turn(), "I will cancel your order ORD-1.") == ["cancel_order"]


def test_claim_backed_by_successful_tool_passes():
    msgs = turn(("cancel_order", {"ok": True}))
    assert unbacked_claims(msgs, "Your order has been cancelled.") == []


def test_claim_after_failed_tool_is_flagged():
    msgs = turn(("cancel_order", {"error": "Order is shipped"}))
    assert unbacked_claims(msgs, "Your order has been cancelled.") == ["cancel_order"]


def test_tool_from_an_earlier_turn_does_not_count():
    msgs = turn(("cancel_order", {"ok": True})) + [HumanMessage(content="and ORD-2?")]
    assert unbacked_claims(msgs, "ORD-2 has been cancelled too.") == ["cancel_order"]


def test_refund_and_address_claims():
    assert unbacked_claims(turn(), "Your refund has been approved.") == ["request_refund"]
    assert unbacked_claims(turn(), "The address has been updated.") == ["change_shipping_address"]


def test_plain_answers_pass():
    assert unbacked_claims(turn(), "Orders can be cancelled while processing.") == []
    assert unbacked_claims(turn(), "That order can no longer be cancelled.") == []


def test_verifier_notes_do_not_start_a_new_turn():
    from support_agent.graph import VERIFIER

    msgs = turn(("cancel_order", {"ok": True})) + [HumanMessage(content="check", name=VERIFIER)]
    assert unbacked_claims(msgs, "Your order has been cancelled.") == []


def test_offers_and_let_me_promises_are_flagged():
    for reply in ["I can cancel your order now. Let me do that for you.",
                  "Let me cancel that order for you.",
                  "I'll go ahead and cancel ORD-1.",
                  "Let me submit a refund for you."]:
        assert unbacked_claims(turn(), reply), reply


def test_questions_about_cancelling_are_not_claims():
    assert unbacked_claims(turn(), "Would you like me to cancel ORD-1?") == []
    assert unbacked_claims(turn(), "You can cancel orders while they are processing.") == []
