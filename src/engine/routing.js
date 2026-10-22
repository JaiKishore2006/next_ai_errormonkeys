import { slotPoint, dist, dockToSlot } from './geometry.js';

/**
 * Route calculation for order fulfillment
 * Supported methods:
 * - 'sshape': standard serpentine traversal
 * - 'return': enter and exit each visited aisle from the front cross-aisle
 * - 'largestgap': skips the largest gap between picks in an aisle
 * - 'optimal': exact bitmask DP TSP for <= 8 picks, heuristic fallback for > 8
 */

// Cache for optimal TSP routes to avoid recomputing identical pick sets
const optimalRouteCache = new Map();

export function routeFor(layout, slotIds, method = 'sshape', options = {}) {
  const includePoints = options.includePoints ?? true;
  const aisleLength = layout.aisleLength || 18;
  const dock = layout.dock || { x: 0, z: 0 };

  if (!slotIds || slotIds.length === 0) {
    return {
      distance: 0,
      points: includePoints ? [{ x: dock.x, z: dock.z }] : []
    };
  }

  // Deduplicate and resolve slot coordinates
  const uniqueSlotIds = Array.from(new Set(slotIds)).sort((a, b) => a - b);
  const points = uniqueSlotIds.map((id) => slotPoint(layout, id));

  switch (method.toLowerCase()) {
    case 'return':
      return routeReturn(layout, points, aisleLength, dock, includePoints);
    case 'largestgap':
      return routeLargestGap(layout, points, aisleLength, dock, includePoints);
    case 'optimal':
      return routeOptimalCached(layout, uniqueSlotIds, points, aisleLength, dock, includePoints);
    case 'sshape':
    default:
      return routeSShape(layout, points, aisleLength, dock, includePoints);
  }
}

/**
 * S-Shape Routing
 * Traverses visited aisles in serpentine fashion.
 * Odd count: last aisle is entered and left from front (2 * maxZ).
 */
function routeSShape(layout, pickPoints, aisleLength, dock, includePoints) {
  const aisleMap = new Map();
  for (const pt of pickPoints) {
    if (!aisleMap.has(pt.aisle)) {
      aisleMap.set(pt.aisle, { aisle: pt.aisle, x: pt.x, zList: [] });
    }
    aisleMap.get(pt.aisle).zList.push(pt.z);
  }

  const sortedAisles = Array.from(aisleMap.values()).sort((a, b) => a.x - b.x);
  const numAisles = sortedAisles.length;

  if (numAisles === 0) {
    return { distance: 0, points: includePoints ? [{ x: dock.x, z: dock.z }] : [] };
  }

  const lastAisle = sortedAisles[numAisles - 1];
  const horizontalDist = 2 * (lastAisle.x - dock.x);
  let verticalDist = 0;

  const waypoints = includePoints ? [{ x: dock.x, z: dock.z }] : [];
  let currentZ = 0; // Starts at front cross-aisle

  for (let i = 0; i < numAisles; i++) {
    const aisleInfo = sortedAisles[i];
    const isLast = i === numAisles - 1;
    const isOddTotal = numAisles % 2 !== 0;

    const zSortedAsc = [...aisleInfo.zList].sort((a, b) => a - b);
    const maxZ = zSortedAsc[zSortedAsc.length - 1];

    if (includePoints) {
      waypoints.push({ x: aisleInfo.x, z: currentZ });
    }

    if (isLast && isOddTotal) {
      // Last aisle in an odd-count order: enter and leave from front
      verticalDist += 2 * maxZ;
      if (includePoints) {
        for (const z of zSortedAsc) {
          waypoints.push({ x: aisleInfo.x, z });
        }
        waypoints.push({ x: aisleInfo.x, z: 0 });
        currentZ = 0;
      }
    } else {
      // Full traverse through the aisle
      verticalDist += aisleLength;
      if (includePoints) {
        if (currentZ === 0) {
          for (const z of zSortedAsc) {
            waypoints.push({ x: aisleInfo.x, z });
          }
          waypoints.push({ x: aisleInfo.x, z: aisleLength });
          currentZ = aisleLength;
        } else {
          const zSortedDesc = [...zSortedAsc].reverse();
          for (const z of zSortedDesc) {
            waypoints.push({ x: aisleInfo.x, z });
          }
          waypoints.push({ x: aisleInfo.x, z: 0 });
          currentZ = 0;
        }
      } else {
        currentZ = currentZ === 0 ? aisleLength : 0;
      }
    }
  }

  // Return to dock
  if (includePoints) {
    if (currentZ !== 0) {
      waypoints.push({ x: dock.x, z: aisleLength });
      waypoints.push({ x: dock.x, z: dock.z });
    } else {
      waypoints.push({ x: dock.x, z: dock.z });
    }
  }

  const totalDistance = Math.round((horizontalDist + verticalDist) * 100) / 100;
  return { distance: totalDistance, points: waypoints };
}

