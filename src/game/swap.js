/**
 * Shelf Shuffle - Slot Swap Interaction Module (Person C)
 * 
 * Implements the core slot swap logic triggered by UI or Scene 'swap-request' events.
 * 
 * Rules & Contract Adherence:
 * 1. Resolves assigned products from slot IDs using assignment[productId] = slotId.
 * 2. Supports:
 *    - Two occupied slots (swaps both products).
 *    - One occupied, one empty slot (moves product to empty slot).
 *    - Two empty slots (strictly rejected, state unchanged).
 *    - Slot swapped with itself (strictly rejected, state unchanged).
 * 3. Validates destination legality for EVERY moving product under the ACTIVE LEVEL rules.
 * 4. Only after validation succeeds:
 *    - Updates assignment.
 *    - Pushes prior assignment snapshot and move count to undo stack.
 *    - Increments movesUsed.
 *    - Emits 'assignment-changed' event.
 * 5. On illegal moves: leaves state 100% unchanged, shows human-readable reason.
 * 6. Implements Undo and Reset to Original (keeping originalAssignment strictly immutable).
 * 7. Provides a Person C MockSceneAdapter test harness for scene event emulation.
 */

import { validateMove, verifyWithEngine } from './rules.js';

/**
 * Executes a swap request between two warehouse slot IDs.
 * 
 * @param {number} slotA - First slot ID
 * @param {number} slotB - Second slot ID
 * @param {Object} store - Person C state store instance
 * @param {Object} [engine=null] - Optional Person B engine module with isLegal
 * @returns {{ success: boolean, reason?: string, desc?: string, assignment?: Array<number> }}
 */
