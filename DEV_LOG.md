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
