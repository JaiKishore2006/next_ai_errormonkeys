/**
 * Shelf Shuffle - Unit Tests for Slot Swap Interactions (Person C)
 * 
 * Verifies:
 * 1. Finding products by slot using assignment[productId] = slotId
 * 2. Two occupied slots swapped successfully
 * 3. Product moved into an empty slot successfully
 * 4. Rejection of two empty slots (state unchanged, clear reason)
 * 5. Rejection of self-swap (slotA === slotB, state unchanged)
 * 6. Destination legality validation under ACTIVE LEVEL rules:
 *    - Level 2: Heavy product rejected if moved to upper shelf
 *    - Level 4: Hazard product rejected if moved outside Aisle 5
 *    - Level 4: Fragile product rejected if moved outside Aisle 4
 * 7. State atomicity: on illegal move, movesUsed, assignment, and undo stack remain unchanged
 * 8. Move budget enforcement: rejection when movesUsed >= moveLimit
 * 9. Undo operation: restores previous assignment, decrements movesUsed, emits assignment-changed
 * 10. Reset operation: restores assignment to originalAssignment while keeping originalAssignment strictly immutable
 * 11. MockSceneAdapter integration: listens to 'swap-request' event and triggers swap
 */

import { describe, it, expect } from 'vitest';
import { store } from '../state.js';
import { executeSwap, undoSwap, resetToOriginal, MockSceneAdapter, attachSceneSwapListener } from './swap.js';
import { getLevelById } from './levels.js';
import { HAZARD_AISLE, FRAGILE_AISLE } from './rules.js';