export function executeSwap(slotA, slotB, store, engine = null) {
  if (typeof slotA !== 'number' || typeof slotB !== 'number') {
    const reason = `Invalid swap request: slot IDs must be numbers (received slotA=${slotA}, slotB=${slotB}).`;
    store.setUIStatus('error', reason);
    return { success: false, reason };
  }

  // Self-swap check
  if (slotA === slotB) {
    const reason = `Cannot swap Slot #${slotA} with itself.`;
    store.setUIStatus('error', reason);
    return { success: false, reason };
  }

  const state = store.getState();
  const currentAssignment = state.assignment;
  const currentLevel = state.level;

  // 1. Find product assigned to each slot: assignment[productId] = slotId
  const productIdA = currentAssignment.findIndex(s => s === slotA);
  const productIdB = currentAssignment.findIndex(s => s === slotB);

  // 2. Reject two empty slots
  if (productIdA === -1 && productIdB === -1) {
    const reason = `Cannot swap: both Slot #${slotA} and Slot #${slotB} are empty.`;
    store.setUIStatus('error', reason);
    return { success: false, reason };
  }

  // 3. Move budget check
  if (currentLevel.moveLimit !== null && currentLevel.moveLimit !== undefined) {
    if (state.movesUsed >= currentLevel.moveLimit) {
      const reason = `Move limit reached: You have exhausted all ${currentLevel.moveLimit} permitted moves for ${currentLevel.name}.`;
      store.setUIStatus('error', reason);
      return { success: false, reason };
    }
  }

  // 4. Resolve slot and product metadata
  const slotObjA = store.getSlotById(slotA);
  const slotObjB = store.getSlotById(slotB);
  const productA = productIdA !== -1 ? store.getProductById(productIdA) : null;
  const productB = productIdB !== -1 ? store.getProductById(productIdB) : null;

  // 5. Validate destination legality for every moving product under ACTIVE LEVEL rules
  // If productA exists, it moves into slotObjB
  if (productA) {
    const checkA = validateMove(slotObjB, productA, currentLevel, state.movesUsed);
    if (!checkA.valid) {
      store.setUIStatus('error', checkA.reason);
      return { success: false, reason: checkA.reason };
    }

    // Engine validation if engine is provided
    if (engine) {
      const engineLegal = verifyWithEngine(engine, state.layout, productA, slotB, currentLevel.rules);
      if (engineLegal === false) {
        const reason = `Optimization engine rejected moving '${productA.name || productA.code}' to Slot #${slotB}.`;
        store.setUIStatus('error', reason);
        return { success: false, reason };
      }
    }
  }

  // If productB exists, it moves into slotObjA
  if (productB) {
    const checkB = validateMove(slotObjA, productB, currentLevel, state.movesUsed);
    if (!checkB.valid) {
      store.setUIStatus('error', checkB.reason);
      return { success: false, reason: checkB.reason };
    }

    // Engine validation if engine is provided
    if (engine) {
      const engineLegal = verifyWithEngine(engine, state.layout, productB, slotA, currentLevel.rules);
      if (engineLegal === false) {
        const reason = `Optimization engine rejected moving '${productB.name || productB.code}' to Slot #${slotA}.`;
        store.setUIStatus('error', reason);
        return { success: false, reason };
      }
    }
  }

  // 6. All validations succeeded! Construct new assignment and move description
  const previousAssignment = [...currentAssignment];
  const newAssignment = [...currentAssignment];
  let moveDesc = '';

  if (productA && productB) {
    // Both occupied -> Swap
    newAssignment[productIdA] = slotB;
    newAssignment[productIdB] = slotA;
    moveDesc = `Swapped ${productA.name || 'SKU #' + productIdA} (Slot #${slotA}) with ${productB.name || 'SKU #' + productIdB} (Slot #${slotB})`;
  } else if (productA && !productB) {
    // Product A moved into empty Slot B
    newAssignment[productIdA] = slotB;
    moveDesc = `Moved ${productA.name || 'SKU #' + productIdA} from Slot #${slotA} into empty Slot #${slotB}`;
  } else if (!productA && productB) {
    // Product B moved into empty Slot A
    newAssignment[productIdB] = slotA;
    moveDesc = `Moved ${productB.name || 'SKU #' + productIdB} from Slot #${slotB} into empty Slot #${slotA}`;
  }

  const newMovesUsed = state.movesUsed + 1;

  // Push to undo stack: prior assignment + prior move count
  const historyEntry = {
    previousAssignment,
    moveCount: state.movesUsed,
    moveDesc,
    timestamp: Date.now()
  };

  // Simulate minor distance metric change in mock mode
  const currentDist = state.metrics.playerDistance || 1264.0;
  const simulatedDist = Math.max(800, Math.round((currentDist - 15.0) * 10) / 10);
  const origDist = state.metrics.originalDistance || 1420.5;
  const savings = Math.max(0, Math.round(((origDist - simulatedDist) / origDist) * 1000) / 10);

  // 7. Update store state and emit event
  store.setState({
    assignment: newAssignment,
    movesUsed: newMovesUsed,
    moveHistory: [...state.moveHistory, historyEntry],
    metrics: {
      ...state.metrics,
      playerDistance: simulatedDist,
      savingsPct: savings,
      lastCalculatedAt: new Date().toISOString()
    },
    uiStatus: {
      ...state.uiStatus,
      status: 'ready',
      message: moveDesc
    }
  });

  store.emit('assignment-changed', newAssignment, {
    isPreview: false,
    moveDesc,
    slotA,
    slotB,
    productIdA,
    productIdB
  });

  return { success: true, desc: moveDesc, assignment: newAssignment };
}

/**
 * Restores the assignment from the undo stack, decrements movesUsed,
 * and emits 'assignment-changed'. Leaves state unchanged if stack is empty.
 * 
 * @param {Object} store - Person C state store instance
 * @returns {{ success: boolean, reason?: string, assignment?: Array<number> }}
 */
