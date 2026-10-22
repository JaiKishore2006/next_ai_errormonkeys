/**
 * Warehouse Geometry and Distance Calculations
 * Fixed rules:
 * - 6 aisles, aisle length = 18m
 * - Dock at (0, 0)
 * - Movement strictly follows aisles and cross-aisles (z=0 and z=18)
 */

export function slotPoint(layout, slotId) {
  const slot = layout.slots[slotId] ?? layout.slots.find((s) => s.id === slotId);
  if (!slot) {
    return { x: 0, z: 0, aisle: 0 };
  }
  return { x: slot.x, z: slot.z, aisle: slot.aisle };
}

export function dist(a, b, aisleLength = 18) {
  if (a.x === b.x) {
    return Math.abs(a.z - b.z);
  }
  const frontDist = a.z + b.z;
  const backDist = (aisleLength - a.z) + (aisleLength - b.z);
  return Math.min(frontDist, backDist) + Math.abs(a.x - b.x);
}

export function dockToSlot(slot) {
  return slot.x + slot.z;
}
