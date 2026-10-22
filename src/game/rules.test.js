/**
 * Shelf Shuffle - Unit Tests for Level Configurations & Validation Rules (Person C)
 * 
 * Tests:
 * 1. Allowed moves across levels (L1 free swaps, L2 heavy on low shelves, L4 safety zones)
 * 2. Illegal moves with human-readable error messages:
 *    - Heavy on high shelves in L2, L3, L4, L5
 *    - Hazardous outside Aisle 5 in L4, L5
 *    - Fragile outside Aisle 4 in L4, L5
 * 3. The last permitted move (remaining === 1, isLastMove === true)
 * 4. Over-limit moves (movesUsed >= limit rejected with clear message)
 * 5. Remaining-moves indicator calculations
 */

import { describe, it, expect } from 'vitest';
import { LEVELS, getLevelById } from './levels.js';
import { validateMove, validateSwap, getRemainingMoves, HAZARD_AISLE, FRAGILE_AISLE } from './rules.js';

// --- Sample Fixtures ---
const heavyProduct = { id: 1, code: '71053', name: 'WHITE METAL LANTERN', weight: 'heavy', fragile: false, hazard: false };
const lightProduct = { id: 2, code: '84406B', name: 'COAT HANGER', weight: 'light', fragile: false, hazard: false };
const fragileProduct = { id: 6, code: '21730', name: 'GLASS STAR HOLDER', weight: 'light', fragile: true, hazard: false };
const hazardProduct = { id: 99, code: 'CHEM01', name: 'INDUSTRIAL SOLVENT', weight: 'medium', fragile: false, hazard: true };

const lowSlotAisle0 = { id: 0, aisle: 0, bay: 0, level: 0, zone: 'normal' };
const highSlotAisle0 = { id: 1, aisle: 0, bay: 0, level: 1, zone: 'normal' };
const lowSlotAisle4 = { id: 160, aisle: FRAGILE_AISLE, bay: 0, level: 0, zone: 'fragile' };
const highSlotAisle4 = { id: 161, aisle: FRAGILE_AISLE, bay: 0, level: 1, zone: 'fragile' };
const lowSlotAisle5 = { id: 200, aisle: HAZARD_AISLE, bay: 0, level: 0, zone: 'hazard' };
const highSlotAisle5 = { id: 201, aisle: HAZARD_AISLE, bay: 0, level: 1, zone: 'hazard' };

