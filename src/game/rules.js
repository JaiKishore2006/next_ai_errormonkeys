/**
 * Shelf Shuffle - Level Rules & Move Validation (Person C)
 * 
 * Enforces warehouse geometry rules, weight restrictions, safety zones,
 * and move budgets according to the team contract (docs/CONTRACTS.md).
 * 
 * Rules Contract:
 * - Hazard Zone: Aisle 5
 * - Fragile Zone: Aisle 4
 * - Bottom Shelf: Level 0
 * - Upper Shelf: Level 1
 */

export const HAZARD_AISLE = 5;
export const FRAGILE_AISLE = 4;
export const LOW_SHELF_LEVEL = 0;

/**
 * Calculates remaining move indicators for a given level and usage.
 * 
 * @param {Object} level - Level configuration object
 * @param {number} movesUsed - Current number of moves executed
 * @returns {Object} Remaining moves status
 */
export function getRemainingMoves(level, movesUsed = 0) {
  if (!level || level.moveLimit === null || level.moveLimit === undefined) {
    return {
      isUnlimited: true,
      limit: null,
      used: movesUsed,
      remaining: Infinity,
      isLastMove: false,
      isOverLimit: false,
      label: `${movesUsed} moves used (Unlimited budget)`
    };
  }

  const limit = level.moveLimit;
  const remaining = Math.max(0, limit - movesUsed);
  const isLastMove = remaining === 1;
  const isOverLimit = movesUsed >= limit;

  let statusLabel = `${movesUsed} / ${limit} used (${remaining} remaining)`;
  if (isOverLimit) {
    statusLabel = `Budget exhausted (${limit}/${limit} moves used)`;
  } else if (isLastMove) {
    statusLabel = `⚠ Final move remaining! (${movesUsed}/${limit})`;
  }

  return {
    isUnlimited: false,
    limit,
    used: movesUsed,
    remaining,
    isLastMove,
    isOverLimit,
    label: statusLabel
  };
}

/**
 * Validates a single product move into a target slot under the active level rules.
 * 
 * @param {Object} slot - Target slot { id, aisle, bay, level, zone }
 * @param {Object} product - Product to place { id, code, name, weight, fragile, hazard }
 * @param {Object} level - Active level configuration
 * @param {number} [movesUsed=0] - Number of moves already used
 * @returns {{ valid: boolean, reason: string | null, rule: string | null }}
 */
export function validateMove(slot, product, level, movesUsed = 0) {
  if (!level) {
    return { valid: true, reason: null, rule: null };
  }

  // 1. Move budget limit check
  if (level.moveLimit !== null && level.moveLimit !== undefined) {
    if (movesUsed >= level.moveLimit) {
      return {
        valid: false,
        reason: `Move limit reached: You have exhausted all ${level.moveLimit} permitted moves for ${level.name}.`,
        rule: 'moveLimit'
      };
    }
  }

  if (!product || !slot) {
    return { valid: true, reason: null, rule: null };
  }

  const productName = product.name || product.code || `SKU #${product.id}`;
  const slotLevel = slot.level ?? (slot.id % 2); // Default 0 or 1 if unspecified

  // 2. Heavy products on low shelves (Level 0)
  if (level.rules?.heavyOnLowShelves) {
    const isHeavy = product.weight === 'heavy';
    if (isHeavy && slotLevel !== LOW_SHELF_LEVEL) {
      return {
        valid: false,
        reason: `Illegal move: Heavy product '${productName}' cannot be placed on upper shelf Level ${slotLevel}. Heavy products must be slotted on Level 0 (bottom shelf) for safety.`,
        rule: 'heavyOnLowShelves'
      };
    }
  }

  // 3. Hazard Zone Restriction (Aisle 5)
  if (level.rules?.hazardZone) {
    const isHazard = Boolean(product.hazard);
    const isHazardSlot = slot.aisle === HAZARD_AISLE || slot.zone === 'hazard';

    if (isHazard && !isHazardSlot) {
      return {
        valid: false,
        reason: `Illegal move: Hazardous product '${productName}' cannot be stored in Aisle ${slot.aisle}. Hazardous items must be stored exclusively in the Hazard Zone (Aisle ${HAZARD_AISLE}).`,
        rule: 'hazardZone'
      };
    }
  }

  // 4. Fragile Zone Restriction (Aisle 4)
  if (level.rules?.fragileZone) {
    const isFragile = Boolean(product.fragile);
    const isFragileSlot = slot.aisle === FRAGILE_AISLE || slot.zone === 'fragile';

    if (isFragile && !isFragileSlot) {
      return {
        valid: false,
        reason: `Illegal move: Fragile product '${productName}' cannot be stored in Aisle ${slot.aisle}. Fragile items must be stored exclusively in the Fragile Zone (Aisle ${FRAGILE_AISLE}).`,
        rule: 'fragileZone'
      };
    }
  }

  return { valid: true, reason: null, rule: null };
}

/**
 * Validates a swap between two slots, which may involve moving productA to slotB
 * and moving productB (if occupied) to slotA.
 * 
 * @param {Object} slotA - Source slot
 * @param {Object} productA - Product currently in slotA
 * @param {Object} slotB - Target slot
 * @param {Object} [productB=null] - Product currently in slotB (if any)
 * @param {Object} level - Active level configuration
 * @param {number} [movesUsed=0] - Number of moves already used
 * @returns {{ valid: boolean, reason: string | null, rule: string | null }}
 */
export function validateSwap(slotA, productA, slotB, productB, level, movesUsed = 0) {
  // Validate move of productA into slotB
  const checkA = validateMove(slotB, productA, level, movesUsed);
  if (!checkA.valid) {
    return checkA;
  }

  // If slotB is occupied by productB, validate displacement of productB into slotA
  if (productB) {
    const checkB = validateMove(slotA, productB, level, movesUsed);
    if (!checkB.valid) {
      return {
        valid: false,
        reason: `Swap rejected: ${checkB.reason}`,
        rule: checkB.rule
      };
    }
  }

  return { valid: true, reason: null, rule: null };
}

/**
 * Adapter helper to check legality against Person B's engine.isLegal if loaded.
 * 
 * @param {Object} engine - Person B's engine module
 * @param {Object} layout - Warehouse layout object
 * @param {Object} product - Product object
 * @param {number} slotId - Slot identifier
 * @param {Object} rules - Level rules
 * @returns {boolean | null} Engine judgment or null if engine not present
 */
export function verifyWithEngine(engine, layout, product, slotId, rules) {
  if (engine && typeof engine.isLegal === 'function') {
    try {
      return engine.isLegal(layout, product, slotId, rules);
    } catch (err) {
      console.warn('[Rules] engine.isLegal threw an error:', err);
      return null;
    }
  }
  return null;
}
