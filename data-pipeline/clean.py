import os
import json
import re
import random
from collections import defaultdict
from itertools import combinations
import pandas as pd
import numpy as np

# Keyword rules for synthetic flags
HEAVY_KEYWORDS = ["TIN", "JAR", "BOX", "BOTTLE", "LANTERN", "BUCKET", "BASKET", "FRAME"]
FRAGILE_KEYWORDS = ["GLASS", "CERAMIC", "MUG", "CUP", "TEAPOT", "PLATE", "BOWL", "VASE"]
HAZARD_KEYWORDS = ["CANDLE", "T-LIGHT", "TEALIGHT", "MATCH", "INCENSE"]

def clean_dataset(parquet_path="data-raw/retail.parquet"):
    print(f"Loading {parquet_path}...")
    df = pd.read_parquet(parquet_path)
    initial_rows = len(df)
    print(f"Initial raw rows: {initial_rows:,}")
    
    # 1. Drop invoices not matching ^\d{6}$ (removes cancellations starting with 'C' and adjustments)
    df["Invoice"] = df["Invoice"].astype(str).str.strip()
    mask_inv = df["Invoice"].str.match(r"^\d{6}$")
    inv_dropped = initial_rows - mask_inv.sum()
    df = df[mask_inv]
    print(f"Dropped non-6-digit invoices (cancellations/adjustments): {inv_dropped:,} rows (remaining: {len(df):,})")
    
    # 2. Keep StockCodes matching ^\d{5}[A-Za-z]{0,2}$ (removes POST, M, DOT, BANK CHARGES, etc.)
    df["StockCode"] = df["StockCode"].astype(str).str.strip()
    mask_sc = df["StockCode"].str.match(r"^\d{5}[A-Za-z]{0,2}$")
    sc_dropped = len(df) - mask_sc.sum()
    df = df[mask_sc]
    print(f"Dropped non-product StockCodes: {sc_dropped:,} rows (remaining: {len(df):,})")
    
    # 3. Drop Quantity <= 0 and Price <= 0
    df["Quantity"] = pd.to_numeric(df["Quantity"], errors="coerce").fillna(0)
    df["Price"] = pd.to_numeric(df["Price"], errors="coerce").fillna(0)
    mask_qp = (df["Quantity"] > 0) & (df["Price"] > 0)
    qp_dropped = len(df) - mask_qp.sum()
    df = df[mask_qp]
    print(f"Dropped Quantity <= 0 or Price <= 0: {qp_dropped:,} rows (remaining: {len(df):,})")
    
    # 4. Parse InvoiceDate, add month column
    df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"])
    df["month"] = df["InvoiceDate"].dt.strftime("%Y-%m")
    
    # Clean description
    df["Description"] = df["Description"].fillna("").astype(str).str.strip()
    
    cleaning_log = {
        "initial_rows": initial_rows,
        "dropped_invoices": int(inv_dropped),
        "dropped_stockcodes": int(sc_dropped),
        "dropped_quantity_price": int(qp_dropped),
        "clean_rows": len(df)
    }
    
    return df, cleaning_log

def select_top_100_products(df):
    """
    Pick frequency means the number of distinct orders containing the product, not total quantity.
    Top 70 by yearly frequency.
    Plus 30 with biggest Nov to Dec uplift.
    """
    best_desc = df.groupby("StockCode")["Description"].agg(lambda s: s.value_counts().index[0] if len(s) > 0 else "")
    
    # Distinct invoices per StockCode overall
    sc_freq = df.groupby("StockCode")["Invoice"].nunique().sort_values(ascending=False)
    
    # Monthly frequency per StockCode
    sc_month_freq = df.groupby(["StockCode", "month"])["Invoice"].nunique().unstack(fill_value=0)
    
    # Top 70 by total distinct invoices
    top_70_codes = list(sc_freq.head(70).index)
    remaining_codes = [c for c in sc_freq.index if c not in top_70_codes]
    
    # Compute Nov-Dec uplift for remaining codes
    uplift_scores = []
    nov_cols = [c for c in sc_month_freq.columns if c.endswith("-11")]
    dec_cols = [c for c in sc_month_freq.columns if c.endswith("-12")]
    other_cols = [c for c in sc_month_freq.columns if not (c.endswith("-11") or c.endswith("-12"))]
    
    for code in remaining_codes:
        total_picks = sc_freq[code]
        if total_picks < 30:
            continue
        
        row = sc_month_freq.loc[code] if code in sc_month_freq.index else None
        if row is None:
            continue
            
        nov_dec_picks = row[nov_cols].sum() + row[dec_cols].sum()
        other_picks = row[other_cols].mean() if len(other_cols) > 0 else 1.0
        
        uplift = nov_dec_picks / (other_picks + 1.0)
        uplift_scores.append((code, uplift, total_picks))
    
    uplift_scores.sort(key=lambda x: x[1], reverse=True)
    top_30_uplift = [x[0] for x in uplift_scores[:30]]
    
    selected_100 = top_70_codes + top_30_uplift
    print(f"Selected 100 products: 70 top-frequency + {len(top_30_uplift)} holiday-uplift")
    
    return selected_100, best_desc, sc_freq, sc_month_freq

