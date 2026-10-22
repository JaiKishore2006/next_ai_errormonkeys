import os
import json
import time
from layout_generator import generate_layout
from clean import clean_dataset, select_top_100_products, assign_synthetic_and_slots, generate_orders_and_stats

def build_all(parquet_path="data-raw/retail.parquet", out_dir="public/data"):
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    
    print("--- 1. Generating Warehouse Layout (240 slots, 6 aisles) ---")
    layout_path = os.path.join(out_dir, "layout.json")
    generate_layout(layout_path)
    
    print("\n--- 2. Cleaning Retail Dataset ---")
    df, cleaning_log = clean_dataset(parquet_path)
    
    print("\n--- 3. Selecting Top 100 Products (70 freq + 30 holiday uplift) ---")
    selected_codes, best_desc, sc_freq, sc_month_freq = select_top_100_products(df)
    
    print("\n--- 4. Assigning Synthetic Constraints and Legal Original Slots ---")
    products = assign_synthetic_and_slots(selected_codes, best_desc, sc_freq, layout_path)
    products_path = os.path.join(out_dir, "products.json")
    with open(products_path, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=2)
    print(f"Saved {len(products)} products to {products_path}")
    
    print("\n--- 5. Generating Orders, Co-occurrence, and Monthly Demand ---")
    base_month, monthly_order_counts = generate_orders_and_stats(df, products, out_dir)
    
    print("\n--- 6. Pipeline Summary & Verification ---")
    summary = {
        "cleaning_log": cleaning_log,
        "product_count": len(products),
        "base_month": base_month,
        "monthly_order_counts": monthly_order_counts,
        "execution_time_sec": round(time.time() - t0, 2)
    }
    
    with open(os.path.join(out_dir, "pipeline_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        
    print(f"All data files successfully generated in {out_dir} in {summary['execution_time_sec']}s!")
    return summary

if __name__ == "__main__":
    build_all()
