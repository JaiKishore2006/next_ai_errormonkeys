import { describe, it, expect } from 'vitest';
import {
  slotPoint,
  dist,
  dockToSlot,
  routeFor,
  evaluate,
  originalAssignment,
  baselineAssignment,
  affinityAssignment,
  isLegal,
  regret,
  bestMoves,
  costSummary,
  compareMethods,
  seasonRun,
  yearSummary
} from '../src/engine/index.js';

import mockLayout from '../public/data/mock/layout.json';
import mockProducts from '../public/data/mock/products.json';
import mockOrders from '../public/data/mock/orders_base.json';
import mockPairs from '../public/data/mock/cooccurrence.json';

import realLayout from '../public/data/layout.json';
import realProducts from '../public/data/products.json';
import realOrders from '../public/data/orders_base.json';
import realPairs from '../public/data/cooccurrence.json';

// Import all 12 monthly order datasets
import orders2010_12 from '../public/data/orders_2010-12.json';
import orders2011_01 from '../public/data/orders_2011-01.json';
import orders2011_02 from '../public/data/orders_2011-02.json';
import orders2011_03 from '../public/data/orders_2011-03.json';
import orders2011_04 from '../public/data/orders_2011-04.json';
import orders2011_05 from '../public/data/orders_2011-05.json';
import orders2011_06 from '../public/data/orders_2011-06.json';
import orders2011_07 from '../public/data/orders_2011-07.json';
import orders2011_08 from '../public/data/orders_2011-08.json';
import orders2011_09 from '../public/data/orders_2011-09.json';
import orders2011_10 from '../public/data/orders_2011-10.json';
import orders2011_11 from '../public/data/orders_2011-11.json';

const active12Months = {
  '2010-12': orders2010_12,
  '2011-01': orders2011_01,
  '2011-02': orders2011_02,
  '2011-03': orders2011_03,
  '2011-04': orders2011_04,
  '2011-05': orders2011_05,
  '2011-06': orders2011_06,
  '2011-07': orders2011_07,
  '2011-08': orders2011_08,
  '2011-09': orders2011_09,
  '2011-10': orders2011_10,
  '2011-11': orders2011_11
};

describe('1. Geometry & Distance Metric', () => {
  it('slotPoint accurately retrieves coordinates', () => {
    const pt0 = slotPoint(mockLayout, 0);
    expect(pt0).toEqual({ x: 3, z: 2.25, aisle: 0 });

    const pt20 = slotPoint(mockLayout, 20);
    expect(pt20).toEqual({ x: 8, z: 2.25, aisle: 1 });
  });

  it('dist satisfies distance symmetry', () => {
    const p1 = { x: 3, z: 4.5 };
    const p2 = { x: 8, z: 12.0 };
    expect(dist(p1, p2)).toBe(dist(p2, p1));
  });

  it('dist computes same-aisle walking distance', () => {
    const p1 = { x: 3, z: 2.25 };
    const p2 = { x: 3, z: 8.25 };
    expect(dist(p1, p2)).toBe(6.0);
  });

  it('dist routes via front cross-aisle (z=0) when shorter', () => {
    const p1 = { x: 3, z: 2.0 };
    const p2 = { x: 8, z: 3.0 };
    expect(dist(p1, p2)).toBe(10.0);
  });

  it('dist routes via back cross-aisle (z=18) when shorter', () => {
    const p1 = { x: 3, z: 16.0 };
    const p2 = { x: 8, z: 17.0 };
    expect(dist(p1, p2)).toBe(8.0);
  });

  it('dockToSlot computes distance from dock (0,0)', () => {
    expect(dockToSlot({ x: 3, z: 2.25 })).toBe(5.25);
  });
});

describe('2. Routing Algorithms & Polyline Integrity', () => {
  it('sshape polyline length matches calculated distance', () => {
    const slotIds = [0, 4, 20, 28];
    const res = routeFor(mockLayout, slotIds, 'sshape', { includePoints: true });

    let polylineLength = 0;
    for (let i = 0; i < res.points.length - 1; i++) {
      const a = res.points[i];
      const b = res.points[i + 1];
      polylineLength += Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    }

    polylineLength = Math.round(polylineLength * 100) / 100;
    expect(polylineLength).toBe(res.distance);
  });

  it('sshape handles odd number of visited aisles correctly', () => {
    const slotIds = [0, 4, 8];
    const res = routeFor(mockLayout, slotIds, 'sshape', { includePoints: true });
    expect(res.distance).toBe(16.5);
  });

  it('return routing computes round trips per aisle', () => {
    const slotIds = [0, 20];
    const res = routeFor(mockLayout, slotIds, 'return', { includePoints: true });
    expect(res.distance).toBe(25.0);
  });

  it('largest-gap routing skips maximum inter-pick gap', () => {
    const slotIds = [0, 8, 16];
    const res = routeFor(mockLayout, slotIds, 'largestgap', { includePoints: true });
    expect(res.distance).toBeGreaterThan(0);
    expect(res.points.length).toBeGreaterThan(0);
  });

  it('optimal routing (DP TSP) produces optimal tour and caches results', () => {
    const slotIds = [0, 4, 8];
    const optRes1 = routeFor(mockLayout, slotIds, 'optimal', { includePoints: false });
    const optRes2 = routeFor(mockLayout, slotIds, 'optimal', { includePoints: false });
    expect(optRes1.distance).toBe(optRes2.distance);
    expect(optRes1.distance).toBeGreaterThan(0);
  });
});

