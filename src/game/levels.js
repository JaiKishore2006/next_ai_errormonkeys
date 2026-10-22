/**
 * Shelf Shuffle - Level Configurations (Person C)
 * 
 * Defines the five agreed levels with their specific operational rules,
 * move budgets, and constraint flags.
 */

export const LEVELS = [
  {
    id: 1,
    name: 'Level 1: Free Swaps',
    subtitle: 'Unrestricted slotting exploration',
    description: 'Experiment freely with product slotting to understand warehouse travel paths. No move restrictions or zoning rules apply.',
    moveLimit: null, // Unlimited moves
    rules: {
      heavyOnLowShelves: false,
      hazardZone: false,
      fragileZone: false,
      movesPerMonth: null
    },
    ruleDescriptions: [
      'Loading dock is located at coordinates (0, 0)',
      'Walking speed: 1.2 m/s • Pick time: 12 s/item',
      'Unlimited moves: freely test different bay arrangements'
    ],
    targetSavings: '5%'
  },
  {
    id: 2,
    name: 'Level 2: Heavy on Low Shelves',
    subtitle: 'Ergonomic & weight restrictions',
    description: 'Heavy products must be slotted exclusively on lower shelves (Level 0) for warehouse ergonomics and safety.',
    moveLimit: null, // Unlimited moves
    rules: {
      heavyOnLowShelves: true,
      hazardZone: false,
      fragileZone: false,
      movesPerMonth: null
    },
    ruleDescriptions: [
      'Heavy products (weight: "heavy") MUST be stored on Level 0 (bottom shelf)',
      'Upper shelf (Level 1) is restricted to medium and light products',
      'Unlimited moves: refine placement while observing weight constraints'
    ],
    targetSavings: '6%'
  },
  {
    id: 3,
    name: 'Level 3: Move Budget (10 Moves)',
    subtitle: 'Heavy restriction with 10-move budget',
    description: 'Maintain the Level 2 heavy item restriction while achieving maximum picker distance reduction within a strict 10-move budget.',
    moveLimit: 10,
    rules: {
      heavyOnLowShelves: true,
      hazardZone: false,
      fragileZone: false,
      movesPerMonth: null
    },
    ruleDescriptions: [
      'Heavy products MUST be stored on bottom shelf (Level 0)',
      'Strict budget: Maximum 10 moves allowed',
      'Prioritize relocating high-velocity items to maximize savings per move'
    ],
    targetSavings: '7%'
  },
  {
    id: 4,
    name: 'Level 4: Safety & Fragile Zones (15 Moves)',
    subtitle: 'Full warehouse safety zoning',
    description: 'Enforce full safety zoning: hazardous chemicals restricted to Aisle 5, fragile goods to Aisle 4, and heavy items to low shelves, within 15 moves.',
    moveLimit: 15,
    rules: {
      heavyOnLowShelves: true,
      hazardZone: true,   // Aisle 5
      fragileZone: true,  // Aisle 4
      movesPerMonth: null
    },
    ruleDescriptions: [
      'Hazardous goods MUST be stored exclusively in Aisle 5',
      'Fragile goods MUST be stored exclusively in Aisle 4',
      'Heavy products MUST be stored on bottom shelf (Level 0)',
      'Strict budget: Maximum 15 moves allowed'
    ],
    targetSavings: '7.5%'
  },
  {
    id: 5,
    name: 'Level 5: Seasonal Demand',
    subtitle: 'Dynamic monthly budget (5 moves/month)',
    description: 'Adapt warehouse layout across shifting seasonal order profiles with an allocation of 5 moves per monthly cycle while observing all safety zones.',
    moveLimit: 5, // 5 moves per month
    rules: {
      heavyOnLowShelves: true,
      hazardZone: true,   // Aisle 5
      fragileZone: true,  // Aisle 4
      movesPerMonth: 5
    },
    ruleDescriptions: [
      'All Level 4 zoning and weight restrictions apply',
      'Monthly allocation: Exactly 5 moves per monthly cycle',
      'Anticipate demand shifts to minimize re-slotting churn'
    ],
    targetSavings: '8%'
  }
];

export function getLevelById(id) {
  return LEVELS.find(l => l.id === id) || LEVELS[0];
}
