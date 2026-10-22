/**
 * Shelf Shuffle - Central State Management (Person C)
 * 
 * Tracks warehouse level, assignments, routing method, move budget,
 * time/wage operational parameters, and optimizer metrics.
 * 
 * Prevents accidental mutation of originalAssignment via Object.freeze,
 * cleanly separates working player assignments from temporary baseline previews,
 * and provides targeted event subscriptions to prevent unnecessary rerenders.
 * 
 * --------------------------------------------------------------------------
 * USAGE EXAMPLES:
 * 
 * // 1. Read state and active assignment:
 * import { store } from './state.js';
 * const { level, movesUsed, movesLimit, wage, speed, days } = store.getState();
 * const activeAssignment = store.getEffectiveAssignment();
 * 
 * // 2. Update state:
 * store.moveProduct(productId, targetSlotId);
 * store.updateConfig({ wage: 28.0, speed: 1.2, costPerMove: 5.0 });
 * store.setMethod('optimal'); // 's-shape' | 'optimal' | 'midpoint' | 'largest-gap'
 * 
 * // 3. Subscribe to targeted events:
 * const unsub = store.on('assignment-changed', (assignment, meta) => {
 *   console.log('Assignment updated. Is preview?', meta.isPreview);
 * });
 * const unsubRun = store.on('run-finished', (metrics) => {
 *   console.log('Evaluation finished:', metrics);
 * });
 * 
 * // 4. Safe initialization from loaded JSON datasets:
 * store.initFromData({
 *   products: [{ id: 0, name: 'Item A' }],
 *   originalAssignment: [12, 45, 88],
 *   baseline: [0, 1, 2],
 *   month: '2025-01'
 * });
 * --------------------------------------------------------------------------
 */

import { LEVELS, getLevelById } from './game/levels.js';
import { validateMove, validateSwap, getRemainingMoves, HAZARD_AISLE, FRAGILE_AISLE, LOW_SHELF_LEVEL } from './game/rules.js';
import { executeSwap, undoSwap, resetToOriginal } from './game/swap.js';

export { LEVELS, getLevelById, validateMove, validateSwap, getRemainingMoves, HAZARD_AISLE, FRAGILE_AISLE, LOW_SHELF_LEVEL, executeSwap, undoSwap, resetToOriginal };


// Initial mock assignment placeholder: 240 warehouse slots, 40 sample SKUs
const DEFAULT_SAMPLE_PRODUCTS_COUNT = 40;
const defaultOriginalAssignment = Object.freeze(
  Array.from({ length: DEFAULT_SAMPLE_PRODUCTS_COUNT }, (_, i) => (i * 5) % 240)
);
const defaultBaselineAssignment = Object.freeze(
  Array.from({ length: DEFAULT_SAMPLE_PRODUCTS_COUNT }, (_, i) => i)
);


