/**
 * Central Export for Warehouse Optimization Engine
 * Conforms 100% with docs/CONTRACTS.md
 */

export { slotPoint, dist, dockToSlot } from './geometry.js';
export { routeFor } from './routing.js';
export { evaluate } from './evaluate.js';
export {
  originalAssignment,
  isLegal,
  baselineAssignment,
  affinityAssignment,
  regret,
  bestMoves
} from './optimizers.js';
export {
  costSummary,
  compareMethods,
  seasonRun,
  yearSummary
} from './cost.js';
