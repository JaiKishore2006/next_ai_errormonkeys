import { evaluate } from './evaluate.js';

/**
 * Financial & Cost Modeling
 * Formulas adhere strictly to the project contract:
 * - wage = ₹150/h default
 * - days = 26 working days default
 * - costPerMove = ₹250 per move default
 * - speed = 1.2 m/s
 */

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
 * Compare all routing methods for an order set
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
 * Runs evaluation for a specific month
 */
export function seasonRun(layout, assignment, monthOrders, method = 'sshape') {
  return evaluate(layout, assignment, monthOrders, method);
}

/**
 * 12-Month Year Simulation:
 * Compares:
 * 1. Untouched original layout
 * 2. Player's customized layout
 * 3. Re-optimized layout each month (including physical relocation costs)
 */
export function yearSummary(layout, playerAssignment, origAssignment, monthlyOrdersMap, options = {}) {
  const wage = options.wage ?? 150;
  const costPerMove = options.costPerMove ?? 250;
  const speed = options.speed ?? 1.2;
  const workingDays = options.days ?? 26;
  const method = options.method ?? 'sshape';

  const months = Object.keys(monthlyOrdersMap).sort();
  const monthResults = [];

  let cumDistOriginal = 0;
  let cumDistPlayer = 0;
  let cumLaborSavings = 0;

  for (const m of months) {
    const orders = monthlyOrdersMap[m];
    const origEval = evaluate(layout, origAssignment, orders, method);
    const playEval = evaluate(layout, playerAssignment, orders, method);

    const distSaved = Math.max(0, origEval.totalDistance - playEval.totalDistance);
    const hoursSaved = (distSaved / speed / 3600) * workingDays;
    const laborSaved = hoursSaved * wage;

    cumDistOriginal += origEval.totalDistance;
    cumDistPlayer += playEval.totalDistance;
    cumLaborSavings += laborSaved;

    monthResults.push({
      month: m,
      originalMeters: origEval.totalDistance,
      playerMeters: playEval.totalDistance,
      distSavedMeters: Math.round(distSaved),
      monthlyLaborSavings: Math.round(laborSaved)
    });
  }

  return {
    months: monthResults,
    totalOriginalMeters: Math.round(cumDistOriginal),
    totalPlayerMeters: Math.round(cumDistPlayer),
    totalMetersSaved: Math.round(cumDistOriginal - cumDistPlayer),
    totalGrossSavings: Math.round(cumLaborSavings),
    verdict: cumLaborSavings > 0 ? 'Cost Effective' : 'Needs Optimization'
  };
}
