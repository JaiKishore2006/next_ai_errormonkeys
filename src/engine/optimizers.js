import { dockToSlot } from './geometry.js';
import { evaluate } from './evaluate.js';

/**
 * Slotting Optimizers and Legality Verification
 */

/**
 * Returns original unoptimized assignment from products metadata
 */
export function originalAssignment(products) {
  const maxId = Math.max(...products.map((p) => p.id));
  const assignment = new Array(maxId + 1);
  for (const p of products) {
    assignment[p.id] = p.originalSlot;
  }
  return assignment;
}

/**
 * Verifies if placing a product into slotId violates warehouse physical constraints
 */
export function isLegal(layout, product, slotId, rules = {}) {
  const slot = layout.slots[slotId] ?? layout.slots.find((s) => s.id === slotId);
  if (!slot) {
    return { ok: false, reason: `Slot ${slotId} does not exist.` };
  }

  // Heavy products must be on Level 0 (bottom shelf)
  if (rules.heavyLow !== false && product.weight === 'heavy' && slot.level !== 0) {
    return {
      ok: false,
      reason: `Heavy item "${product.name || product.code}" must be placed on the bottom shelf (Level 0).`
    };
  }

  // Hazardous goods must be in Aisle 5
  if (rules.zones !== false && product.hazard && slot.zone !== 'hazard') {
    return {
      ok: false,
      reason: `Hazardous item "${product.name || product.code}" must be placed in the Hazard Zone (Aisle 5).`
    };
  }

  // Fragile goods must be in Aisle 4
  if (rules.zones !== false && product.fragile && slot.zone !== 'fragile') {
    return {
      ok: false,
      reason: `Fragile item "${product.name || product.code}" must be placed in the Fragile Zone (Aisle 4).`
    };
  }

  return { ok: true };
}

/**
 * Automatic Baseline Assignment:
 * Places fastest movers nearest to the packing dock (0,0), respecting all zone and shelf constraints.
 */
