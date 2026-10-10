import sqlite3

import pytest

from support_agent import store

CUSTOMERS = [(1, "Ava Smith", "ava@example.com", "1990-05-01", "1 Oak St, Rockville, MD"),
             (2, "Omar Ali", "omar@example.com", "1985-01-01", "2 Elm Dr, Bethesda, MD"),
             (3, "Teen Kid", "kid@example.com", "2009-06-01", "3 Cedar Ln, Rockville, MD")]
PRODUCTS = [("100", "WOODBRIDGE CAB - 750ML", "WINE", "SUTTER", 10.99, 40, None),
            ("200", "HEINEKEN 18PK NR - 12OZ", "BEER", "HEINEKEN USA", 18.99, 0, "2026-10-20")]
ORDERS = [("ORD-1", 1, "processing", "2026-09-30T10:00", "1 Oak St", None, 50.0),
          ("ORD-2", 1, "delivered", "2026-09-01T10:00", "1 Oak St", "1Z1", 250.0),
          ("ORD-3", 1, "shipped", "2026-09-28T10:00", "1 Oak St", "1Z2", 30.0),
          ("ORD-4", 2, "processing", "2026-09-30T10:00", "2 Elm Dr", None, 80.0)]


@pytest.fixture(autouse=True)
def store_db(tmp_path, monkeypatch):
    path = tmp_path / "store.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(store.SCHEMA)
        conn.executemany("INSERT INTO customers VALUES (?,?,?,?,?)", CUSTOMERS)
        conn.executemany("INSERT INTO products VALUES (?,?,?,?,?,?,?)", PRODUCTS)
        conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?)", ORDERS)
        conn.executemany("INSERT INTO order_items VALUES (?,?,?,?)",
                         [("ORD-1", "100", 2, 10.99), ("ORD-2", "100", 6, 10.99)])
    monkeypatch.setattr(store, "STORE_DB", path)
    return path