def assign_synthetic_and_slots(selected_codes, best_desc, sc_freq, layout_path="public/data/layout.json"):
    with open(layout_path, "r", encoding="utf-8") as f:
        layout = json.load(f)
        
    slots = layout["slots"]
    
    # Available slots per category
    hazard_slots_l0 = [s["id"] for s in slots if s["zone"] == "hazard" and s["level"] == 0]
    hazard_slots_l1 = [s["id"] for s in slots if s["zone"] == "hazard" and s["level"] == 1]
    
    fragile_slots_l0 = [s["id"] for s in slots if s["zone"] == "fragile" and s["level"] == 0]
    fragile_slots_l1 = [s["id"] for s in slots if s["zone"] == "fragile" and s["level"] == 1]
    
    normal_slots_l0 = [s["id"] for s in slots if s["zone"] == "normal" and s["level"] == 0]
    normal_slots_l1 = [s["id"] for s in slots if s["zone"] == "normal" and s["level"] == 1]
    
    # Sort selected products by StockCode to emulate:
    # "original layout = stock-code order, like a warehouse that never optimised"
    sorted_codes = sorted(selected_codes)
    
    products_raw = []
    rng = random.Random(42)
    
    for code in sorted_codes:
        desc = str(best_desc.get(code, "")).upper()
        
        # Hazard keywords take priority for safety classification
        is_hazard = any(k in desc for k in HAZARD_KEYWORDS)
        # Fragile if fragile keywords and not hazard
        is_fragile = (not is_hazard) and any(k in desc for k in FRAGILE_KEYWORDS)
        # Heavy keywords
        is_heavy = any(k in desc for k in HEAVY_KEYWORDS)
        
        if is_heavy:
            weight = "heavy"
        else:
            weight = "light" if rng.random() < 0.5 else "medium"
            
        freq = int(sc_freq.get(code, 0))
        
        products_raw.append({
            "code": code,
            "name": best_desc.get(code, ""),
            "freq": freq,
            "weight": weight,
            "fragile": is_fragile,
            "hazard": is_hazard
        })
    
    # Separate by constraint priority in stock code order
    hazard_items = [p for p in products_raw if p["hazard"]]
    fragile_items = [p for p in products_raw if p["fragile"]]
    heavy_items = [p for p in products_raw if p["weight"] == "heavy" and not p["hazard"] and not p["fragile"]]
    normal_items = [p for p in products_raw if not p["hazard"] and not p["fragile"] and p["weight"] != "heavy"]
    
    slot_assignments = {}
    
    # 1. Assign Hazard items -> Aisle 5
    for p in hazard_items:
        if p["weight"] == "heavy":
            slot_id = hazard_slots_l0.pop(0)
        else:
            slot_id = hazard_slots_l1.pop(0) if hazard_slots_l1 else hazard_slots_l0.pop(0)
        slot_assignments[p["code"]] = slot_id
        
    # 2. Assign Fragile items -> Aisle 4
    for p in fragile_items:
        if p["weight"] == "heavy":
            slot_id = fragile_slots_l0.pop(0)
        else:
            slot_id = fragile_slots_l1.pop(0) if fragile_slots_l1 else fragile_slots_l0.pop(0)
        slot_assignments[p["code"]] = slot_id
        
    # 3. Assign Heavy items -> Level 0 in normal aisles
    for p in heavy_items:
        slot_id = normal_slots_l0.pop(0)
        slot_assignments[p["code"]] = slot_id
        
    # 4. Assign Normal unconstrained items -> remaining normal slots
    remaining_normal = sorted(normal_slots_l0 + normal_slots_l1)
    for p in normal_items:
        slot_id = remaining_normal.pop(0)
        slot_assignments[p["code"]] = slot_id
        
    # Assign product IDs 0 to 99 sorted by yearly frequency descending
    products_sorted_by_freq = sorted(products_raw, key=lambda x: x["freq"], reverse=True)
    final_products = []
    
    for new_id, p in enumerate(products_sorted_by_freq):
        code = p["code"]
        slot_id = slot_assignments[code]
        final_products.append({
            "id": new_id,
            "code": code,
            "name": p["name"],
            "freq": p["freq"],
            "weight": p["weight"],
            "fragile": p["fragile"],
            "hazard": p["hazard"],
            "originalSlot": slot_id
        })
        
    # Validation check for each product's slot legality
    slot_map = {s["id"]: s for s in slots}
    for p in final_products:
        s = slot_map[p["originalSlot"]]
        if p["hazard"] and s["zone"] != "hazard":
            raise ValueError(f"Product {p['id']} hazard violation in slot {s['id']}")
        if p["fragile"] and s["zone"] != "fragile":
            raise ValueError(f"Product {p['id']} fragile violation in slot {s['id']}")
        if p["weight"] == "heavy" and s["level"] != 0:
            raise ValueError(f"Product {p['id']} heavy violation in slot {s['id']}")
            
    print(f"All {len(final_products)} products assigned and validated 100% legal in originalSlot!")
    return final_products

