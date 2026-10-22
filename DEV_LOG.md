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

### Phase A1–A4: 3D Scene, Instanced Geometry, Animated Picker & Visuals (Person A)
- **InstancedMesh Migration**: Implemented 240 warehouse slots (6 aisles × 2 sides × 10 bays × 2 shelf levels) as a single `THREE.InstancedMesh` with dynamic `setColorAt` and pointer raycasting via `intersection.instanceId`. Clamped pixel ratio to 1.5 and turned off shadows to guarantee 60 FPS on integrated GPUs.
- **Warehouse Geometry**: Fixed aisle centre lines at `x = [3, 8, 13, 18, 23, 28]`, length 18m, dock at `(0, 0)`, front/back cross-aisles at `z = 0` and `z = 18`, and bay centers at `z = 2.25 + 1.5 * bay`.
- **Animated Picker & Ghost Replay**: Created low-poly picker avatar with fluorescent safety vest, helmet, and trolley cart in `src/scene/picker.js`. Built path follower traversing aisle centerlines at 1.2 m/s, with simulated 12-second pick pauses at target slots, target slot pulsing, and simultaneous semi-transparent ghost picker for baseline comparison.
- **Visualization Modes**: Implemented four dynamic modes:
  1. `default`: Color by product category (heavy, fragile, hazard, normal, empty).
  2. `zones`: Color by warehouse area (hazard aisle 5, fragile aisle 4, normal aisles 0–3).
  3. `heat`: 3-color normalized gradient (Blue → Yellow → Red) based on visit frequency.
  4. `regret`: Emissive pulsing glow on top displaced items with floating indicators.
- **Audio & Feedback**: Added offline zero-dependency Web Audio API synthesizer for slot select clicks, swap success chimes, illegal buzzers, and pick pings (muted by default with toggle).
- **Twin Verification**: Added honesty verification check matching scene distance to engine distance (< 0.5m threshold).

### H+0:15 — Person B Initiation: Mocks, Test Framework, and Scaffolding
- **Author:** Person B
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

### 2026-10-22 — Person C UI Shell Implementation
- **Author:** Person C
- **Completed:**
  - Implemented reactive game state store in `src/state.js` with level definitions, move budget, mock metrics, and subscription model.
  - Implemented desktop-first responsive UI shell (`src/ui/header.js`, `src/ui/levelNav.js`, `src/ui/viewport.js`, `src/ui/resultsPanel.js`, `src/ui/costPanel.js`, `src/ui/statusBanners.js`).
  - Added dark navy (`#080d1a`, `#0f172a`, `#182235`) and amber (`#f59e0b`, `#fbbf24`) styling with accessible contrast and focus rings in `src/style.css` and `style.css`.
  - Established stable `#scene-container` mount point with a clearly labeled Person A scene placeholder and 2D schematic fallback.
  - Built interactive cost and ROI calculator with real-time parameter sliders.
  - Wired main application entrypoint in `src/main.js` and updated `index.html` with semantic shell layout.
- **Contract Adherence:**
  - Preserved Person A (`src/scene/`) and Person B (`src/engine/`, `data-pipeline/`, `tests/`, `public/data/`) directories intact.
  - Labeled all preliminary metrics and projections with `[DEV MOCK DATA]` badges.
- **Build & Verification:**
  - `npm run build` succeeds cleanly with zero bundle errors.

### 2026-10-22 — State Management Architecture (Prompt 5)
- **Author:** Person C
- **Completed:**
  - Upgraded `src/state.js` to track all required core fields: `level`, `assignment`, `originalAssignment`, `baseline`, `method`, `movesUsed`, `movesLimit`, `month`, `wage`, `speed`, `days`, `costPerMove`.
  - Added strict immutability protection for `originalAssignment` using `Object.freeze` to prevent accidental in-place mutation.
  - Implemented `previewBaseline(show)` and `getEffectiveAssignment()` to clearly distinguish the working player assignment from temporary baseline previews without data corruption.
  - Added targeted event emitter system (`store.on('assignment-changed' | 'level-changed' | 'run-finished' | 'state-changed')`) preventing unnecessary full-page rerenders.
  - Implemented `initFromData()` for safe initialization from loaded JSON datasets.
  - Strictly avoided fake production metrics by enforcing `isMockData: true` / `isEvaluated: false` and contract validation in `setEngineMetrics()`.
- **Build & Verification:**
  - `npm run build` succeeds cleanly with zero bundle errors.

### 2026-10-22 — Level Configurations & Validation Rules Implementation
- **Author:** Person C
- **Completed:**
  - Implemented the five agreed levels in `src/game/levels.js`:
    - Level 1: Free Swaps (unrestricted).
    - Level 2: Heavy on Low Shelves (Level 0 bottom shelf restriction).
    - Level 3: Level 2 restriction + 10-move budget.
    - Level 4: Level 2 restriction + Hazard Zone (Aisle 5) + Fragile Zone (Aisle 4) + 15-move budget.
    - Level 5: Seasonal Demand with 5 moves/month allocation.
  - Implemented move validation, swap validation, and remaining-moves tracking in `src/game/rules.js` with human-readable error messages.
  - Added unit test suite in `src/game/rules.test.js` validating allowed moves, illegal moves, last permitted moves, and over-limit rejections.
  - Updated `src/state.js`, `src/ui/levelNav.js`, and `src/ui/resultsPanel.js` with active level rules and remaining-move indicators.
  - Verified contract adherence: Hazard zone is Aisle 5 and Fragile zone is Aisle 4. Reported mock layout mismatch from Person B's branch for team alignment.
- **Verification:**
  - `node src/game/rules.test.js`: All 20+ assertions passed.
  - `npm run build`: Succeeded in 142ms.

### 2026-10-22 — Slot Swap Interaction & Undo Stack Implementation (Prompt 6)
- **Author:** Person C
- **Completed:**
  - Created `src/game/swap.js` implementing complete slot swap interaction logic:
    - Resolves products assigned to slots using `assignment[productId] = slotId`.
    - Handles two occupied slots (mutual product swap).
    - Handles one occupied slot and one empty slot (product transfer into empty slot).
    - Rejects two empty slots and self-swaps (`slotA === slotB`), leaving state 100% unchanged.
    - Validates destination legality for every moved product under active level rules (Level 1–5).
    - Respects optional Person B engine legality check via `verifyWithEngine()`.
    - Updates assignment, increments `movesUsed`, pushes prior assignment snapshot to undo stack, and emits `'assignment-changed'` event only upon successful validation.
    - Implemented `undoSwap()` restoring previous layout, decrementing move counter, and notifying listeners.
    - Implemented `resetToOriginal()` returning to `originalAssignment` while preserving strict `Object.freeze` immutability.
    - Provided `MockSceneAdapter` and `attachSceneSwapListener()` to emulate and handle Person A 3D scene `'swap-request'` events.
  - Wired slot swap interactions into `src/state.js` (`store.swapSlots`, `store.undoMove`, `store.resetLayout`).
  - Connected 2D warehouse schematic slot clicks in `src/ui/viewport.js` so users can click two slots to execute swaps interactively.
  - Added unit test suites in `src/game/swap.test.js` covering all 10 edge cases and integrated with Vitest.
- **Verification:**
  - `npm test`: All 17 tests passed across `tests/engine.test.js`, `src/game/rules.test.js`, and `src/game/swap.test.js`.
  - `npm run build`: Succeeded in 213ms without bundle errors.