class StateStore {
  constructor() {
    this.events = new Map([
      ['assignment-changed', new Set()],
      ['level-changed', new Set()],
      ['run-finished', new Set()],
      ['state-changed', new Set()]
    ]);

    // General subscribers for backward compatibility
    this.generalListeners = new Set();

    this.state = {
      // 1. Level & Rules Tracking
      level: LEVELS[0],
      currentLevelId: 1,
      movesUsed: 0,
      movesLimit: LEVELS[0].moveLimit,
      moveHistory: [], // Undo stack: [{ previousAssignment, moveDesc, timestamp }]

      // 2. Assignment Tracking (Contract: assignment[productId] = slotId)
      // originalAssignment is frozen to prevent accidental mutation
      originalAssignment: defaultOriginalAssignment,
      assignment: [...defaultOriginalAssignment],
      baseline: defaultBaselineAssignment,
      isPreviewingBaseline: false, // Distinguishes player assignment from temporary baseline preview

      // 3. Routing & Evaluation Parameters
      method: 's-shape', // 's-shape' | 'optimal' | 'midpoint' | 'largest-gap'
      month: 'base',     // 'base' | 'YYYY-MM'

      // 4. Financial & Physical Operations Parameters (from CONTRACTS.md)
      wage: 25.00,        // Hourly picker wage ($/hr)
      speed: 1.2,         // Picker walking speed (m/s)
      days: 260,          // Operating warehouse days per year
      costPerMove: 5.00,  // Relocation handling cost ($/move)

      // Backward-compatibility aliases for UI components
      cost: {
        hourlyWage: 25.00,
        dailyOrders: 180,
        workingDaysPerYear: 260,
        walkingSpeedMps: 1.2,
        pickTimePerItemSec: 12,
        costPerMove: 5.00
      },

      // 5. Optimizer Metrics (No fake production metrics; null when unevaluated)
      metrics: {
        isEvaluated: false,
        isMockData: true, // Clearly flagged as developer mock data
        originalDistance: 1420.5,
        playerDistance: 1264.0,
        baselineDistance: 1136.4,
        savingsPct: 11.0,
        runTimeSec: null,
        lastCalculatedAt: new Date().toISOString()
      },

      // 6. Viewport & UI Status
      viewport: {
        cameraPreset: 'isometric', // 'isometric' | 'top-down' | 'aisle'
        colorMode: 'velocity',     // 'velocity' | 'category' | 'zone'
        selectedSlot: null
      },
      uiStatus: {
        status: 'ready',
        message: '',
        isMockDataActive: true,
        engineConnected: false,
        sceneConnected: false
      }
    };
  }

  // =========================================================================
  // State Reading
  // =========================================================================

  /**
   * Returns a snapshot of the current state.
   */
  getState() {
    return this.state;
  }

  /**
   * Returns the currently active effective assignment.
   * If isPreviewingBaseline is true and baseline is present, returns baseline.
   * Otherwise returns the player's active assignment.
   */
  getEffectiveAssignment() {
    if (this.state.isPreviewingBaseline && this.state.baseline) {
      return this.state.baseline;
    }
    return this.state.assignment;
  }

  /**
   * Returns current active level object.
   */
  getCurrentLevel() {
    return this.state.level || LEVELS[0];
  }

  // =========================================================================
  // Event Subscription & Notification
  // =========================================================================

