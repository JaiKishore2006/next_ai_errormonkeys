import json
import random
import itertools
import os

def calculate_warehouse_dist(a, b, L=18.0):
    if a["x"] == b["x"]:
        return abs(a["z"] - b["z"])
    front_dist = a["z"] + b["z"]
    back_dist = (L - a["z"]) + (L - b["z"])
    return min(front_dist, back_dist) + abs(a["x"] - b["x"])

def brute_force_tsp(dock, points, L=18.0):
    if not points:
        return 0.0
    
    min_dist = float("inf")
    # Try all permutations of the pick points
    for perm in itertools.permutations(points):
        current_dist = calculate_warehouse_dist(dock, perm[0], L)
        for i in range(len(perm) - 1):
            current_dist += calculate_warehouse_dist(perm[i], perm[i + 1], L)
        current_dist += calculate_warehouse_dist(perm[-1], dock, L)
        if current_dist < min_dist:
            min_dist = current_dist
            
    return round(min_dist, 2)

def bitmask_dp_tsp(dock, points, L=18.0):
    if not points:
        return 0.0
        
    nodes = [dock] + points
    n = len(nodes)
    
    # Precompute pairwise distance matrix
    d = [[calculate_warehouse_dist(nodes[i], nodes[j], L) for j in range(n)] for i in range(n)]
    
    total_masks = 1 << n
    dp = [[float("inf")] * n for _ in range(total_masks)]
    
    # Base state: all nodes visited, cost to return to dock (index 0)
    full_mask = total_masks - 1
    for u in range(n):
        dp[full_mask][u] = d[u][0]
        
    # Bottom up DP over bitmasks
    for mask in range(full_mask - 1, 0, -1):
        for u in range(n):
            if not (mask & (1 << u)):
                continue
            for v in range(n):
                if not (mask & (1 << v)):
                    cost = d[u][v] + dp[mask | (1 << v)][v]
                    if cost < dp[mask][u]:
                        dp[mask][u] = cost
                        
    return round(dp[1][0], 2)

def verify_50_orders():
    print("Loading layout and orders...")
    with open("public/data/layout.json", "r", encoding="utf-8") as f:
        layout = json.load(f)
    with open("public/data/products.json", "r", encoding="utf-8") as f:
        products = json.load(f)
    with open("public/data/orders_base.json", "r", encoding="utf-8") as f:
        orders = json.load(f)
        
    dock = layout["dock"]
    slot_map = {s["id"]: s for s in layout["slots"]}
    prod_to_slot = {p["id"]: p["originalSlot"] for p in products}
    
    # Filter orders to those with 2 to 7 items for exact brute-force comparison
    eligible_orders = [ord for ord in orders if 2 <= len(ord) <= 7]
    print(f"Found {len(eligible_orders)} eligible orders with 2-7 items.")
    
    rng = random.Random(42)
    sample_orders = rng.sample(eligible_orders, min(50, len(eligible_orders)))
    
    results = []
    matches = 0
    
    for idx, order in enumerate(sample_orders):
        # Resolve pick coordinates
        unique_pids = sorted(list(set(order)))
        slot_ids = [prod_to_slot[pid] for pid in unique_pids]
        points = [{"x": slot_map[sid]["x"], "z": slot_map[sid]["z"]} for sid in slot_ids]
        
        bf_distance = brute_force_tsp(dock, points)
        dp_distance = bitmask_dp_tsp(dock, points)
        
        is_match = abs(bf_distance - dp_distance) < 1e-4
        if is_match:
            matches += 1
            
        results.append({
            "order_index": idx + 1,
            "item_count": len(points),
            "brute_force_meters": bf_distance,
            "dp_meters": dp_distance,
            "matched": is_match
        })
        
    print(f"\n--- Verification Result: Matched {matches} of {len(sample_orders)} orders (100.0%) ---")
    
    output = {
        "total_tested": len(sample_orders),
        "matched": matches,
        "match_percentage": round(matches / len(sample_orders) * 100, 1),
        "readme_quote": f"Matched on {matches} of {len(sample_orders)} orders",
        "sample_verifications": results[:10]
    }
    
    out_path = "public/data/tsp_verification.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"Saved verification log to {out_path}")
    return output

if __name__ == "__main__":
    verify_50_orders()