export function baselineAssignment(layout, products, rules = {}) {
  // Sort products by frequency descending
  const sortedProducts = [...products].sort((a, b) => b.freq - a.freq);

  // Sort slots by distance from dock (0,0) ascending
  const sortedSlots = [...layout.slots].sort((a, b) => {
    const da = dockToSlot(a);
    const db = dockToSlot(b);
    if (da !== db) return da - db;
    // Tie-breaker: level 0 first, then aisle
    if (a.level !== b.level) return a.level - b.level;
    return a.id - b.id;
  });

  const maxId = Math.max(...products.map((p) => p.id));
  const assignment = new Array(maxId + 1);
  const occupiedSlots = new Set();

  for (const prod of sortedProducts) {
    let assigned = false;
    for (const slot of sortedSlots) {
      if (occupiedSlots.has(slot.id)) continue;

      const check = isLegal(layout, prod, slot.id, rules);
      if (check.ok) {
        assignment[prod.id] = slot.id;
        occupiedSlots.add(slot.id);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      throw new Error(`Could not find a legal slot for product ${prod.id} (${prod.code})`);
    }
  }

  return assignment;
}

/**
 * Affinity Optimizer:
 * Co-occurrence slotting clustering frequently co-ordered items nearby,
 * followed by a fast greedy swap refinement.
 */
export function affinityAssignment(layout, products, pairs = [], rules = {}) {
  // Start from baseline assignment
  const assignment = baselineAssignment(layout, products, rules);
  const prodMap = new Map(products.map((p) => [p.id, p]));

  // Build adjacency matrix for top co-occurring pairs
  const cooccMap = new Map();
  for (const pair of pairs) {
    const key1 = `${pair.a}-${pair.b}`;
    const key2 = `${pair.b}-${pair.a}`;
    cooccMap.set(key1, pair.count);
    cooccMap.set(key2, pair.count);
  }

  // Invert assignment to find slot -> productId
  const slotToProd = new Map();
  for (let pId = 0; pId < assignment.length; pId++) {
    if (assignment[pId] !== undefined) {
      slotToProd.set(assignment[pId], pId);
    }
  }

  // Attempt localized swaps between top co-occurring pairs to bring them into the same aisle or bay
  for (const pair of pairs.slice(0, 50)) {
    const pA = prodMap.get(pair.a);
    const pB = prodMap.get(pair.b);
    if (!pA || !pB) continue;

    const slotA = assignment[pA.id];
    const slotB = assignment[pB.id];
    const sA = layout.slots[slotA];
    const sB = layout.slots[slotB];

    // If already in same aisle, good
    if (sA.aisle === sB.aisle) continue;

    // Check if swap is legal
    const legalA = isLegal(layout, pA, slotB, rules);
    const legalB = isLegal(layout, pB, slotA, rules);

    if (legalA.ok && legalB.ok) {
      // If moving B closer to A reduces dock distance penalty
      assignment[pA.id] = slotB;
      assignment[pB.id] = slotA;
      slotToProd.set(slotB, pA.id);
      slotToProd.set(slotA, pB.id);
    }
  }

  return assignment;
}

/**
 * Regret Calculation:
 * Measures displacement regret score per product:
 * regret = freq * max(0, dist(dock, current) - dist(dock, target))
 * Returns array sorted descending by regretScore.
 */
export function regret(layout, assignment, products) {
  const target = baselineAssignment(layout, products);
  const regretList = [];

  for (const p of products) {
    const currSlotId = assignment[p.id];
    const targSlotId = target[p.id];

    const currSlot = layout.slots[currSlotId] ?? layout.slots.find((s) => s.id === currSlotId);
    const targSlot = layout.slots[targSlotId] ?? layout.slots.find((s) => s.id === targSlotId);

    const distCurr = dockToSlot(currSlot);
    const distTarg = dockToSlot(targSlot);

    const regretScore = Math.max(0, p.freq * (distCurr - distTarg));

    regretList.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      currentSlot: currSlotId,
      targetSlot: targSlotId,
      regretScore: Math.round(regretScore)
    });
  }

  regretList.sort((a, b) => b.regretScore - a.regretScore);
  return regretList;
}

/**
 * Suggests top N best legal moves/swaps to reduce walking distance
 */
export function bestMoves(layout, assignment, products, orders, n = 3, rules = {}) {
  const currentEval = evaluate(layout, assignment, orders, 'sshape');
  const baseDistance = currentEval.totalDistance;

  const regretItems = regret(layout, assignment, products).slice(0, 10);
  const candidates = [];
  const prodMap = new Map(products.map((p) => [p.id, p]));

  for (const item of regretItems) {
    const pA = prodMap.get(item.productId);
    const fromSlot = assignment[pA.id];
    const toSlot = item.targetSlot;

    // Find who occupies toSlot
    const occupantPId = assignment.findIndex((sId) => sId === toSlot);
    if (occupantPId === -1) continue;
    const pB = prodMap.get(occupantPId);
    if (!pB) continue;

    // Verify legality of mutual swap
    const canSwapA = isLegal(layout, pA, toSlot, rules);
    const canSwapB = isLegal(layout, pB, fromSlot, rules);

    if (canSwapA.ok && canSwapB.ok) {
      // Test swap impact
      const testAssignment = [...assignment];
      testAssignment[pA.id] = toSlot;
      testAssignment[pB.id] = fromSlot;

      const testEval = evaluate(layout, testAssignment, orders, 'sshape');
      const gainMeters = Math.round((baseDistance - testEval.totalDistance) * 100) / 100;

      if (gainMeters > 0) {
        candidates.push({
          productId: pA.id,
          productCode: pA.code,
          productName: pA.name,
          swappedWithId: pB.id,
          swappedWithCode: pB.code,
          fromSlot,
          toSlot,
          gainMeters
        });
      }
    }
  }

  candidates.sort((a, b) => b.gainMeters - a.gainMeters);
  return candidates.slice(0, n);
}
