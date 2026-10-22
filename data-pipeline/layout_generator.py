import json
import os

def generate_layout(out_path="public/data/layout.json"):
    aisle_x = [3, 8, 13, 18, 23, 28]
    slots = []
    slot_id = 0

    for aisle_idx, x in enumerate(aisle_x):
        # Determine zone
        if aisle_idx == 5:
            zone = "hazard"
        elif aisle_idx == 4:
            zone = "fragile"
        else:
            zone = "normal"

        for side in ["L", "R"]:
            for bay in range(10):
                z = round(2.25 + 1.5 * bay, 3)
                for level in [0, 1]:
                    slots.append({
                        "id": slot_id,
                        "aisle": aisle_idx,
                        "side": side,
                        "bay": bay,
                        "level": level,
                        "x": x,
                        "z": z,
                        "zone": zone
                    })
                    slot_id += 1

    layout = {
        "walkSpeed": 1.2,
        "aisleLength": 18,
        "dock": {"x": 0, "z": 0},
        "aisleX": aisle_x,
        "slots": slots
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=2)

    print(f"Generated {len(slots)} slots in {out_path} across {len(aisle_x)} aisles.")
    return layout

if __name__ == "__main__":
    generate_layout()
