import { describe, it, expect } from 'vitest';
import { slotPoint, dist, dockToSlot } from '../src/engine/geometry.js';
import mockLayout from '../public/data/mock/layout.json';

describe('Geometry & Distance Tests', () => {
  it('slotPoint accurately retrieves coordinates', () => {
    const pt0 = slotPoint(mockLayout, 0);
    expect(pt0).toEqual({ x: 3, z: 2.25, aisle: 0 });

    const pt20 = slotPoint(mockLayout, 20);
    expect(pt20).toEqual({ x: 8, z: 2.25, aisle: 1 });
  });

  it('dist satisfies symmetry', () => {
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
    // Front: 2.0 + 3.0 = 5.0; Back: (18-2) + (18-3) = 31.0; Horizontal: |3-8| = 5.0 -> Total = 10.0
    expect(dist(p1, p2)).toBe(10.0);
  });

  it('dist routes via back cross-aisle (z=18) when shorter', () => {
    const p1 = { x: 3, z: 16.0 };
    const p2 = { x: 8, z: 17.0 };
    // Front: 16 + 17 = 33.0; Back: 2 + 1 = 3.0; Horizontal: 5.0 -> Total = 8.0
    expect(dist(p1, p2)).toBe(8.0);
  });

  it('dockToSlot computes distance from (0,0)', () => {
    expect(dockToSlot({ x: 3, z: 2.25 })).toBe(5.25);
  });
});