describe('Level Configurations & Validation Rules (Person C)', () => {
  it('Suite 1: Level 1 (Free Swaps)', () => {
    const level1 = getLevelById(1);
    expect(level1.moveLimit).toBeNull();
    
    // L1 allows heavy product on upper shelf
    const l1HeavyUpper = validateMove(highSlotAisle0, heavyProduct, level1, 0);
    expect(l1HeavyUpper.valid).toBe(true);
    
    // L1 allows hazard outside aisle 5
    const l1Hazard = validateMove(lowSlotAisle0, hazardProduct, level1, 0);
    expect(l1Hazard.valid).toBe(true);
    
    // L1 unlimited moves
    const l1Moves = getRemainingMoves(level1, 50);
    expect(l1Moves.isUnlimited).toBe(true);
    expect(l1Moves.remaining).toBe(Infinity);
  });
  it('Suite 2: Level 2 (Heavy on Low Shelves)', () => {
    const level2 = getLevelById(2);
    
    // Heavy on bottom shelf (Level 0) -> Allowed
    const l2HeavyBottom = validateMove(lowSlotAisle0, heavyProduct, level2, 0);
    expect(l2HeavyBottom.valid).toBe(true);

    // Heavy on upper shelf (Level 1) -> Illegal
    const l2HeavyUpper = validateMove(highSlotAisle0, heavyProduct, level2, 0);
    expect(l2HeavyUpper.valid).toBe(false);
    expect(l2HeavyUpper.rule).toBe('heavyOnLowShelves');
    expect(l2HeavyUpper.reason).toContain('Level 0 (bottom shelf)');

    // Light product on upper shelf -> Allowed
    const l2LightUpper = validateMove(highSlotAisle0, lightProduct, level2, 0);
    expect(l2LightUpper.valid).toBe(true);

    // Hazard item in Aisle 0 -> Allowed (hazard rule not active in L2)
    const l2Hazard = validateMove(lowSlotAisle0, hazardProduct, level2, 0);
    expect(l2Hazard.valid).toBe(true);
  });

  it('Suite 3: Level 3 (10-Move Limit + Heavy Restriction)', () => {
    const level3 = getLevelById(3);
    expect(level3.moveLimit).toBe(10);

    // Move 0 -> Allowed
    const l3Move0 = validateMove(lowSlotAisle0, lightProduct, level3, 0);
    expect(l3Move0.valid).toBe(true);

    // Last Permitted Move check (movesUsed === 9)
    const l3StatusLast = getRemainingMoves(level3, 9);
    expect(l3StatusLast.remaining).toBe(1);
    expect(l3StatusLast.isLastMove).toBe(true);
    expect(l3StatusLast.isOverLimit).toBe(false);
    expect(l3StatusLast.label).toContain('Final move remaining');
    
    const l3MoveLast = validateMove(lowSlotAisle0, lightProduct, level3, 9);
    expect(l3MoveLast.valid).toBe(true);

    // Over-limit move check (movesUsed === 10)
    const l3StatusOver = getRemainingMoves(level3, 10);
    expect(l3StatusOver.remaining).toBe(0);
    expect(l3StatusOver.isOverLimit).toBe(true);

    const l3MoveOver = validateMove(lowSlotAisle0, lightProduct, level3, 10);
    expect(l3MoveOver.valid).toBe(false);
    expect(l3MoveOver.rule).toBe('moveLimit');
    expect(l3MoveOver.reason).toContain('Move limit reached');
  });

  it('Suite 4: Level 4 (Zone Rules + 15-Move Limit)', () => {
    const level4 = getLevelById(4);
    expect(level4.moveLimit).toBe(15);
    expect(level4.rules.hazardZone).toBe(true);
    expect(level4.rules.fragileZone).toBe(true);

    // Hazard item in Aisle 5 -> Allowed
    const l4HazardCorrect = validateMove(lowSlotAisle5, hazardProduct, level4, 0);
    expect(l4HazardCorrect.valid).toBe(true);

    // Hazard item outside Aisle 5 (e.g. Aisle 0) -> Illegal
    const l4HazardWrong = validateMove(lowSlotAisle0, hazardProduct, level4, 0);
    expect(l4HazardWrong.valid).toBe(false);
    expect(l4HazardWrong.rule).toBe('hazardZone');
    expect(l4HazardWrong.reason).toContain(`Hazard Zone (Aisle ${HAZARD_AISLE})`);

    // Fragile item in Aisle 4 -> Allowed
    const l4FragileCorrect = validateMove(lowSlotAisle4, fragileProduct, level4, 0);
    expect(l4FragileCorrect.valid).toBe(true);

    // Fragile item outside Aisle 4 (e.g. Aisle 0) -> Illegal
    const l4FragileWrong = validateMove(lowSlotAisle0, fragileProduct, level4, 0);
    expect(l4FragileWrong.valid).toBe(false);
    expect(l4FragileWrong.rule).toBe('fragileZone');
    expect(l4FragileWrong.reason).toContain(`Fragile Zone (Aisle ${FRAGILE_AISLE})`);

    // Heavy product on high shelf in Aisle 4 -> Illegal (heavy restriction still applies)
    const l4HeavyHigh = validateMove(highSlotAisle4, heavyProduct, level4, 0);
    expect(l4HeavyHigh.valid).toBe(false);
    expect(l4HeavyHigh.rule).toBe('heavyOnLowShelves');

    // Move limit boundaries for Level 4
    const l4Status14 = getRemainingMoves(level4, 14);
    expect(l4Status14.isLastMove).toBe(true);
    expect(validateMove(lowSlotAisle0, lightProduct, level4, 14).valid).toBe(true);
    
    const l4Status15 = getRemainingMoves(level4, 15);
    expect(l4Status15.isOverLimit).toBe(true);
    expect(validateMove(lowSlotAisle0, lightProduct, level4, 15).valid).toBe(false);
  });

  it('Suite 5: Level 5 (Seasonal Demand: 5 Moves/Month)', () => {
    const level5 = getLevelById(5);
    expect(level5.moveLimit).toBe(5);
    expect(level5.rules.movesPerMonth).toBe(5);

    const l5Status4 = getRemainingMoves(level5, 4);
    expect(l5Status4.isLastMove).toBe(true);
    expect(validateMove(lowSlotAisle0, lightProduct, level5, 4).valid).toBe(true);

    const l5Status5 = getRemainingMoves(level5, 5);
    expect(l5Status5.isOverLimit).toBe(true);
    expect(validateMove(lowSlotAisle0, lightProduct, level5, 5).valid).toBe(false);
  });

  it('Suite 6: Swap Validation', () => {
    const level2 = getLevelById(2);
    const swapCheck = validateSwap(lowSlotAisle0, heavyProduct, highSlotAisle0, lightProduct, level2, 0);
    expect(swapCheck.valid).toBe(false);
    expect(swapCheck.rule).toBe('heavyOnLowShelves');
  });
});