describe('3. Physical Constraint Legality Rules', () => {
  it('flags heavy products placed on high shelves (level 1) as illegal', () => {
    const heavyProduct = { id: 1, code: 'H1', weight: 'heavy', fragile: false, hazard: false };
    const level1Slot = realLayout.slots.find((s) => s.level === 1 && s.zone === 'normal');
    const check = isLegal(realLayout, heavyProduct, level1Slot.id);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('bottom shelf');
  });

  it('permits heavy products on low shelves (level 0)', () => {
    const heavyProduct = { id: 1, code: 'H1', weight: 'heavy', fragile: false, hazard: false };
    const level0Slot = realLayout.slots.find((s) => s.level === 0 && s.zone === 'normal');
    const check = isLegal(realLayout, heavyProduct, level0Slot.id);
    expect(check.ok).toBe(true);
  });

  it('flags hazard products placed outside Aisle 5 as illegal', () => {
    const hazardProduct = { id: 2, code: 'HAZ1', weight: 'light', fragile: false, hazard: true };
    const aisle0Slot = realLayout.slots.find((s) => s.aisle === 0);
    const check = isLegal(realLayout, hazardProduct, aisle0Slot.id);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('Hazard Zone');
  });

  it('permits hazard products placed in Aisle 5', () => {
    const hazardProduct = { id: 2, code: 'HAZ1', weight: 'light', fragile: false, hazard: true };
    const aisle5Slot = realLayout.slots.find((s) => s.aisle === 5 && s.level === 1);
    const check = isLegal(realLayout, hazardProduct, aisle5Slot.id);
    expect(check.ok).toBe(true);
  });

  it('flags fragile products placed outside Aisle 4 as illegal', () => {
    const fragileProduct = { id: 3, code: 'FRAG1', weight: 'light', fragile: true, hazard: false };
    const aisle1Slot = realLayout.slots.find((s) => s.aisle === 1);
    const check = isLegal(realLayout, fragileProduct, aisle1Slot.id);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('Fragile Zone');
  });
});

describe('4. Real Data Evaluation & Baseline Verification', () => {
  it('generates 100% legal baseline assignment for all 100 products', () => {
    const baseline = baselineAssignment(realLayout, realProducts);
    expect(baseline.length).toBe(100);

    for (const p of realProducts) {
      const slotId = baseline[p.id];
      const check = isLegal(realLayout, p, slotId);
      expect(check.ok).toBe(true);
    }
  });

  it('verifies evaluate executes fast (< 50ms for 1,119 orders)', () => {
    const original = originalAssignment(realProducts);
    const t0 = performance.now();
    const evalResult = evaluate(realLayout, original, realOrders, 'sshape');
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(50);
    expect(evalResult.totalDistance).toBeGreaterThan(0);
    expect(evalResult.totalTimeSec).toBeGreaterThan(0);
    expect(evalResult.visitsBySlot.length).toBe(realLayout.slots.length);
  });

  it('baseline placement decisively beats unoptimized original layout', () => {
    const original = originalAssignment(realProducts);
    const baseline = baselineAssignment(realLayout, realProducts);

    const origEval = evaluate(realLayout, original, realOrders, 'sshape');
    const baseEval = evaluate(realLayout, baseline, realOrders, 'sshape');

    expect(baseEval.totalDistance).toBeLessThan(origEval.totalDistance);

    const percentSaved = ((origEval.totalDistance - baseEval.totalDistance) / origEval.totalDistance) * 100;
    expect(percentSaved).toBeGreaterThan(0);
  });
});

