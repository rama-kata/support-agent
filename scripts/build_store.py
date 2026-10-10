"""Build data/store.db: a synthetic retailer backed by real Montgomery County SKUs.

Products and monthly sales history come from the real dataset. Prices, stock levels,
customers and orders are synthetic (seeded, so the database is reproducible).
"""

import random
import sqlite3
from datetime import datetime, timedelta

import pandas as pd
from pipeline.loader import clean_data, validate_schema

from support_agent.config import DATA, RAW, STORE_DB
from support_agent.store import SCHEMA

N_PRODUCTS = 1500
N_CUSTOMERS = 200
N_ORDERS = 1200
TODAY = datetime(2026, 10, 1)
PRICE_RANGE = {"WINE": (9, 85), "LIQUOR": (14, 120), "BEER": (8, 28)}
FIRST = ["Ava", "Liam", "Noah", "Mia", "Zara", "Kofi", "Amara", "Diego", "Hana", "Omar",
         "Priya", "Lucas", "Nia", "Mateo", "Leila", "Ethan", "Sofia", "Yusuf", "Chloe", "Ravi"]
LAST = ["Okafor", "Smith", "Nguyen", "Garcia", "Mensah", "Kim", "Patel", "Brown", "Haddad",
        "Silva", "Johnson", "Deng", "Kowalski", "Tanaka", "Moreau", "Achieng", "Lopez", "Ali"]
CITIES = ["Rockville, MD", "Bethesda, MD", "Silver Spring, MD", "Gaithersburg, MD",
          "Takoma Park, MD", "Washington, DC", "Arlington, VA"]
STREETS = ["Maple Ave", "Oak St", "Georgia Ave", "Elm Dr", "Veirs Mill Rd", "Cedar Ln"]



def build_products(df: pd.DataFrame, rng: random.Random) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = df[df["item_type"].isin(PRICE_RANGE)]
    totals = df.groupby("sku").agg(
        name=("description", "first"), type=("item_type", "first"),
        supplier=("supplier", "first"), months=("date", "nunique"),
        total=("total_sales", "sum"),
    )
    top = totals[totals["months"] >= 15].nlargest(N_PRODUCTS, "total").reset_index()
    top["price"] = [round(round(rng.uniform(*PRICE_RANGE[t])) - 0.01, 2) for t in top["type"]]
    # Sales are county-wide, so size each SKU's stock relative to its own monthly demand:
    # ~12% out of stock, ~15% low (a few days left), the rest 1-12 weeks of cover.
    monthly = top["total"] / top["months"]
    stock, eta = [], []
    for demand in monthly:
        roll = rng.random()
        if roll < 0.12:
            stock.append(0)
            eta.append((TODAY + timedelta(days=rng.randint(5, 40))).date().isoformat())
        else:
            weeks = rng.uniform(0.2, 1) if roll < 0.27 else rng.uniform(1, 12)
            stock.append(max(1, round(demand / 4.3 * weeks)))
            eta.append(None)
    top["stock"], top["restock_eta"] = stock, eta
    sales = df[df["sku"].isin(top["sku"])].groupby(["sku", "date"], as_index=False)[
        "total_sales"].sum()
    sales["date"] = sales["date"].dt.date.astype(str)
    return top[["sku", "name", "type", "supplier", "price", "stock", "restock_eta"]], sales


def build_customers(rng: random.Random) -> list[tuple]:
    rows = []
    for i in range(1, N_CUSTOMERS + 1):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        # A few under-21 accounts so the age guardrail has something to catch.
        age = rng.randint(18, 20) if i % 25 == 0 else rng.randint(21, 75)
        birth = (TODAY - timedelta(days=age * 365 + rng.randint(0, 364))).date().isoformat()
        address = f"{rng.randint(10, 9999)} {rng.choice(STREETS)}, {rng.choice(CITIES)}"
        rows.append((i, f"{first} {last}", f"{first}.{last}{i}@example.com".lower(),
                     birth, address))
    return rows


def build_orders(products: pd.DataFrame, customers: list[tuple], rng: random.Random):
    orders, items = [], []
    statuses = ["processing"] * 2 + ["shipped"] * 3 + ["delivered"] * 6 + ["cancelled"]
    catalog = products[["sku", "price"]].values.tolist()
    for n in range(N_ORDERS):
        order_id = f"ORD-{10001 + n}"
        customer = rng.choice(customers)
        status = rng.choice(statuses)
        age_days = {"processing": (0, 2), "shipped": (2, 6), "delivered": (6, 120),
                    "cancelled": (1, 120)}[status]
        created = TODAY - timedelta(days=rng.randint(*age_days), hours=rng.randint(0, 23))
        total = 0.0
        for sku, price in rng.sample(catalog, rng.randint(1, 4)):
            qty = rng.choice([1, 1, 1, 2, 2, 3, 6])
            items.append((order_id, sku, qty, price))
            total += qty * price
        tracking = f"1Z{rng.randint(10**9, 10**10 - 1)}" if status in ("shipped",
                                                                         "delivered") else None
        orders.append((order_id, customer[0], status, created.isoformat(timespec="minutes"),
                       customer[4], tracking, round(total, 2)))
    return orders, items


def main():
    rng = random.Random(42)
    raw = pd.read_csv(RAW / "retail_sales.csv")
    validate_schema(raw)
    df = clean_data(raw)
    df["sku"] = df["sku"].astype(str)

    products, sales = build_products(df, rng)
    customers = build_customers(rng)
    orders, items = build_orders(products, customers, rng)

    DATA.mkdir(exist_ok=True)
    STORE_DB.unlink(missing_ok=True)
    with sqlite3.connect(STORE_DB) as conn:
        conn.executescript(SCHEMA)
        products.to_sql("products", conn, if_exists="append", index=False)
        sales.to_sql("sales", conn, if_exists="append", index=False)
        conn.executemany("INSERT INTO customers VALUES (?,?,?,?,?)", customers)
        conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?)", orders)
        conn.executemany("INSERT INTO order_items VALUES (?,?,?,?)", items)
    print(f"{STORE_DB}: {len(products)} products, {len(sales)} sales rows, "
          f"{len(customers)} customers, {len(orders)} orders")


if __name__ == "__main__":
    main()