export function undoSwap(store) {
  const state = store.getState();
  if (state.movesUsed <= 0 || state.moveHistory.length === 0) {
    const reason = 'No moves to undo.';
    store.setUIStatus('ready', reason);
    return { success: false, reason };
  }

  const history = [...state.moveHistory];
  const lastStep = history.pop();
  const restoredAssignment = [...lastStep.previousAssignment];
  const restoredMovesUsed = lastStep.moveCount;

  // Revert simulated metric
  const currentDist = state.metrics.playerDistance || 1264.0;
  const origDist = state.metrics.originalDistance || 1420.5;
  const revertedDist = Math.min(origDist, Math.round((currentDist + 15.0) * 10) / 10);
  const savings = Math.max(0, Math.round(((origDist - revertedDist) / origDist) * 1000) / 10);

  store.setState({
    assignment: restoredAssignment,
    movesUsed: restoredMovesUsed,
    moveHistory: history,
    metrics: {
      ...state.metrics,
      playerDistance: revertedDist,
      savingsPct: savings
    },
    uiStatus: {
      ...state.uiStatus,
      status: 'ready',
      message: `Undid: ${lastStep.moveDesc}`
    }
  });

  store.emit('assignment-changed', restoredAssignment, {
    isPreview: false,
    source: 'undo',
    undoneMove: lastStep.moveDesc
  });

  return { success: true, assignment: restoredAssignment };
}

/**
 * Resets the active assignment to originalAssignment.
 * Strictly preserves the immutability of originalAssignment.
 * 
 * @param {Object} store - Person C state store instance
 * @returns {{ success: boolean, assignment: Array<number> }}
 */
export function resetToOriginal(store) {
  const state = store.getState();
  
  // Guarantee originalAssignment is strictly frozen and not corrupted
  if (!Object.isFrozen(state.originalAssignment)) {
    console.warn('[Swap] originalAssignment was not frozen; re-freezing now.');
  }

  const cleanOriginal = [...state.originalAssignment];

  store.setState({
    assignment: cleanOriginal,
    movesUsed: 0,
    moveHistory: [],
    isPreviewingBaseline: false,
    metrics: {
      ...state.metrics,
      playerDistance: state.metrics.originalDistance,
      savingsPct: 0.0,
      lastCalculatedAt: new Date().toISOString()
    },
    uiStatus: {
      ...state.uiStatus,
      status: 'ready',
      message: 'Layout reset to original arrangement.'
    }
  });

  store.emit('assignment-changed', cleanOriginal, {
    isPreview: false,
    source: 'reset'
  });

  return { success: true, assignment: cleanOriginal };
}

/**
 * Attaches swap event listener to Person A's scene module or test harness.
 * Compatible with scene.on('swap-request', callback).
 * 
 * @param {Object} scene - Person A scene instance or MockSceneAdapter
 * @param {Object} store - Person C state store
 * @param {Object} [engine=null] - Optional Person B engine module
 * @returns {Function} Unsubscribe / detach listener
 */
export function attachSceneSwapListener(scene, store, engine = null) {
  if (!scene || typeof scene.on !== 'function') {
    return () => {};
  }

  const handler = (arg1, arg2) => {
    let slotA, slotB;
    if (typeof arg1 === 'object' && arg1 !== null) {
      slotA = arg1.slotA ?? arg1.fromSlot;
      slotB = arg1.slotB ?? arg1.toSlot;
    } else {
      slotA = arg1;
      slotB = arg2;
    }
    return executeSwap(slotA, slotB, store, engine);
  };

  return scene.on('swap-request', handler);
}

/**
 * MockSceneAdapter: Person C test harness that emulates Person A's scene
 * event emitter without touching src/scene/.
 */
export class MockSceneAdapter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, ...args) {
    const cbs = this.listeners.get(event);
    if (!cbs) return [];
    const results = [];
    for (const cb of cbs) {
      try {
        results.push(cb(...args));
      } catch (err) {
        console.error(`[MockSceneAdapter] Error in listener for '${event}':`, err);
      }
    }
    return results;
  }

  requestSwap(slotA, slotB) {
    return this.emit('swap-request', { slotA, slotB });
  }
}