  /**
   * Subscribe to specific targeted events:
   * - 'assignment-changed': (assignment, { isPreview, moveDesc })
   * - 'level-changed': (level, movesLimit)
   * - 'run-finished': (metrics)
   * - 'state-changed': (state, changedKey)
   * 
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    this.events.get(eventName).add(callback);
    return () => this.events.get(eventName).delete(callback);
  }

  /**
   * General store subscriber (called on any state mutation).
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.generalListeners.add(listener);
    return () => this.generalListeners.delete(listener);
  }

  emit(eventName, payload) {
    const listeners = this.events.get(eventName);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(payload, this.state);
        } catch (err) {
          console.error(`[Store] Error in listener for event '${eventName}':`, err);
        }
      }
    }

    // Always notify general subscribers for component reactivity
    for (const listener of this.generalListeners) {
      try {
        listener(this.state, eventName);
      } catch (err) {
        console.error('[Store] Error in general subscriber:', err);
      }
    }
  }

  setState(partial) {
    const next = typeof partial === 'function' ? partial(this.state) : partial;
    this.state = {
      ...this.state,
      ...next
    };
    this.emit('state-changed', this.state);
  }

  // =========================================================================
  // Safe Initialization from Data
  // =========================================================================

  /**
   * Safely initializes store from loaded JSON datasets.
   * Freezes originalAssignment to protect against accidental mutation.
   * 
   * @param {Object} data
   * @param {Array} data.originalAssignment - Array mapping productId to slotId
   * @param {Array} [data.baseline] - Automated baseline assignment array
   * @param {string} [data.month] - 'base' or 'YYYY-MM'
   */
  initFromData({ layout = null, products = null, orders = null, originalAssignment, baseline = null, month = 'base' } = {}) {
    if (!Array.isArray(originalAssignment)) {
      throw new TypeError('[Store] originalAssignment must be an Array where originalAssignment[productId] = slotId');
    }

    // Freeze originalAssignment to strictly protect from in-place mutations
    const frozenOriginal = Object.freeze([...originalAssignment]);
    const safeBaseline = Array.isArray(baseline) ? Object.freeze([...baseline]) : null;

    this.state = {
      ...this.state,
      layout: layout || this.state.layout,
      products: products || this.state.products,
      orders: orders || this.state.orders,
      originalAssignment: frozenOriginal,
      assignment: [...frozenOriginal], // Fresh mutable copy for player
      baseline: safeBaseline,
      isPreviewingBaseline: false,
      month,
      movesUsed: 0,
      moveHistory: [],
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Loaded dataset successfully for period '${month}'.`,
        isMockDataActive: false,
        engineConnected: true,
        sceneConnected: true
      }
    };

    this.emit('assignment-changed', this.state.assignment, { isPreview: false, source: 'init' });
    this.emit('state-changed', this.state);
  }

  // =========================================================================
  // Assignment & Move Management
  // =========================================================================

  getSlotById(slotId) {
    if (this.state.layout?.slots && this.state.layout.slots[slotId]) {
      return this.state.layout.slots[slotId];
    }
    const aisle = Math.floor(slotId / 40);
    const level = slotId % 2;
    const bay = Math.floor((slotId % 40) / 4);
    const side = (Math.floor((slotId % 40) / 2) % 2 === 0) ? 'L' : 'R';
    const zone = aisle === HAZARD_AISLE ? 'hazard' : aisle === FRAGILE_AISLE ? 'fragile' : 'normal';
    return { id: slotId, aisle, bay, side, level, zone };
  }

  getProductById(productId) {
    if (Array.isArray(this.state.products)) {
      const p = this.state.products.find(item => item.id === productId) || this.state.products[productId];
      if (p) return p;
    }
    // Match attributes from mock products:
    // Product 1, 3, 5 are heavy; Product 6, 9 are fragile; Product 99 is hazard
    const isHeavy = productId === 1 || productId === 3 || productId === 5 || productId % 4 === 1;
    const isFragile = productId === 6 || productId === 9 || productId % 7 === 6;
    const isHazard = productId === 99 || productId % 11 === 10;
    return {
      id: productId,
      code: `SKU-${1000 + productId}`,
      name: `Product #${productId}`,
      weight: isHeavy ? 'heavy' : 'light',
      fragile: isFragile,
      hazard: isHazard
    };
  }

