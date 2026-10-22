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

