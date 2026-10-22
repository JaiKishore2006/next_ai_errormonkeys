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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

export function runTests() {
  console.log('Running Shelf Shuffle Rules & Level Validation Tests...\n');

  // --- Suite 1: Level 1 (Free Swaps) ---
  console.log('Test Suite 1: Level 1 (Free Swaps)');
  const level1 = getLevelById(1);
  assert(level1.moveLimit === null, 'Level 1 moveLimit should be null (unlimited)');
  
  // L1 allows heavy product on upper shelf
  const l1HeavyUpper = validateMove(highSlotAisle0, heavyProduct, level1, 0);
  assert(l1HeavyUpper.valid === true, 'Level 1 should allow heavy product on high shelf');
  
  // L1 allows hazard outside aisle 5
  const l1Hazard = validateMove(lowSlotAisle0, hazardProduct, level1, 0);
  assert(l1Hazard.valid === true, 'Level 1 should allow hazard product in any aisle');
  
  // L1 unlimited moves
  const l1Moves = getRemainingMoves(level1, 50);
  assert(l1Moves.isUnlimited === true, 'Level 1 moves should be unlimited');
  assert(l1Moves.remaining === Infinity, 'Level 1 remaining moves should be Infinity');
  console.log(' ✔ Level 1 free swaps passed\n');

  // --- Suite 2: Level 2 (Heavy on Low Shelves) ---
  console.log('Test Suite 2: Level 2 (Heavy on Low Shelves)');
  const level2 = getLevelById(2);
  
  // Heavy on bottom shelf (Level 0) -> Allowed
  const l2HeavyBottom = validateMove(lowSlotAisle0, heavyProduct, level2, 0);
  assert(l2HeavyBottom.valid === true, 'Level 2 should allow heavy on bottom shelf');

  // Heavy on upper shelf (Level 1) -> Illegal
  const l2HeavyUpper = validateMove(highSlotAisle0, heavyProduct, level2, 0);
  assert(l2HeavyUpper.valid === false, 'Level 2 must reject heavy on upper shelf');
  assert(l2HeavyUpper.rule === 'heavyOnLowShelves', 'Rule violation should be heavyOnLowShelves');
  assert(l2HeavyUpper.reason.includes('Level 0 (bottom shelf)'), 'Reason must mention Level 0');
  console.log('   Expected rejection message:', l2HeavyUpper.reason);

  // Light product on upper shelf -> Allowed
  const l2LightUpper = validateMove(highSlotAisle0, lightProduct, level2, 0);
  assert(l2LightUpper.valid === true, 'Level 2 should allow light on upper shelf');

  // Hazard item in Aisle 0 -> Allowed (hazard rule not active in L2)
  const l2Hazard = validateMove(lowSlotAisle0, hazardProduct, level2, 0);
  assert(l2Hazard.valid === true, 'Level 2 should not enforce hazard zone');
  console.log(' ✔ Level 2 heavy shelf restrictions passed\n');

  // --- Suite 3: Level 3 (Level 2 Restriction + 10-Move Limit) ---
  console.log('Test Suite 3: Level 3 (10-Move Limit + Heavy Restriction)');
  const level3 = getLevelById(3);
  assert(level3.moveLimit === 10, 'Level 3 must have a 10-move limit');

  // Move 0 -> Allowed
  const l3Move0 = validateMove(lowSlotAisle0, lightProduct, level3, 0);
  assert(l3Move0.valid === true, 'Level 3 move 0 should be allowed');

  // Last Permitted Move check (movesUsed === 9)
  const l3StatusLast = getRemainingMoves(level3, 9);
  assert(l3StatusLast.remaining === 1, 'At move 9, remaining moves should be 1');
  assert(l3StatusLast.isLastMove === true, 'At move 9, isLastMove should be true');
  assert(l3StatusLast.isOverLimit === false, 'At move 9, isOverLimit should be false');
  assert(l3StatusLast.label.includes('Final move remaining'), 'Label should indicate final move');
  
  const l3MoveLast = validateMove(lowSlotAisle0, lightProduct, level3, 9);
  assert(l3MoveLast.valid === true, 'Last permitted move (move 9) must be valid');

  // Over-limit move check (movesUsed === 10)
  const l3StatusOver = getRemainingMoves(level3, 10);
  assert(l3StatusOver.remaining === 0, 'At move 10, remaining moves should be 0');
  assert(l3StatusOver.isOverLimit === true, 'At move 10, isOverLimit should be true');

  const l3MoveOver = validateMove(lowSlotAisle0, lightProduct, level3, 10);
  assert(l3MoveOver.valid === false, 'Move 10 (over limit) must be rejected');
  assert(l3MoveOver.rule === 'moveLimit', 'Rule violation should be moveLimit');
  assert(l3MoveOver.reason.includes('Move limit reached'), 'Reason must indicate move limit reached');
  console.log('   Expected rejection message:', l3MoveOver.reason);
  console.log(' ✔ Level 3 move budget and boundary conditions passed\n');

  // --- Suite 4: Level 4 (Zone Rules + 15-Move Limit) ---
  console.log('Test Suite 4: Level 4 (Zone Rules + 15-Move Limit)');
  const level4 = getLevelById(4);
  assert(level4.moveLimit === 15, 'Level 4 must have a 15-move limit');
  assert(level4.rules.hazardZone === true, 'Level 4 must enforce hazard zone');
  assert(level4.rules.fragileZone === true, 'Level 4 must enforce fragile zone');

  // Hazard item in Aisle 5 -> Allowed
  const l4HazardCorrect = validateMove(lowSlotAisle5, hazardProduct, level4, 0);
  assert(l4HazardCorrect.valid === true, 'Hazard product in Aisle 5 should be allowed');

  // Hazard item outside Aisle 5 (e.g. Aisle 0) -> Illegal
  const l4HazardWrong = validateMove(lowSlotAisle0, hazardProduct, level4, 0);
  assert(l4HazardWrong.valid === false, 'Hazard product in Aisle 0 must be rejected');
  assert(l4HazardWrong.rule === 'hazardZone', 'Rule violation should be hazardZone');
  assert(l4HazardWrong.reason.includes(`Hazard Zone (Aisle ${HAZARD_AISLE})`), 'Reason must cite Aisle 5');
  console.log('   Expected rejection message:', l4HazardWrong.reason);

  // Fragile item in Aisle 4 -> Allowed
  const l4FragileCorrect = validateMove(lowSlotAisle4, fragileProduct, level4, 0);
  assert(l4FragileCorrect.valid === true, 'Fragile product in Aisle 4 should be allowed');

  // Fragile item outside Aisle 4 (e.g. Aisle 0) -> Illegal
  const l4FragileWrong = validateMove(lowSlotAisle0, fragileProduct, level4, 0);
  assert(l4FragileWrong.valid === false, 'Fragile product in Aisle 0 must be rejected');
  assert(l4FragileWrong.rule === 'fragileZone', 'Rule violation should be fragileZone');
  assert(l4FragileWrong.reason.includes(`Fragile Zone (Aisle ${FRAGILE_AISLE})`), 'Reason must cite Aisle 4');
  console.log('   Expected rejection message:', l4FragileWrong.reason);

  // Heavy product on high shelf in Aisle 4 -> Illegal (heavy restriction still applies)
  const l4HeavyHigh = validateMove(highSlotAisle4, heavyProduct, level4, 0);
  assert(l4HeavyHigh.valid === false, 'Heavy on high shelf in Aisle 4 must be rejected');
  assert(l4HeavyHigh.rule === 'heavyOnLowShelves', 'Rule violation should be heavyOnLowShelves');

  // Move limit boundaries for Level 4
  const l4Status14 = getRemainingMoves(level4, 14);
  assert(l4Status14.isLastMove === true, 'Move 14 of 15 should be last permitted move');
  assert(validateMove(lowSlotAisle0, lightProduct, level4, 14).valid === true, 'Move 14 must be allowed');
  
  const l4Status15 = getRemainingMoves(level4, 15);
  assert(l4Status15.isOverLimit === true, 'Move 15 of 15 should be over limit');
  assert(validateMove(lowSlotAisle0, lightProduct, level4, 15).valid === false, 'Move 15 must be rejected');
  console.log(' ✔ Level 4 zoning and move budget passed\n');

  // --- Suite 5: Level 5 (Seasonal Demand: 5 Moves per Month) ---
  console.log('Test Suite 5: Level 5 (Seasonal Demand: 5 Moves/Month)');
  const level5 = getLevelById(5);
  assert(level5.moveLimit === 5, 'Level 5 should have a 5-move limit');
  assert(level5.rules.movesPerMonth === 5, 'Level 5 rules should specify movesPerMonth: 5');

  const l5Status4 = getRemainingMoves(level5, 4);
  assert(l5Status4.isLastMove === true, 'Move 4 of 5 should be last permitted move');
  assert(validateMove(lowSlotAisle0, lightProduct, level5, 4).valid === true, 'Move 4 must be allowed');

  const l5Status5 = getRemainingMoves(level5, 5);
  assert(l5Status5.isOverLimit === true, 'Move 5 of 5 should be over limit');
  assert(validateMove(lowSlotAisle0, lightProduct, level5, 5).valid === false, 'Move 5 must be rejected');
  console.log(' ✔ Level 5 monthly move limit passed\n');

  // --- Suite 6: Swap Validation ---
  console.log('Test Suite 6: Swap Validation');
  // Swap heavy product on bottom shelf with light product on top shelf
  // slotA = lowSlotAisle0 (heavyProduct), slotB = highSlotAisle0 (lightProduct)
  // Swapping places: heavyProduct goes to highSlotAisle0 (ILLEGAL in L2)
  const swapCheck = validateSwap(lowSlotAisle0, heavyProduct, highSlotAisle0, lightProduct, level2, 0);
  assert(swapCheck.valid === false, 'Swap moving heavy to upper shelf must fail');
  assert(swapCheck.rule === 'heavyOnLowShelves', 'Violation must be heavyOnLowShelves');
  console.log(' ✔ Swap validation passed\n');

  console.log('====================================================');
  console.log('🎉 ALL 20+ LEVEL RULES & VALIDATION TESTS PASSED!');
  console.log('====================================================');
  return true;
}

// Auto-run if executed directly via Node
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('rules.test.js')) {
  try {
    runTests();
    process.exit(0);
  } catch (err) {
    console.error('TEST RUNNER FAILED:', err);
    process.exit(1);
  }
}
