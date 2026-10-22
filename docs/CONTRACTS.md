# Shelf Shuffle — Team Contracts

## Team Responsibilities

- Person A: `src/scene/`
- Person B: `data-pipeline/`, `src/engine/`, `tests/`, `public/data/`
- Person C: `src/ui/`, `src/game/`, `index.html`, `style.css`,
  `src/main.js`, `src/state.js`, `README.md`, `DEV_LOG.md`, `docs/`

## Warehouse Geometry

- 6 aisles.
- Racks on both sides of each aisle.
- 10 bays per side and 2 shelf levels.
- 240 slots, identified by IDs 0–239.
- Aisle length: 18 metres.
- Aisle x positions: 3, 8, 13, 18, 23, 28.
- Dock coordinates: (0, 0).
- Walking speed: 1.2 m/s.
- Pick time: 12 seconds per item.
- Hazard zone: aisle 5.
- Fragile zone: aisle 4.

## Data Contract

Person B supplies the following files under `public/data/`:

- `layout.json`
- `products.json`
- `orders_YYYY-MM.json`
- `orders_base.json`
- `cooccurrence.json`
- `monthly_demand.json`

Mock data belongs under `public/data/mock/`.

An assignment is represented as an array:

`assignment[productId] = slotId`

## Engine Contract

Person B provides these functions:

- `evaluate(layout, assignment, orders, method)`
- `routeFor(layout, slotIds, method)`
- `originalAssignment(products)`
- `baselineAssignment(layout, products)`
- `affinityAssignment(layout, products, pairs, rules)`
- `regret(layout, assignment, products)`
- `isLegal(layout, product, slotId, rules)`
- `bestMoves(layout, assignment, products, orders, n, rules)`
- `costSummary(...)`
- `compareMethods(layout, assignment, orders)`
- `seasonRun(...)`
- `yearSummary(...)`

The engine owns all optimization calculations and reported distance metrics.

## Scene Contract

Person A provides:

- `initScene(container, layout)`
- `setAssignment(assignment, products)`
- `setColorMode(mode, data)`
- `playOrders(routes, options)`
- `stopReplay()`
- `on('slot-click', callback)`
- `on('swap-request', callback)`
- `on('replay-progress', callback)`
- `highlightSlots(slotIds, type)`
- `setCameraPreset(preset)`

## Integration Rules

- Each person works primarily within their assigned directories.
- Communicate before modifying another person's files.
- Agree on API changes before integrating dependent code.
- Use mock data until real data is available.
- Every displayed distance must come from the engine.
- Commit frequently and pull with rebase before pushing.
- Never fabricate evaluation results.
