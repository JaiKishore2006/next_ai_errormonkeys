import { evaluate } from './evaluate.js';
import { baselineAssignment } from './optimizers.js';

/**
 * Financial & Cost Modeling
 * Formulas adhere strictly to the project contract:
 * - wage = ₹150/h default
 * - days = 26 working days default
 * - costPerMove = ₹250 per move default
 * - speed = 1.2 m/s
 */

// Cache for seasonal month evaluations
const seasonCache = new Map();

export function costSummary({
  distBeforePerDay,
  distAfterPerDay,
  wage = 150,
  speed = 1.2,
  days = 26,
  moves = 0,
  costPerMove = 250
}) {
  const distSavedPerDay = Math.max(0, distBeforePerDay - distAfterPerDay);
  const hoursSavedMonth = (distSavedPerDay / speed / 3600) * days;
  const grossSavings = hoursSavedMonth * wage;
  const relocationCost = moves * costPerMove;
  const netFirstMonth = grossSavings - relocationCost;
  const paybackDays = grossSavings > 0 ? (relocationCost / (grossSavings / days)) : Infinity;

  return {
    distSavedPerDay: Math.round(distSavedPerDay * 100) / 100,
    hoursSavedMonth: Math.round(hoursSavedMonth * 10) / 10,
    grossSavings: Math.round(grossSavings),
    relocationCost: Math.round(relocationCost),
    netFirstMonth: Math.round(netFirstMonth),
    paybackDays: Number.isFinite(paybackDays) ? Math.round(paybackDays * 10) / 10 : null
  };
}

/**
 * Compare all 4 routing methods for an order set
 */
export function compareMethods(layout, assignment, orders) {
  const sshapeRes = evaluate(layout, assignment, orders, 'sshape');
  const returnRes = evaluate(layout, assignment, orders, 'return');
  const lgapRes = evaluate(layout, assignment, orders, 'largestgap');
  const optRes = evaluate(layout, assignment, orders, 'optimal');

  return {
    sshape: sshapeRes.totalDistance,
    return: returnRes.totalDistance,
    largestgap: lgapRes.totalDistance,
    optimal: optRes.totalDistance
  };
}

/**
 * Phase B4: Cached Single-Month Season Run
 * Evaluates orders for a given month with sub-50ms execution.
 */
export function seasonRun(layout, assignment, monthOrders, method = 'sshape', cacheKey = null) {
  if (cacheKey) {
    const key = `${cacheKey}_${method}_${assignment.join(',')}`;
    if (seasonCache.has(key)) {
      return seasonCache.get(key);
    }
    const result = evaluate(layout, assignment, monthOrders, method);
    seasonCache.set(key, result);
    return result;
  }
  return evaluate(layout, assignment, monthOrders, method);
}

/**
 * Phase B4: Comprehensive 12-Month Year Simulation
 * Evaluates 3 distinct warehouse policies:
 * 1. Policy A: "Never Touched" (Original unoptimized layout across the entire year)
 * 2. Policy B: "Player Layout" (Player's current layout applied to all months, factoring initial moves)
 * 3. Policy C: "Re-optimize Monthly" (Dynamic slotting each month based on monthly demand, factoring relocation costs)
 * 
 * Directly powers Person C's "Is it worth it?" decision panel.
 */