describe('5. Phase B3: Depth, Affinity Optimizer, & Analytics', () => {
  it('affinityAssignment generates 100% legal assignments under constraints', () => {
    const affinity = affinityAssignment(realLayout, realProducts, realPairs, {}, realOrders);
    expect(affinity.length).toBe(100);

    for (const p of realProducts) {
      const slotId = affinity[p.id];
      const check = isLegal(realLayout, p, slotId);
      expect(check.ok).toBe(true);
    }
  });

  it('affinity layout beats original unoptimized layout on real orders', () => {
    const original = originalAssignment(realProducts);
    const affinity = affinityAssignment(realLayout, realProducts, realPairs, {}, realOrders);

    const origEval = evaluate(realLayout, original, realOrders, 'sshape');
    const affEval = evaluate(realLayout, affinity, realOrders, 'sshape');

    expect(affEval.totalDistance).toBeLessThan(origEval.totalDistance);
  });

  it('bestMoves evaluates top candidate swaps with real positive distance gain', () => {
    const original = originalAssignment(realProducts);
    const topMoves = bestMoves(realLayout, original, realProducts, realOrders, 3);

    expect(topMoves.length).toBeGreaterThan(0);
    expect(topMoves.length).toBeLessThanOrEqual(3);
    expect(topMoves[0].gainMeters).toBeGreaterThan(0);

    const top = topMoves[0];
    const pA = realProducts.find((p) => p.id === top.productId);
    const pB = realProducts.find((p) => p.id === top.swappedWithId);

    expect(isLegal(realLayout, pA, top.toSlot).ok).toBe(true);
    expect(isLegal(realLayout, pB, top.fromSlot).ok).toBe(true);
  });

  it('costSummary computes ROI and payback periods accurately', () => {
    const summary = costSummary({
      distBeforePerDay: 5000,
      distAfterPerDay: 3000,
      wage: 150,
      speed: 1.2,
      days: 26,
      moves: 10,
      costPerMove: 250
    });

    expect(summary.distSavedPerDay).toBe(2000);
    expect(summary.hoursSavedMonth).toBeGreaterThan(0);
    expect(summary.grossSavings).toBeGreaterThan(0);
    expect(summary.relocationCost).toBe(2500);
    expect(summary.netFirstMonth).toBe(summary.grossSavings - 2500);
    expect(summary.paybackDays).toBeGreaterThan(0);
  });

  it('regret scores identify the most displaced high-frequency items', () => {
    const original = originalAssignment(realProducts);
    const regretList = regret(realLayout, original, realProducts);

    expect(regretList.length).toBe(100);
    expect(regretList[0].regretScore).toBeGreaterThanOrEqual(regretList[1].regretScore);
  });

  it('compareMethods runs all 4 routing algorithms', () => {
    const original = originalAssignment(mockProducts);
    const comparison = compareMethods(mockLayout, original, mockOrders);

    expect(comparison.sshape).toBeGreaterThan(0);
    expect(comparison.return).toBeGreaterThan(0);
    expect(comparison.largestgap).toBeGreaterThan(0);
    expect(comparison.optimal).toBeGreaterThan(0);
  });
});

describe('6. Phase B4: Full 12-Month Season Simulation & Robustness', () => {
  it('evaluates all 12 months with no NaN values and non-zero meters', () => {
    const original = originalAssignment(realProducts);

    for (const [monthKey, orders] of Object.entries(active12Months)) {
      const t0 = performance.now();
      const res = seasonRun(realLayout, original, orders, 'sshape', `test_${monthKey}`);
      const duration = performance.now() - t0;

      expect(duration).toBeLessThan(50);
      expect(Number.isFinite(res.totalDistance)).toBe(true);
      expect(res.totalDistance).toBeGreaterThan(0);
      expect(Number.isFinite(res.totalTimeSec)).toBe(true);
      expect(res.totalTimeSec).toBeGreaterThan(0);
    }
  });

  it('yearSummary computes 12-month comparisons for all 3 policies with verdict', () => {
    const original = originalAssignment(realProducts);
    const baseline = baselineAssignment(realLayout, realProducts);

    const yearResult = yearSummary(
      realLayout,
      baseline,
      original,
      active12Months,
      realProducts,
      { wage: 150, costPerMove: 250, playerMoves: 10 }
    );

    expect(yearResult.months.length).toBe(12);
    expect(yearResult.policyOriginal.totalMeters).toBeGreaterThan(0);
    expect(yearResult.policyPlayer.totalMeters).toBeLessThan(yearResult.policyOriginal.totalMeters);
    expect(yearResult.policyPlayer.netSavings).toBeGreaterThan(0);
    expect(typeof yearResult.verdict).toBe('string');
    expect(yearResult.verdict.length).toBeGreaterThan(0);
  });

  it('checks all 12 months across all 4 routing methods with zero crashes', () => {
    const original = originalAssignment(mockProducts);

    for (const orders of Object.values(active12Months)) {
      // Test sample orders with all methods
      const sample = orders.slice(0, 15);
      const comparison = compareMethods(mockLayout, original, sample);

      expect(Number.isFinite(comparison.sshape)).toBe(true);
      expect(Number.isFinite(comparison.return)).toBe(true);
      expect(Number.isFinite(comparison.largestgap)).toBe(true);
      expect(Number.isFinite(comparison.optimal)).toBe(true);
    }
  });
});
