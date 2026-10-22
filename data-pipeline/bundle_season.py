import json
import glob
import os

def bundle_season():
    # Gather all 12 monthly order files
    months_target = [
        "2010-12", "2011-01", "2011-02", "2011-03", "2011-04", "2011-05",
        "2011-06", "2011-07", "2011-08", "2011-09", "2011-10", "2011-11"
    ]
    
    monthly_data = {}
    for m in months_target:
        fpath = f"public/data/orders_{m}.json"
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                monthly_data[m] = json.load(f)
                
    print(f"Loaded {len(monthly_data)} months of real orders.")
    
    with open("public/data/layout.json", "r", encoding="utf-8") as f:
        layout = json.load(f)
    with open("public/data/products.json", "r", encoding="utf-8") as f:
        products = json.load(f)
        
    summary = {
        "active_months": list(monthly_data.keys()),
        "total_months": len(monthly_data),
        "total_annual_orders": sum(len(ords) for ords in monthly_data.values()),
        "month_order_counts": {m: len(ords) for m, ords in monthly_data.items()}
    }
    
    out_file = "public/data/season_manifest.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        
    print(f"Season manifest saved to {out_file}: {summary['total_annual_orders']} total orders across {summary['total_months']} months.")

if __name__ == "__main__":
    bundle_season()