describe('Slot Swap Interactions (Person C)', () => {
  // Common test assignment
  const setupTestState = () => {
    const testAssignment = Array.from({ length: 100 }, () => 239);
    testAssignment[0] = 0;   // Product 0 in Slot 0
    testAssignment[1] = 2;   // Product 1 (heavy) in Slot 2 (Level 0)
    testAssignment[6] = 160; // Product 6 (fragile) in Slot 160 (Aisle 4)
    testAssignment[99] = 200; // Product 99 (hazard) in Slot 200 (Aisle 5)

    store.initFromData({
      originalAssignment: testAssignment,
      month: 'base'
    });
  };

  it('Suite 1: Two occupied slots swapped successfully', () => {
    setupTestState();
    store.setLevel(1);
    const movesBefore1 = store.getState().movesUsed;
    const undoLenBefore1 = store.getState().moveHistory.length;

    let assignEventFired = false;
    const unsub1 = store.on('assignment-changed', () => { assignEventFired = true; });

    const res1 = executeSwap(0, 2, store);
    unsub1();

    expect(res1.success).toBe(true);
    expect(store.getState().assignment[0]).toBe(2);
    expect(store.getState().assignment[1]).toBe(0);
    expect(store.getState().movesUsed).toBe(movesBefore1 + 1);
    expect(store.getState().moveHistory.length).toBe(undoLenBefore1 + 1);
    expect(assignEventFired).toBe(true);
  });

  it('Suite 2: Product moving into an empty slot', () => {
    // Currently Product 0 is in Slot 2. Slot 4 is empty.
    const movesBefore2 = store.getState().movesUsed;
    const res2 = executeSwap(2, 4, store);

    expect(res2.success).toBe(true);
    expect(store.getState().assignment[0]).toBe(4);
    expect(store.getState().movesUsed).toBe(movesBefore2 + 1);
    // Slot 2 should now be empty (no product maps to slot 2)
    const productInSlot2 = store.getState().assignment.findIndex(s => s === 2);
    expect(productInSlot2).toBe(-1);
  });

  it('Suite 3: Rejection of two empty slots', () => {
    // Slots 10 and 11 are empty
    const stateSnapshotBefore3 = JSON.stringify(store.getState().assignment);
    const movesBefore3 = store.getState().movesUsed;
    const undoLenBefore3 = store.getState().moveHistory.length;

    const res3 = executeSwap(10, 11, store);

    expect(res3.success).toBe(false);
    expect(res3.reason).toContain('both Slot #10 and Slot #11 are empty');
    expect(JSON.stringify(store.getState().assignment)).toBe(stateSnapshotBefore3);
    expect(store.getState().movesUsed).toBe(movesBefore3);
    expect(store.getState().moveHistory.length).toBe(undoLenBefore3);
  });

  it('Suite 4: Self-swap rejection (slotA === slotB)', () => {
    const res4 = executeSwap(4, 4, store);
    expect(res4.success).toBe(false);
    expect(res4.reason).toContain('itself');
  });

  it('Suite 5: Active Level 2 rules (Heavy on low shelf)', () => {
    store.setLevel(2); // Heavy on low shelves
    // Product 1 (heavy) is currently in Slot 0 (level 0).
    // Slot 1 is in Aisle 0 on Level 1 (upper shelf, slotId % 2 === 1).
    const stateSnapshotBefore5 = JSON.stringify(store.getState().assignment);
    const movesBefore5 = store.getState().movesUsed;

    const res5 = executeSwap(0, 1, store);
    expect(res5.success).toBe(false);
    expect(res5.reason).toContain('bottom shelf');
    expect(JSON.stringify(store.getState().assignment)).toBe(stateSnapshotBefore5);
    expect(store.getState().movesUsed).toBe(movesBefore5);
  });

  it('Suite 6: Active Level 4 rules (Hazard & Fragile zoning)', () => {
    store.setLevel(4); // Zoning + 15 moves

    // Product 99 (hazard) is in Slot 200 (Aisle 5).
    // Attempt to move it to Slot 0 (Aisle 0) -> Must be rejected!
    const res6Hazard = executeSwap(200, 0, store);
    expect(res6Hazard.success).toBe(false);
    expect(res6Hazard.reason).toContain(`Hazard Zone (Aisle ${HAZARD_AISLE})`);

    // Product 6 (fragile) is in Slot 160 (Aisle 4).
    // Attempt to move it to Slot 0 (Aisle 0) -> Must be rejected!
    const res6Fragile = executeSwap(160, 0, store);
    expect(res6Fragile.success).toBe(false);
    expect(res6Fragile.reason).toContain(`Fragile Zone (Aisle ${FRAGILE_AISLE})`);
  });

  it('Suite 7: Move limit enforcement', () => {
    store.setLevel(3); // Level 3: 10 moves limit
    store.setState({ movesUsed: 10 }); // Limit exhausted
    const res7 = executeSwap(0, 4, store);
    expect(res7.success).toBe(false);
    expect(res7.reason).toContain('Move limit reached');
  });

  it('Suite 8: Undo operation', () => {
    store.setLevel(1);
    resetToOriginal(store);
    expect(store.getState().movesUsed).toBe(0);

    // Execute a valid swap
    const originalSnapshot = [...store.getState().assignment];
    const swapExec = executeSwap(0, 2, store);
    expect(swapExec.success).toBe(true);
    expect(store.getState().movesUsed).toBe(1);
    expect(store.getState().assignment[0]).toBe(2);

    // Now Undo!
    let undoEventFired = false;
    const unsubUndo = store.on('assignment-changed', () => { undoEventFired = true; });
    const undoRes = undoSwap(store);
    unsubUndo();

    expect(undoRes.success).toBe(true);
    expect(store.getState().movesUsed).toBe(0);
    expect(store.getState().assignment[0]).toBe(originalSnapshot[0]);
    expect(store.getState().assignment[1]).toBe(originalSnapshot[1]);
    expect(undoEventFired).toBe(true);
  });

  it('Suite 9: Reset to Original & Immutability Check', () => {
    // Make 2 moves
    executeSwap(0, 2, store);
    executeSwap(2, 4, store);
    expect(store.getState().movesUsed).toBe(2);

    // Reset to original
    const resetRes = resetToOriginal(store);
    expect(resetRes.success).toBe(true);
    expect(store.getState().movesUsed).toBe(0);
    expect(store.getState().moveHistory.length).toBe(0);
    expect(Object.isFrozen(store.getState().originalAssignment)).toBe(true);
    expect(store.getState().assignment[0]).toBe(store.getState().originalAssignment[0]);
    
    // Verify strict immutability
    let threwOnMutation = false;
    try {
      store.getState().originalAssignment[0] = 9999;
    } catch (e) {
      threwOnMutation = true;
    }
    expect(threwOnMutation).toBe(true);
  });

  it('Suite 10: MockSceneAdapter Integration', () => {
    const mockScene = new MockSceneAdapter();
    const detach = attachSceneSwapListener(mockScene, store);

    // Trigger swap-request via scene adapter
    const sceneSwapRes = mockScene.requestSwap(0, 2);
    expect(sceneSwapRes.length > 0 && sceneSwapRes[0].success === true).toBe(true);
    expect(store.getState().movesUsed).toBe(1);
    detach();
  });
});
