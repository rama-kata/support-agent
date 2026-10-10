"""Data access for the synthetic store. Every order query is scoped to a customer."""

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime

import pandas as pd

from support_agent.config import STORE_DB

SCHEMA = """
CREATE TABLE products (sku TEXT PRIMARY KEY, name TEXT, type TEXT, supplier TEXT,
    price REAL, stock INTEGER, restock_eta TEXT);
CREATE TABLE sales (sku TEXT, date TEXT, total_sales REAL);
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE,
    birth_date TEXT, address TEXT);
CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id INTEGER, status TEXT,
    created_at TEXT, shipping_address TEXT, tracking_number TEXT, total REAL);
CREATE TABLE order_items (order_id TEXT, sku TEXT, quantity INTEGER, unit_price REAL);
CREATE TABLE refunds (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, amount REAL,
    reason TEXT, status TEXT, created_at TEXT);
CREATE TABLE tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER,
    reason TEXT, summary TEXT, status TEXT, created_at TEXT);
"""


@contextmanager
def connect(path=None):
    conn = sqlite3.connect(path or STORE_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_customer(customer_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    return dict(row) if row else None


def customer_age(customer: dict, today: date | None = None) -> int:
    today = today or date.today()
    born = date.fromisoformat(customer["birth_date"])
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def get_order(customer_id: int, order_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM orders WHERE id = ? AND customer_id = ?",
            (order_id.strip().upper(), customer_id),
        ).fetchone()
        if not row:
            return None
        items = conn.execute(
            "SELECT oi.sku, p.name, oi.quantity, oi.unit_price FROM order_items oi "
            "JOIN products p ON p.sku = oi.sku WHERE oi.order_id = ?", (row["id"],),
        ).fetchall()
        refunds = conn.execute(
            "SELECT amount, status, created_at FROM refunds WHERE order_id = ?", (row["id"],),
        ).fetchall()
    return {**dict(row), "items": [dict(i) for i in items], "refunds": [dict(r) for r in refunds]}


def list_orders(customer_id: int, limit: int = 5) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, status, created_at, total FROM orders WHERE customer_id = ? "
            "ORDER BY created_at DESC LIMIT ?", (customer_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def update_order(order_id: str, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    with connect() as conn:
        conn.execute(f"UPDATE orders SET {sets} WHERE id = ?", (*fields.values(), order_id))


def add_refund(order_id: str, amount: float, reason: str, status: str) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO refunds (order_id, amount, reason, status, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (order_id, amount, reason, status, datetime.now().isoformat(timespec="minutes")),
        )
        return cur.lastrowid


def add_ticket(customer_id: int, reason: str, summary: str) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO tickets (customer_id, reason, summary, status, created_at) "
            "VALUES (?, ?, ?, 'open', ?)",
            (customer_id, reason, summary, datetime.now().isoformat(timespec="minutes")),
        )
        return cur.lastrowid


def get_product(sku: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM products WHERE sku = ?", (sku.strip(),)).fetchone()
    return dict(row) if row else None


def sales_history(sku: str) -> pd.DataFrame:
    """Monthly sales in the shape retail-inventory-ai's forecasting expects."""
    with connect() as conn:
        df = pd.read_sql("SELECT sku, date, total_sales FROM sales WHERE sku = ? ORDER BY date",
                         conn, params=(sku,))
    df["date"] = pd.to_datetime(df["date"])
    return df
