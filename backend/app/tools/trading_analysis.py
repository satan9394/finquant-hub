"""Pure shadow-trade attribution and real-money connector design guardrails."""
from __future__ import annotations


def analyze_shadow_trades(trades: list[dict]) -> dict:
    if not trades:
        raise ValueError("trades 不能为空")
    rows = []
    total_notional = 0.0
    total_adverse = 0.0
    realized_pnl = 0.0
    for index, trade in enumerate(trades):
        side = str(trade.get("side", "")).lower()
        if side not in {"buy", "sell"}:
            raise ValueError(f"第 {index + 1} 笔 side 必须是 buy 或 sell")
        planned = float(trade.get("planned_price", 0))
        executed = float(trade.get("executed_price", 0))
        quantity = float(trade.get("quantity", 0))
        if min(planned, executed, quantity) <= 0:
            raise ValueError(f"第 {index + 1} 笔价格和数量必须大于 0")
        adverse = (executed - planned if side == "buy" else planned - executed) * quantity
        notional = planned * quantity
        total_adverse += adverse
        total_notional += notional
        pnl = trade.get("realized_pnl")
        if pnl is not None:
            realized_pnl += float(pnl)
        rows.append({
            "symbol": str(trade.get("symbol") or "unknown"),
            "side": side,
            "quantity": quantity,
            "planned_price": planned,
            "executed_price": executed,
            "adverse_slippage_amount": adverse,
            "adverse_slippage_bps": adverse / notional * 10_000,
            "realized_pnl": float(pnl) if pnl is not None else None,
        })
    return {
        "trade_count": len(rows),
        "total_planned_notional": total_notional,
        "total_adverse_slippage_amount": total_adverse,
        "adverse_slippage_bps": total_adverse / total_notional * 10_000,
        "realized_pnl": realized_pnl,
        "items": rows,
        "scope": "analysis_only_no_order_submission",
    }


def connector_design_assessment(broker: str, requested_capabilities: list[str]) -> dict:
    requested = list(dict.fromkeys(str(item).strip() for item in requested_capabilities if str(item).strip()))
    return {
        "broker": broker.strip() or "unspecified",
        "requested_capabilities": requested,
        "implementation_status": "design_only",
        "network_calls": False,
        "credentials_accessed": False,
        "funds_accessed": False,
        "order_submission": "not_implemented",
        "required_controls": [
            "separate_read_and_trade_credentials",
            "account_and_symbol_allowlists",
            "per_order_and_daily_notional_limits",
            "pre_trade_price_and_position_validation",
            "idempotency_key_and_duplicate_order_guard",
            "human_confirmation_immediately_before_submission",
            "immutable_audit_log_and_reconciliation",
            "kill_switch_and_cancel_all_runbook",
        ],
        "decision": "requires_separate_security_compliance_and_broker_sandbox_project",
    }