def generate_orders_and_stats(df, products, out_dir="public/data"):
    code_to_id = {p["code"]: p["id"] for p in products}
    valid_codes = set(code_to_id.keys())
    
    # Filter df to only the 100 products
    df_100 = df[df["StockCode"].isin(valid_codes)].copy()
    df_100["productId"] = df_100["StockCode"].map(code_to_id)
    
    # We focus on the 12 calendar months of Dec 2010 to Nov 2011 (or all complete months)
    all_months = sorted(df_100["month"].unique())
    print(f"All available months in dataset: {all_months}")
    
    # Select the 12 consecutive months for the season simulation
    # If 2010-12 to 2011-11 exists, use those 12 months
    target_12 = ["2010-12", "2011-01", "2011-02", "2011-03", "2011-04", "2011-05", 
                 "2011-06", "2011-07", "2011-08", "2011-09", "2011-10", "2011-11"]
    active_months = [m for m in target_12 if m in all_months]
    if len(active_months) < 12:
        active_months = all_months[-12:]
    print(f"Active 12 months selected for simulation: {active_months}")
    
    # Generate orders per month
    monthly_orders = {}
    monthly_order_counts = {}
    
    for m in all_months:
        m_df = df_100[df_100["month"] == m]
        # Group by invoice and collect distinct product IDs
        inv_orders = m_df.groupby("Invoice")["productId"].apply(lambda s: sorted(list(set(s)))).tolist()
        # Drop empty orders
        inv_orders = [ord for ord in inv_orders if len(ord) > 0]
        monthly_orders[m] = inv_orders
        monthly_order_counts[m] = len(inv_orders)
        
        out_file = os.path.join(out_dir, f"orders_{m}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(inv_orders, f)
            
    print("Monthly order counts:", monthly_order_counts)
    
    # Pick a quiet month (e.g., 2011-03) as orders_base.json
    base_month = "2011-03" if "2011-03" in monthly_orders else active_months[2]
    with open(os.path.join(out_dir, "orders_base.json"), "w", encoding="utf-8") as f:
        json.dump(monthly_orders[base_month], f)
    print(f"Set base month orders to {base_month} ({len(monthly_orders[base_month])} orders)")
    
    # Monthly demand: {"2011-01": [freq per product id (0..99)], ...}
    monthly_demand = {}
    for m in active_months:
        m_df = df_100[df_100["month"] == m]
        m_counts = m_df.groupby("productId")["Invoice"].nunique().to_dict()
        freq_list = [int(m_counts.get(i, 0)) for i in range(len(products))]
        monthly_demand[m] = freq_list
        
    with open(os.path.join(out_dir, "monthly_demand.json"), "w", encoding="utf-8") as f:
        json.dump(monthly_demand, f, indent=2)
        
    # Co-occurrence: Count pairs within each order across the base year (capped at 15 items)
    pair_counts = defaultdict(int)
    for m in active_months:
        for order in monthly_orders[m]:
            capped = order[:15]
            for a, b in combinations(capped, 2):
                pair = (min(a, b), max(a, b))
                pair_counts[pair] += 1
                
    sorted_pairs = sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[:500]
    coocc_list = [{"a": p[0], "b": p[1], "count": count} for p, count in sorted_pairs]
    
    with open(os.path.join(out_dir, "cooccurrence.json"), "w", encoding="utf-8") as f:
        json.dump(coocc_list, f, indent=2)
    print(f"Saved top {len(coocc_list)} co-occurrence pairs.")
    
    return base_month, monthly_order_counts
