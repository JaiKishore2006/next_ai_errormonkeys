import { routeFor } from './routing.js';

/**
 * Fast Warehouse Evaluator
 * Evaluates full order sets in < 50ms.
 * Calculates:
 * - total distance (meters)
 * - total pick time & average pick time (seconds)
 * - visitsBySlot (heatmap frequencies)
 * - per-order breakdown
 */

export function evaluate(layout, assignment, orders, method = 'sshape', options = {}) {
  const includePoints = options.includePoints ?? false;
  const sampleLimit = options.sampleLimit ?? orders.length;

  const numSlots = layout.slots.length;
  const visitsBySlot = new Int32Array(numSlots);
  const perOrder = [];

  let totalDistance = 0;
  let totalItems = 0;

  // Fast precomputed lookups for slots
  const slotX = new Float32Array(numSlots);
  const slotZ = new Float32Array(numSlots);
  const slotAisle = new Int8Array(numSlots);

  for (let i = 0; i < numSlots; i++) {
    const s = layout.slots[i];
    slotX[s.id] = s.x;
    slotZ[s.id] = s.z;
    slotAisle[s.id] = s.aisle;
  }

  const aisleLength = layout.aisleLength || 18;
  const dock = layout.dock || { x: 0, z: 0 };
  const aisleX = layout.aisleX || [3, 8, 13, 18, 23, 28];
  const numAislesTotal = aisleX.length;

  const isFastSShape = method.toLowerCase() === 'sshape' && !includePoints;
  const isFastReturn = method.toLowerCase() === 'return' && !includePoints;

  // Temporary buffers for fast evaluation
  const visitedAisleMask = new Uint8Array(numAislesTotal);
  const maxZPerAisle = new Float32Array(numAislesTotal);

  for (let oIdx = 0; oIdx < orders.length; oIdx++) {
    const order = orders[oIdx];
    const orderLen = order.length;
    totalItems += orderLen;

    if (orderLen === 0) {
      perOrder.push({ distance: 0 });
      continue;
    }

    // Map product IDs to slot IDs and record visits
    const slotIds = new Int32Array(orderLen);
    for (let k = 0; k < orderLen; k++) {
      const pId = order[k];
      const sId = assignment[pId];
      slotIds[k] = sId;
      if (sId >= 0 && sId < numSlots) {
        visitsBySlot[sId]++;
      }
    }

    // Fast inline calculation for bulk evaluation
    if (isFastSShape) {
      visitedAisleMask.fill(0);
      maxZPerAisle.fill(0);

      let distinctAislesCount = 0;
      let maxAisleIdx = -1;

      for (let k = 0; k < orderLen; k++) {
        const sId = slotIds[k];
        const aIdx = slotAisle[sId];
        const z = slotZ[sId];

        if (visitedAisleMask[aIdx] === 0) {
          visitedAisleMask[aIdx] = 1;
          distinctAislesCount++;
          if (aIdx > maxAisleIdx) maxAisleIdx = aIdx;
        }
        if (z > maxZPerAisle[aIdx]) {
          maxZPerAisle[aIdx] = z;
        }
      }

      if (distinctAislesCount === 0) {
        perOrder.push({ distance: 0 });
        continue;
      }

      const lastX = aisleX[maxAisleIdx];
      const horizontalDist = 2 * (lastX - dock.x);
      let verticalDist = 0;

      if (distinctAislesCount % 2 !== 0) {
        // Odd count: (m - 1) * L + 2 * maxZ_last
        const maxZLast = maxZPerAisle[maxAisleIdx];
        verticalDist = (distinctAislesCount - 1) * aisleLength + 2 * maxZLast;
      } else {
        // Even count: m * L
        verticalDist = distinctAislesCount * aisleLength;
      }

      const orderDist = Math.round((horizontalDist + verticalDist) * 100) / 100;
      totalDistance += orderDist;
      perOrder.push({ distance: orderDist });
    } else if (isFastReturn) {
      visitedAisleMask.fill(0);
      maxZPerAisle.fill(0);

      let maxAisleIdx = -1;
      for (let k = 0; k < orderLen; k++) {
        const sId = slotIds[k];
        const aIdx = slotAisle[sId];
        const z = slotZ[sId];

        if (visitedAisleMask[aIdx] === 0) {
          visitedAisleMask[aIdx] = 1;
          if (aIdx > maxAisleIdx) maxAisleIdx = aIdx;
        }
        if (z > maxZPerAisle[aIdx]) {
          maxZPerAisle[aIdx] = z;
        }
      }

      const lastX = maxAisleIdx >= 0 ? aisleX[maxAisleIdx] : dock.x;
      const horizontalDist = 2 * (lastX - dock.x);
      let verticalDist = 0;
      for (let a = 0; a <= maxAisleIdx; a++) {
        if (visitedAisleMask[a]) {
          verticalDist += 2 * maxZPerAisle[a];
        }
      }

      const orderDist = Math.round((horizontalDist + verticalDist) * 100) / 100;
      totalDistance += orderDist;
      perOrder.push({ distance: orderDist });
    } else {
      // General path routing with full waypoint points
      const shouldInclude = includePoints && oIdx < sampleLimit;
      const res = routeFor(layout, Array.from(slotIds), method, { includePoints: shouldInclude });
      totalDistance += res.distance;
      perOrder.push(res);
    }
  }

  // Time formulas: 1.2 m/s walk speed + 12s pick time per item
  const walkSpeed = layout.walkSpeed || 1.2;
  const pickTimePerItem = 12;
  const totalWalkTimeSec = totalDistance / walkSpeed;
  const totalPickTimeSec = totalItems * pickTimePerItem;
  const totalTimeSec = totalWalkTimeSec + totalPickTimeSec;
  const avgPickTimeSec = orders.length > 0 ? totalTimeSec / orders.length : 0;

  return {
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalTimeSec: Math.round(totalTimeSec * 10) / 10,
    avgPickTimeSec: Math.round(avgPickTimeSec * 10) / 10,
    perOrder,
    visitsBySlot: Array.from(visitsBySlot)
  };
}