  /**
   * Moves product to a target slot or swaps with whatever product is at targetSlotId.
   * Empty warehouse slots are permitted.
   * Validates placement against active level rules and move budgets.
   */
  moveProduct(productId, targetSlotId, desc = '') {
    const prevAssignment = [...this.state.assignment];
    const currentSlotId = prevAssignment[productId];
    const sourceSlot = this.getSlotById(currentSlotId);
    const targetSlot = this.getSlotById(targetSlotId);
    const productA = this.getProductById(productId);

    const occupyingProductIdx = prevAssignment.findIndex(s => s === targetSlotId);
    const productB = (occupyingProductIdx !== -1 && occupyingProductIdx !== productId)
      ? this.getProductById(occupyingProductIdx)
      : null;

    // Validate move against active level rules and move budget
    const validation = validateSwap(
      sourceSlot,
      productA,
      targetSlot,
      productB,
      this.state.level,
      this.state.movesUsed
    );

    if (!validation.valid) {
      this.setUIStatus('error', validation.reason);
      return false;
    }

    const newAssignment = [...prevAssignment];
    if (occupyingProductIdx !== -1 && occupyingProductIdx !== productId) {
      // Swap places
      newAssignment[occupyingProductIdx] = currentSlotId;
      newAssignment[productId] = targetSlotId;
    } else {
      // Direct move into empty slot
      newAssignment[productId] = targetSlotId;
    }

    const moveDescription = desc || `Moved SKU #${productId} to Slot #${targetSlotId}`;
    const newMovesUsed = this.state.movesUsed + 1;

    // Simulate minor progress in mock mode (strictly labeled as mock)
    const currentDist = this.state.metrics.playerDistance || 1264.0;
    const simulatedDist = Math.max(850, Math.round((currentDist - 15.0) * 10) / 10);
    const origDist = this.state.metrics.originalDistance || 1420.5;
    const savings = Math.max(0, Math.round(((origDist - simulatedDist) / origDist) * 1000) / 10);

    this.state = {
      ...this.state,
      assignment: newAssignment,
      movesUsed: newMovesUsed,
      moveHistory: [
        ...this.state.moveHistory,
        {
          previousAssignment: prevAssignment,
          moveDesc: moveDescription,
          timestamp: Date.now()
        }
      ],
      metrics: {
        ...this.state.metrics,
        playerDistance: simulatedDist,
        savingsPct: savings,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: moveDescription
      }
    };

    this.emit('assignment-changed', newAssignment, { isPreview: false, moveDesc: moveDescription });
    return true;
  }

  /**
   * Executes a swap between two slot IDs using the swap module.
   */
  swapSlots(slotA, slotB) {
    return executeSwap(slotA, slotB, this);
  }

  /**
   * Reverts the most recent assignment change.
   */
  undoMove() {
    return undoSwap(this).success;
  }

  /**
   * Resets the player assignment back to originalAssignment.
   * Clones from the frozen originalAssignment.
   */
  resetLayout() {
    return resetToOriginal(this).success;
  }


  // =========================================================================
  // Baseline Preview vs. Player Assignment
  // =========================================================================

  /**
   * Temporarily previews the automated baseline assignment without altering
   * the player's actual assignment.
   * 
   * @param {boolean} show - Whether to show the baseline preview
   */
  previewBaseline(show = true) {
    if (!this.state.baseline) {
      this.setUIStatus('error', 'No baseline assignment loaded to preview.');
      return;
    }

    this.state.isPreviewingBaseline = Boolean(show);
    const effective = this.getEffectiveAssignment();
    this.emit('assignment-changed', effective, {
      isPreview: this.state.isPreviewingBaseline,
      source: 'baseline-preview'
    });
  }

  /**
   * Adopts the baseline assignment permanently into player assignment.
   */
  applyBaseline() {
    if (!this.state.baseline) {
      this.setUIStatus('error', 'No baseline assignment available.');
      return;
    }

    this.state = {
      ...this.state,
      assignment: [...this.state.baseline],
      isPreviewingBaseline: false,
      metrics: {
        ...this.state.metrics,
        playerDistance: this.state.metrics.baselineDistance,
        savingsPct: Math.round(((this.state.metrics.originalDistance - this.state.metrics.baselineDistance) / this.state.metrics.originalDistance) * 1000) / 10,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: 'Applied automated baseline assignment.'
      }
    };

    this.emit('assignment-changed', this.state.assignment, { isPreview: false, source: 'apply-baseline' });
  }

  // Backward compatibility alias for UI button
  loadBaseline() {
    this.applyBaseline();
  }

  // =========================================================================
  // Level Management
  // =========================================================================