/**
 * Return Routing
 * Picker enters each visited aisle from the front (z=0), walks to maxZ, and returns to front.
 */
function routeReturn(layout, pickPoints, aisleLength, dock, includePoints) {
  const aisleMap = new Map();
  for (const pt of pickPoints) {
    if (!aisleMap.has(pt.aisle)) {
      aisleMap.set(pt.aisle, { aisle: pt.aisle, x: pt.x, zList: [] });
    }
    aisleMap.get(pt.aisle).zList.push(pt.z);
  }

  const sortedAisles = Array.from(aisleMap.values()).sort((a, b) => a.x - b.x);
  const numAisles = sortedAisles.length;

  if (numAisles === 0) {
    return { distance: 0, points: includePoints ? [{ x: dock.x, z: dock.z }] : [] };
  }

  const lastAisle = sortedAisles[numAisles - 1];
  const horizontalDist = 2 * (lastAisle.x - dock.x);
  let verticalDist = 0;

  const waypoints = includePoints ? [{ x: dock.x, z: dock.z }] : [];

  for (const aisleInfo of sortedAisles) {
    const zSorted = [...aisleInfo.zList].sort((a, b) => a - b);
    const maxZ = zSorted[zSorted.length - 1];
    verticalDist += 2 * maxZ;

    if (includePoints) {
      waypoints.push({ x: aisleInfo.x, z: 0 });
      for (const z of zSorted) {
        waypoints.push({ x: aisleInfo.x, z });
      }
      waypoints.push({ x: aisleInfo.x, z: 0 });
    }
  }

  if (includePoints) {
    waypoints.push({ x: dock.x, z: dock.z });
  }

  const totalDistance = Math.round((horizontalDist + verticalDist) * 100) / 100;
  return { distance: totalDistance, points: waypoints };
}

/**
 * Largest-gap Routing
 * Skips the largest gap between consecutive picks in an aisle.
 * If largest gap is at the back, it equals return.
 */
function routeLargestGap(layout, pickPoints, aisleLength, dock, includePoints) {
  const aisleMap = new Map();
  for (const pt of pickPoints) {
    if (!aisleMap.has(pt.aisle)) {
      aisleMap.set(pt.aisle, { aisle: pt.aisle, x: pt.x, zList: [] });
    }
    aisleMap.get(pt.aisle).zList.push(pt.z);
  }

  const sortedAisles = Array.from(aisleMap.values()).sort((a, b) => a.x - b.x);
  const numAisles = sortedAisles.length;

  if (numAisles === 0) {
    return { distance: 0, points: includePoints ? [{ x: dock.x, z: dock.z }] : [] };
  }

  const lastAisle = sortedAisles[numAisles - 1];
  const horizontalDist = 2 * (lastAisle.x - dock.x);
  let verticalDist = 0;

  const waypoints = includePoints ? [{ x: dock.x, z: dock.z }] : [];

  for (const aisleInfo of sortedAisles) {
    const sortedZ = Array.from(new Set(aisleInfo.zList)).sort((a, b) => a - b);
    const allPoints = [0, ...sortedZ, aisleLength];

    let largestGap = 0;
    let gapIndex = 0;
    for (let g = 0; g < allPoints.length - 1; g++) {
      const gap = allPoints[g + 1] - allPoints[g];
      if (gap > largestGap) {
        largestGap = gap;
        gapIndex = g;
      }
    }

    // If largest gap is at the back, picker enters and returns from front
    if (gapIndex === allPoints.length - 2) {
      const maxZ = sortedZ[sortedZ.length - 1];
      verticalDist += 2 * maxZ;
      if (includePoints) {
        waypoints.push({ x: aisleInfo.x, z: 0 });
        for (const z of sortedZ) waypoints.push({ x: aisleInfo.x, z });
        waypoints.push({ x: aisleInfo.x, z: 0 });
      }
    } else {
      // Skips largest gap: travels 2 * (L - largestGap)
      verticalDist += 2 * (aisleLength - largestGap);
      if (includePoints) {
        waypoints.push({ x: aisleInfo.x, z: 0 });
        for (const z of sortedZ) waypoints.push({ x: aisleInfo.x, z });
        waypoints.push({ x: aisleInfo.x, z: 0 });
      }
    }
  }

  if (includePoints) {
    waypoints.push({ x: dock.x, z: dock.z });
  }

  const totalDistance = Math.round((horizontalDist + verticalDist) * 100) / 100;
  return { distance: totalDistance, points: waypoints };
}