export function yearSummary(
  layout,
  playerAssignment,
  origAssignment,
  monthlyOrdersMap,
  products = [],
  options = {}
) {
  const wage = options.wage ?? 150;
  const costPerMove = options.costPerMove ?? 250;
  const speed = options.speed ?? 1.2;
  const workingDays = options.days ?? 26;
  const method = options.method ?? 'sshape';
  const playerMoves = options.playerMoves ?? 0;

  const months = Object.keys(monthlyOrdersMap).sort();
  const monthResults = [];

  let cumDistOriginal = 0;
  let cumDistPlayer = 0;
  let cumDistDynamic = 0;

  let cumLaborOriginal = 0;
  let cumLaborPlayer = 0;
  let cumLaborDynamic = 0;

  let cumDynamicRelocationCost = 0;
  let prevDynamicAssignment = [...origAssignment];

  for (let mIdx = 0; mIdx < months.length; mIdx++) {
    const m = months[mIdx];
    const orders = monthlyOrdersMap[m];

    // 1. Policy A: Original
    const origEval = seasonRun(layout, origAssignment, orders, method, `orig_${m}`);
    const origLabor = ((origEval.totalDistance / speed / 3600) * workingDays) * wage;

    // 2. Policy B: Player Layout
    const playEval = seasonRun(layout, playerAssignment, orders, method, `play_${m}`);
    const playLabor = ((playEval.totalDistance / speed / 3600) * workingDays) * wage;

    // 3. Policy C: Dynamic Re-optimization (compute baseline for this month's demand)
    let dynamicAssignment = playerAssignment;
    let monthRelocationCost = 0;
    let movesThisMonth = 0;

    if (products.length > 0) {
      // Calculate monthly frequency from this month's orders
      const monthFreqMap = new Map();
      for (const p of products) monthFreqMap.set(p.id, 0);
      for (const ord of orders) {
        for (const pId of ord) {
          monthFreqMap.set(pId, (monthFreqMap.get(pId) || 0) + 1);
        }
      }

      // Products weighted by this specific month's frequency
      const monthlyProducts = products.map((p) => ({
        ...p,
        freq: monthFreqMap.get(p.id) || 0
      }));

      dynamicAssignment = baselineAssignment(layout, monthlyProducts);

      // Count physical relocation moves from previous month's layout
      for (let pId = 0; pId < dynamicAssignment.length; pId++) {
        if (dynamicAssignment[pId] !== undefined && dynamicAssignment[pId] !== prevDynamicAssignment[pId]) {
          movesThisMonth++;
        }
      }
      monthRelocationCost = movesThisMonth * costPerMove;
      prevDynamicAssignment = [...dynamicAssignment];
    }

    const dynamicEval = evaluate(layout, dynamicAssignment, orders, method);
    const dynamicLabor = ((dynamicEval.totalDistance / speed / 3600) * workingDays) * wage;

    cumDistOriginal += origEval.totalDistance;
    cumDistPlayer += playEval.totalDistance;
    cumDistDynamic += dynamicEval.totalDistance;

    cumLaborOriginal += origLabor;
    cumLaborPlayer += playLabor;
    cumLaborDynamic += dynamicLabor;
    cumDynamicRelocationCost += monthRelocationCost;

    const playerMonthlySavings = Math.max(0, origLabor - playLabor);
    const dynamicNetSavings = (origLabor - dynamicLabor) - monthRelocationCost;

    monthResults.push({
      month: m,
      originalMeters: origEval.totalDistance,
      playerMeters: playEval.totalDistance,
      dynamicMeters: dynamicEval.totalDistance,
      playerMonthlySavings: Math.round(playerMonthlySavings),
      dynamicMoves: movesThisMonth,
      dynamicRelocationCost: monthRelocationCost,
      dynamicNetSavings: Math.round(dynamicNetSavings)
    });
  }

  // Player totals factoring initial relocation
  const playerInitialRelocationCost = playerMoves * costPerMove;
  const playerGrossLaborSavings = cumLaborOriginal - cumLaborPlayer;
  const playerNetAnnualSavings = playerGrossLaborSavings - playerInitialRelocationCost;

  // Dynamic totals factoring ongoing monthly relocation
  const dynamicGrossLaborSavings = cumLaborOriginal - cumLaborDynamic;
  const dynamicNetAnnualSavings = dynamicGrossLaborSavings - cumDynamicRelocationCost;

  // Verdict for "Is It Worth It?" Panel
  let verdict = '';
  if (playerNetAnnualSavings > dynamicNetAnnualSavings) {
    verdict = 'Static Optimization Wins: Monthly re-slotting relocation costs outweigh extra travel savings.';
  } else {
    verdict = 'Dynamic Slotting Wins: High seasonal swings justify ongoing monthly reorganization.';
  }

  return {
    months: monthResults,
    policyOriginal: {
      totalMeters: Math.round(cumDistOriginal),
      totalLaborCost: Math.round(cumLaborOriginal)
    },
    policyPlayer: {
      totalMeters: Math.round(cumDistPlayer),
      totalLaborCost: Math.round(cumLaborPlayer),
      grossLaborSavings: Math.round(playerGrossLaborSavings),
      relocationCost: playerInitialRelocationCost,
      netSavings: Math.round(playerNetAnnualSavings)
    },
    policyDynamicMonthly: {
      totalMeters: Math.round(cumDistDynamic),
      totalLaborCost: Math.round(cumLaborDynamic),
      grossLaborSavings: Math.round(dynamicGrossLaborSavings),
      totalRelocationCost: cumDynamicRelocationCost,
      netSavings: Math.round(dynamicNetAnnualSavings)
    },
    verdict
  };
}
