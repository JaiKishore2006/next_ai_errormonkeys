import json
import os

# Read production data
with open("public/data/layout.json", "r", encoding="utf-8") as f:
    layout = json.load(f)
with open("public/data/products.json", "r", encoding="utf-8") as f:
    products = json.load(f)
with open("public/data/orders_base.json", "r", encoding="utf-8") as f:
    orders_base = json.load(f)
with open("public/data/cooccurrence.json", "r", encoding="utf-8") as f:
    cooccurrence = json.load(f)

# Also let's check JS evaluate by creating a quick node runner or computing here
print(f"Loaded layout ({len(layout['slots'])} slots), products ({len(products)}), base orders ({len(orders_base)})")