/**
 * Cached Wrapper for Optimal Bitmask DP TSP
 */
function routeOptimalCached(layout, uniqueSlotIds, pickPoints, aisleLength, dock, includePoints) {
  const cacheKey = uniqueSlotIds.join(',');
  if (!includePoints && optimalRouteCache.has(cacheKey)) {
    return optimalRouteCache.get(cacheKey);
  }

  const res = routeOptimal(layout, pickPoints, aisleLength, dock, includePoints);

  if (!includePoints) {
    optimalRouteCache.set(cacheKey, res);
  }
  return res;
}

/**
 * Optimal Routing (Bitmask DP TSP for <= 8 picks)
 */
function routeOptimal(layout, pickPoints, aisleLength, dock, includePoints) {
  const n = pickPoints.length;

  // Fallback to best heuristic if order has > 8 picks
  if (n > 8) {
    const sshape = routeSShape(layout, pickPoints, aisleLength, dock, includePoints);
    const ret = routeReturn(layout, pickPoints, aisleLength, dock, includePoints);
    const lgap = routeLargestGap(layout, pickPoints, aisleLength, dock, includePoints);

    let best = sshape;
    if (ret.distance < best.distance) best = ret;
    if (lgap.distance < best.distance) best = lgap;
    return best;
  }

  // Nodes: node 0 is dock, nodes 1..n are pick points
  const nodes = [{ x: dock.x, z: dock.z }, ...pickPoints];
  const numNodes = nodes.length;

  // Precompute pairwise distances using warehouse dist(a, b)
  const d = Array.from({ length: numNodes }, () => new Float64Array(numNodes));
  for (let i = 0; i < numNodes; i++) {
    for (let j = 0; j < numNodes; j++) {
      d[i][j] = dist(nodes[i], nodes[j], aisleLength);
    }
  }

  // DP table: dp[mask][u] = min cost starting at u having visited mask
  const totalMasks = 1 << numNodes;
  const dp = Array.from({ length: totalMasks }, () => new Float64Array(numNodes).fill(Infinity));
  const parent = Array.from({ length: totalMasks }, () => new Int16Array(numNodes).fill(-1));

  // Base state: all nodes visited, cost is distance back to dock (node 0)
  const fullMask = totalMasks - 1;
  for (let u = 0; u < numNodes; u++) {
    dp[fullMask][u] = d[u][0];
  }

  // Iterate backwards through bitmasks
  for (let mask = fullMask - 1; mask >= 1; mask--) {
    for (let u = 0; u < numNodes; u++) {
      if ((mask & (1 << u)) === 0) continue;

      let minCost = Infinity;
      let bestNext = -1;

      for (let v = 0; v < numNodes; v++) {
        if ((mask & (1 << v)) === 0) {
          const cost = d[u][v] + dp[mask | (1 << v)][v];
          if (cost < minCost) {
            minCost = cost;
            bestNext = v;
          }
        }
      }

      dp[mask][u] = minCost;
      parent[mask][u] = bestNext;
    }
  }

  const optimalDistance = Math.round(dp[1][0] * 100) / 100;

  // Reconstruct path
  const waypoints = [{ x: dock.x, z: dock.z }];
  let currMask = 1;
  let currNode = 0;

  while (true) {
    const nextNode = parent[currMask][currNode];
    if (nextNode === -1) break;
    waypoints.push(nodes[nextNode]);
    currMask |= (1 << nextNode);
    currNode = nextNode;
  }
  waypoints.push({ x: dock.x, z: dock.z });

  return {
    distance: optimalDistance,
    points: includePoints ? waypoints : []
  };
}
