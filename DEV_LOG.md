# Shelf Shuffle — Development Log

## Initial Setup

- Problem statement: NEXAI 2026, Problem Statement 4.2.
- Project: Shelf Shuffle — Warehouse Digital Twin.
- Frontend tooling: Vite, JavaScript and CSS.
- 3D visualisation: Three.js.
- Source control: Git and GitHub.
- Deployment target: Vercel.
- Team responsibilities: documented in `docs/CONTRACTS.md`.

## Initial Decisions

- Use a browser-based interactive warehouse simulation.
- Separate the scene, optimization engine, game rules and UI.
- Integrate mock datasets before switching to real datasets.
- Deploy early to identify hosting and build problems.
- Keep evaluation results grounded in actual engine output.

## Development Entries

### H+0:15 — Person B Initiation: Mocks, Test Framework, and Scaffolding
- Checked out working branch `feature/engine-pipeline`.
- Created handcrafted mock data files in `public/data/mock/`:
  - `layout.json`: 2-aisle layout with 40 slots, coordinates derived from official geometry formulas.
  - `products.json`: 10 realistic products with weight/fragility/hazard tags and valid baseline slots.
  - `orders_base.json` & `orders_2011-03.json`: 5 realistic multi-item customer orders.
  - `cooccurrence.json`: frequent product pairs.
  - `monthly_demand.json`: 12-month synthetic demand frequencies for all 10 products.
- Installed `vitest` as devDependency and configured `"test": "vitest run"` in `package.json`.
- Established project directory structure for Person B: `data-pipeline/`, `src/engine/`, `tests/`.
- Verified test runner passes successfully (`tests/engine.test.js`).

### H+1:00 — Phase B1: Real Data Pipeline & Layout Generation Complete
- Built automated downloader `data-pipeline/download.py` for UCI Online Retail II dataset (`data-raw/`).
- Converted 1,067,371 rows of Excel workbook to high-performance Parquet format (`data-raw/retail.parquet`, 6.9 MB).
- Implemented data cleaning pipeline (`data-pipeline/clean.py`):
  - Initial raw transactions: 1,067,371 rows.
  - Removed cancellations & adjustment invoices (`^\d{6}$`): 19,500 rows.
  - Filtered non-product StockCodes (`^\d{5}[A-Za-z]{0,2}$`): 4,878 rows.
  - Removed non-positive quantities and prices: 6,116 rows.
  - Final clean transactions: 1,036,877 rows.
- Selected 100 core products:
  - Top 70 by total annual pick frequency (distinct invoices).
  - Top 30 by November–December holiday uplift to power Level 5 peak season gameplay.
- Applied keyword synthetic classification:
  - Hazard: `CANDLE`, `T-LIGHT`, `TEALIGHT`, `MATCH`, `INCENSE` (assigned strictly to Aisle 5).
  - Fragile: `GLASS`, `CERAMIC`, `MUG`, `CUP`, `TEAPOT`, `PLATE`, `BOWL`, `VASE` (assigned strictly to Aisle 4).
  - Heavy: `TIN`, `JAR`, `BOX`, `BOTTLE`, `LANTERN`, `BUCKET`, `BASKET`, `FRAME` (assigned strictly to Level 0).
  - All 100 original slots validated 100% legal under warehouse constraints.
- Generated full production datasets in `public/data/`:
  - `layout.json`: Full 6-aisle, 240-slot grid with exact coordinates.
  - `products.json`: 100 products with metadata and legal `originalSlot`.
  - `orders_base.json`: 1,119 real orders from representative base month `2011-03`.
  - Monthly orders (`orders_YYYY-MM.json` for all 12 active months).
  - `cooccurrence.json`: Top 500 co-occurring product pairs.
  - `monthly_demand.json`: 12-month demand frequency matrix.
- Implemented and verified `src/engine/geometry.js` (symmetry, same-aisle, cross-aisle routing, dock distances) with 6 passing Vitest tests.
- Entire pipeline runs reproducibly via `python data-pipeline/build_json.py` in ~30 seconds.
