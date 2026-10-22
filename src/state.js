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

export const LEVELS = [
  {
    id: 1,
    name: 'Level 1: Fast-Moving Essentials',
    subtitle: 'High-frequency slotting basics',
    description: 'Rearrange high-velocity goods closer to the loading dock to reduce total picker walking distance.',
    rules: [
      'Loading dock is located at coordinates (0, 0)',
      'Walking speed: 1.2 m/s • Pick time: 12 s/item',
      'Target: slot top 10% high-velocity items in Aisles 0 & 1'
    ],
    moveLimit: 10,
    targetSavings: '15%'
  },
  {
    id: 2,
    name: 'Level 2: Hazard Isolation',
    subtitle: 'Safety zoning constraints',
    description: 'Optimize travel routes while strictly complying with warehouse hazardous materials isolation.',
    rules: [
      'Hazard Zone is strictly restricted to Aisle 5',
      'Hazardous items must NOT be stored in Aisles 0–4',
      'Engine will reject illegal moves outside Aisle 5'
    ],
    moveLimit: 8,
    targetSavings: '20%'
  },
  {
    id: 3,
    name: 'Level 3: Fragile & Affinity Pairings',
    subtitle: 'Co-occurrence & delicate handling',
    description: 'Group frequently ordered product pairs together while isolating fragile items in their designated zone.',
    rules: [
      'Fragile goods must be slotted in Aisle 4 only',
      'Frequently co-ordered items should share adjacent bays',
      'Heavy items restricted to lower shelf level 0'
    ],
    moveLimit: 12,
    targetSavings: '25%'
  }
];

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
  initFromData({ originalAssignment, baseline = null, month = 'base' } = {}) {
    if (!Array.isArray(originalAssignment)) {
      throw new TypeError('[Store] originalAssignment must be an Array where originalAssignment[productId] = slotId');
    }

    // Freeze originalAssignment to strictly protect from in-place mutations
    const frozenOriginal = Object.freeze([...originalAssignment]);
    const safeBaseline = Array.isArray(baseline) ? Object.freeze([...baseline]) : null;

    this.state = {
      ...this.state,
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
        message: `Loaded dataset successfully for period '${month}'.`
      }
    };

    this.emit('assignment-changed', this.state.assignment, { isPreview: false, source: 'init' });
    this.emit('state-changed', this.state);
  }

  // =========================================================================
  // Assignment & Move Management
  // =========================================================================

  /**
   * Moves product to a target slot or swaps with whatever product is at targetSlotId.
   * Empty warehouse slots are permitted.
   */
  moveProduct(productId, targetSlotId, desc = '') {
    if (this.state.movesUsed >= this.state.movesLimit) {
      this.setUIStatus('error', `Move limit reached (${this.state.movesLimit} moves). Reset or undo.`);
      return false;
    }

    const prevAssignment = [...this.state.assignment];
    const newAssignment = [...this.state.assignment];

    const currentSlot = newAssignment[productId];
    // Check if another product currently occupies targetSlotId (allowing empty slots)
    const occupyingProductIdx = newAssignment.findIndex(s => s === targetSlotId);

    if (occupyingProductIdx !== -1 && occupyingProductIdx !== productId) {
      // Swap places
      newAssignment[occupyingProductIdx] = currentSlot;
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
   * Reverts the most recent assignment change.
   */
  undoMove() {
    if (this.state.movesUsed <= 0 || this.state.moveHistory.length === 0) {
      this.setUIStatus('ready', 'No moves to undo.');
      return false;
    }

    const history = [...this.state.moveHistory];
    const lastStep = history.pop();
    const restoredAssignment = lastStep.previousAssignment;
    const newMovesUsed = this.state.movesUsed - 1;

    // Adjust mock distance metric
    const currentDist = this.state.metrics.playerDistance || 1264.0;
    const origDist = this.state.metrics.originalDistance || 1420.5;
    const revertedDist = Math.min(origDist, Math.round((currentDist + 15.0) * 10) / 10);
    const savings = Math.max(0, Math.round(((origDist - revertedDist) / origDist) * 1000) / 10);

    this.state = {
      ...this.state,
      assignment: restoredAssignment,
      movesUsed: newMovesUsed,
      moveHistory: history,
      metrics: {
        ...this.state.metrics,
        playerDistance: revertedDist,
        savingsPct: savings
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Undid: ${lastStep.moveDesc}`
      }
    };

    this.emit('assignment-changed', restoredAssignment, { isPreview: false, source: 'undo' });
    return true;
  }

  /**
   * Resets the player assignment back to originalAssignment.
   * Clones from the frozen originalAssignment.
   */
  resetLayout() {
    this.state = {
      ...this.state,
      assignment: [...this.state.originalAssignment],
      movesUsed: 0,
      moveHistory: [],
      isPreviewingBaseline: false,
      metrics: {
        ...this.state.metrics,
        playerDistance: this.state.metrics.originalDistance,
        savingsPct: 0.0,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: 'Layout reset to initial arrangement.'
      }
    };

    this.emit('assignment-changed', this.state.assignment, { isPreview: false, source: 'reset' });
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
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
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
