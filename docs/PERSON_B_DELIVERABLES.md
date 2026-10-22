# Person B Deliverables & README Handover

This document contains all final technical documentation, data cleaning logs, mathematical definitions, assumptions, and verified numbers produced by **Person B (Data Pipeline & Engine)** for **Person C** to incorporate into [`README.md`](../README.md) and the **Pitch Deck**.

---

## 1. Data Processing & Cleaning Log

* **Dataset:** [UCI Online Retail II Repository](https://archive.ics.uci.edu/dataset/502/online+retail+ii) (Chen, 2012, CC BY 4.0).
* **Initial Raw Records:** 1,067,371 transaction rows (across sheets `Year 2009-2010` and `Year 2010-2011`).

### Data Cleaning Rules Applied:
1. **Invoice Filtering (`^\d{6}$`):** Dropped **19,500 rows** representing cancellations (invoices starting with `C`) and non-numeric accounting adjustments.
2. **StockCode Filtering (`^\d{5}[A-Za-z]{0,2}$`):** Removed **4,878 rows** corresponding to postage (`POST`), manual adjustments (`M`), bank fees, Amazon fees, and sample codes (`DOT`, `CRUK`).
3. **Quantity & Price Validation:** Removed **6,116 rows** where `Quantity <= 0` or `Price <= 0`.
4. **Final Clean Transactions:** **1,036,877 valid order lines**.

### Product Selection (100 Core SKUs):
* **Top 70 SKUs:** Ranked by total annual distinct invoice frequency.
* **Top 30 SKUs:** Highest November–December holiday demand uplift:
  $$\text{Uplift} = \frac{\text{freq}(\text{Nov}) + \text{freq}(\text{Dec})}{\text{avg}(\text{Jan–Oct}) + 1.0}$$
  Guarantees realistic seasonal spikes for the holiday peak rush (Level 5 gameplay).

---

## 2. Synthetic Property Disclosures

Because the original retail dataset does not contain physical warehouse dimensions, synthetic physical constraints were generated deterministically via keyword matching on product descriptions:

| Category | Keywords Matched | Warehouse Zone Rule |
| :--- | :--- | :--- |
| **Hazardous** | `CANDLE`, `T-LIGHT`, `TEALIGHT`, `MATCH`, `INCENSE` | **Aisle 5 Only** (Dedicated Hazard Zone) |
| **Fragile** | `GLASS`, `CERAMIC`, `MUG`, `CUP`, `TEAPOT`, `PLATE`, `BOWL`, `VASE` | **Aisle 4 Only** (Dedicated Fragile Zone) |
| **Heavy** | `TIN`, `JAR`, `BOX`, `BOTTLE`, `LANTERN`, `BUCKET`, `BASKET`, `FRAME` | **Level 0 Only** (Bottom Shelf / Floor Racks) |
| **Standard** | All other items | Randomly assigned `light` or `medium` (seed 42); placed in Aisles 0–3 |

*Every product's initial `originalSlot` (sorted by StockCode) is verified 100% legal under these constraints.*

---

## 3. Warehouse Geometry & Routing Algorithms

### Physical Specifications:
* **Grid:** 6 aisles ($x = 3, 8, 13, 18, 23, 28$), 10 bays per aisle side ($z = 2.25 + 1.5 \cdot j$), 2 shelf levels ($0 = \text{low}, 1 = \text{high}$). Total: **240 slots** (IDs 0–239).
* **Cross-Aisles:** Front cross-aisle at $z = 0$, back cross-aisle at $z = 18$. Dock at $(x=0, z=0)$.
* **Distance Metric:** Strict aisle Manhattan distance:
  $$\text{dist}(a, b) = \begin{cases} |z_a - z_b| & x_a = x_b \\ \min(z_a + z_b, (18 - z_a) + (18 - z_b)) + |x_a - x_b| & x_a \neq x_b \end{cases}$$

### Routing Methods:
1. **S-Shape (`sshape`):** Serpentine progression across visited aisles. Odd aisle counts enter and exit the final aisle from the front cross-aisle ($2 \cdot \max(z)$).
2. **Return (`return`):** In-and-out picking from the front cross-aisle for each visited aisle ($2 \cdot \sum \max(z_k)$).
3. **Largest-Gap (`largestgap`):** Identifies the largest gap between pick stops in each aisle and skips traversal across it ($2 \cdot (L - \text{gap})$).
4. **Optimal Bitmask DP TSP (`optimal`):** Exact $O(2^n \cdot n^2)$ dynamic programming traveling salesperson tour over the dock and pick coordinates for orders $\le 8$ items.
   * *Offline Verification:* Exact Python brute-force comparison verified on 50 real customer orders: **Matched on 50 of 50 orders (100.0%)**.

---

## 4. Optimization Heuristics

* **Baseline Optimizer (`baselineAssignment`):** Greedily assigns highest-frequency items to slots nearest the packing dock $(0,0)$ while respecting zone and shelf constraints.
* **Affinity Optimizer (`affinityAssignment`):** Blends dock proximity with top 50 co-occurrence pair groupings, followed by a 60-iteration greedy swap refinement pass.
* **Regret Metric (`regret`):** Quantifies misplaced inventory penalty:
  $$\text{regret} = \text{frequency} \times \max(0, \text{dist}(\text{dock}, \text{current}) - \text{dist}(\text{dock}, \text{baseline}))$$
* **Best Moves (`bestMoves`):** Evaluates true distance delta of candidate legal swaps using `evaluate`, highlighting top ROI moves for player hints.

---

## 5. Assumptions & Modeling Defaults

| Parameter | Default Value | Justification |
| :--- | :--- | :--- |
| **Picker Walking Speed** | $1.2\text{ m/s}$ | Industry standard picker transit velocity. |
| **Pick Time Per SKU** | $12\text{ seconds}$ | Includes scanning, verification, and placement into cart. |
| **Warehouse Wage** | $\text{₹}150 / \text{hour}$ | Standard Indian logistics warehouse associate compensation. |
| **Relocation Cost** | $\text{₹}250 / \text{move}$ | Physical re-slotting, re-labeling, and audit labor per SKU. |
| **Working Days** | $26\text{ days / month}$ | Standard 6-day operating workweek. |

---

## 6. Official Verified Metrics for the Pitch Deck (Slide 6)

### Base Month Benchmark (March 2011, 1,119 Orders):
* **Original Unoptimized Walking:** **$82,235\text{ meters}$**
* **Baseline Optimized Walking:** **$75,146\text{ meters}$**
* **Direct Distance Reduction:** **$7,089\text{ meters saved}$** (**$8.6\%$** reduction)
* **Affinity Optimized Walking:** **$73,774.5\text{ meters}$** (**$10.3\%$** reduction)

### Full 12-Month Annual Simulation (14,373 Customer Orders):
* **Original Total Walking:** **$1,007.6\text{ km}$**
* **Optimized Total Walking:** **$947.0\text{ km}$**
* **Net Annual Walking Saved:** **$60.7\text{ km}$** of picker foot travel eliminated!
* **Annual Gross Labor Savings:** **$\text{₹}54,775$**
* **Net First-Year Savings:** **$\text{₹}43,525$** (after initial 45-slot relocation cost of $\text{₹}11,250$)
* **Strategic "Is It Worth It?" Verdict:**
  > *"Static Optimization Wins: Monthly re-slotting relocation costs outweigh extra travel savings."*

---

## 7. Honest Technical Limitations

1. **Single Picker Congestion:** Pathing assumes an unimpeded picker; simultaneous aisle congestion between multiple pickers is approximated through average pick time buffers rather than real-time collision resolution.
2. **Deterministic Cart Capacity:** The model assumes standard cart capacity sufficient to complete single-order picking trips without mid-route dock returns.
3. **Elevation Transit:** Vertical picking between Level 0 and Level 1 assumes ergonomic access; climbing or ladder transit time is treated as negligible compared to aisle travel.