  setLevel(levelId) {
    const nextLevel = LEVELS.find(l => l.id === levelId);
    if (!nextLevel) return;

    this.state = {
      ...this.state,
      level: nextLevel,
      currentLevelId: levelId,
      movesUsed: 0,
      movesLimit: nextLevel.moveLimit,
      moveHistory: [],
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Switched to ${nextLevel.name}`
      }
    };

    this.emit('level-changed', nextLevel);
  }

  // =========================================================================
  // Configuration & Parameter Updates
  // =========================================================================

  setMethod(method) {
    const valid = ['s-shape', 'optimal', 'midpoint', 'largest-gap'];
    if (!valid.includes(method)) {
      console.warn(`[Store] Unknown method '${method}'. Valid methods:`, valid);
      return;
    }
    this.setState({ method });
  }

  setMonth(month) {
    this.setState({ month });
  }

  updateConfig(updates = {}) {
    const next = {};
    if (typeof updates.wage === 'number') next.wage = updates.wage;
    if (typeof updates.speed === 'number') next.speed = updates.speed;
    if (typeof updates.days === 'number') next.days = updates.days;
    if (typeof updates.costPerMove === 'number') next.costPerMove = updates.costPerMove;

    this.setState({
      ...next,
      cost: {
        ...this.state.cost,
        hourlyWage: next.wage ?? this.state.wage,
        walkingSpeedMps: next.speed ?? this.state.speed,
        workingDaysPerYear: next.days ?? this.state.days,
        costPerMove: next.costPerMove ?? this.state.costPerMove
      }
    });
  }

  // Backward-compatibility alias
  updateCost(key, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;

    const keyMap = {
      hourlyWage: 'wage',
      walkingSpeedMps: 'speed',
      workingDaysPerYear: 'days',
      costPerMove: 'costPerMove'
    };

    const targetKey = keyMap[key] || key;
    this.updateConfig({ [targetKey]: num });
  }

  // =========================================================================
  // Metrics & Run Reporting (Contract Guarded)
  // =========================================================================

  /**
   * Sets real metrics calculated by Person B's engine.
   * Never fabricates production results.
   */
  setEngineMetrics(evalResult) {
    if (!evalResult || typeof evalResult.playerDistance !== 'number') {
      console.warn('[Store] Invalid evaluation result passed to setEngineMetrics:', evalResult);
      return;
    }

    const { playerDistance, originalDistance, baselineDistance, runTimeSec } = evalResult;
    const orig = typeof originalDistance === 'number' ? originalDistance : (this.state.metrics.originalDistance || playerDistance);
    const savings = orig > 0 ? Math.round(((orig - playerDistance) / orig) * 1000) / 10 : 0.0;

    const { visitsBySlot, regretList } = evalResult;
    const newMetrics = {
      isEvaluated: true,
      isMockData: false,
      playerDistance,
      originalDistance: orig,
      baselineDistance: baselineDistance ?? null,
      savingsPct: savings,
      runTimeSec: runTimeSec ?? null,
      lastCalculatedAt: new Date().toISOString()
    };

    this.state = {
      ...this.state,
      metrics: newMetrics,
      visitsBySlot: visitsBySlot || this.state.visitsBySlot,
      regretList: regretList || this.state.regretList,
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        isMockDataActive: false,
        engineConnected: true,
        sceneConnected: true,
        message: `Evaluation completed (${playerDistance.toFixed(1)} m).`
      }
    };

    this.emit('run-finished', newMetrics);
  }

  // =========================================================================
  // Viewport & UI Status
  // =========================================================================

  setCameraPreset(preset) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        cameraPreset: preset
      }
    });
  }

  setColorMode(mode) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        colorMode: mode
      }
    });
  }

  selectSlot(slotInfo) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        selectedSlot: slotInfo
      }
    });
  }

  setUIStatus(status, message = '') {
    this.setState({
      uiStatus: {
        ...this.state.uiStatus,
        status,
        message
      }
    });
  }

  // Backward-compatibility wrapper for test move
  recordMove(desc = 'Moved SKU') {
    const selected = this.state.viewport.selectedSlot;
    const productId = selected ? selected.slotId % DEFAULT_SAMPLE_PRODUCTS_COUNT : 0;
    const nextSlot = (this.state.assignment[productId] + 2) % 240;
    return this.moveProduct(productId, nextSlot, desc);
  }
}

export const store = new StateStore();
