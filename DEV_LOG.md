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

Add dated entries for implementation decisions, tests,
integration issues, AI assistance and rejected approaches.

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
  - Added comprehensive JSDoc usage documentation and test verification suite.


