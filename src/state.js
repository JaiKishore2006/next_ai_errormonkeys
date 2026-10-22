/**
 * Shelf Shuffle - Central State Store (Person C)
 * 
 * Manages game progression, move budget, optimizer metrics display,
 * cost analysis variables, and UI status banners.
 * All metrics default to clearly labeled mock data until Person B's engine connects.
 */

export const LEVELS = [
  {
    id: 1,
    name: 'Level 1: Fast-Moving Essentials',
    subtitle: 'High-frequency slotting basics',
    description: 'Rearrange high-velocity goods closer to the loading dock to reduce total picker walking distance.',
    rules: [
      'Loading dock is located at coordinates (0, 0)',
      'Walking speed: 1.2 m/s • Pick time: 12 s/item',
      'Target: slot top 10% high-velocity items in Aisles 0 & 1'
    ],
    moveLimit: 10,
    targetSavings: '15%'
  },
  {
    id: 2,
    name: 'Level 2: Hazard Isolation',
    subtitle: 'Safety zoning constraints',
    description: 'Optimize travel routes while strictly complying with warehouse hazardous materials isolation.',
    rules: [
      'Hazard Zone is strictly restricted to Aisle 5',
      'Hazardous items must NOT be stored in Aisles 0–4',
      'Engine will reject illegal moves outside Aisle 5'
    ],
    moveLimit: 8,
    targetSavings: '20%'
  },
  {
    id: 3,
    name: 'Level 3: Fragile & Affinity Pairings',
    subtitle: 'Co-occurrence & delicate handling',
    description: 'Group frequently ordered product pairs together while isolating fragile items in their designated zone.',
    rules: [
      'Fragile goods must be slotted in Aisle 4 only',
      'Frequently co-ordered items should share adjacent bays',
      'Heavy items restricted to lower shelf level 0'
    ],
    moveLimit: 12,
    targetSavings: '25%'
  }
];

const initialState = {
  currentLevelId: 1,
  movesUsed: 0,
  moveHistory: [],
  metrics: {
    // Clearly marked dev mock data until Person B engine delivers live calculations
    originalDistance: 1420.5,
    playerDistance: 1264.0,
    baselineDistance: 1136.4,
    savingsPct: 11.0,
    isMockData: true,
    lastCalculatedAt: new Date().toISOString()
  },
  cost: {
    hourlyWage: 25.00,
    dailyOrders: 180,
    workingDaysPerYear: 260,
    walkingSpeedMps: 1.2,
    pickTimePerItemSec: 12
  },
  viewport: {
    cameraPreset: 'isometric', // 'isometric' | 'top-down' | 'aisle'
    colorMode: 'velocity',     // 'velocity' | 'category' | 'zone'
    selectedSlot: null         // { slotId, aisle, bay, level, product }
  },
  uiStatus: {
    status: 'ready',           // 'ready' | 'loading' | 'error' | 'empty'
    message: '',
    isMockDataActive: true,
    engineConnected: false,
    sceneConnected: false
  }
};

class Store {
  constructor() {
    this.state = { ...initialState };
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[Store] Error in subscriber callback:', err);
      }
    }
  }

  setState(updater) {
    const nextPartial = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = {
      ...this.state,
      ...nextPartial
    };
    this.notify();
  }

  // --- Action Helpers ---

  setLevel(levelId) {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return;

    this.setState({
      currentLevelId: levelId,
      movesUsed: 0,
      moveHistory: [],
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Switched to ${level.name}`
      }
    });
  }

  getCurrentLevel() {
    return LEVELS.find(l => l.id === this.state.currentLevelId) || LEVELS[0];
  }

  recordMove(moveDesc = 'Swapped slots') {
    const level = this.getCurrentLevel();
    if (this.state.movesUsed >= level.moveLimit) {
      this.setState({
        uiStatus: {
          ...this.state.uiStatus,
          status: 'error',
          message: `Move limit reached (${level.moveLimit} moves). Reset or undo to try another layout.`
        }
      });
      return false;
    }

    const prevMoves = this.state.movesUsed;
    const history = [...this.state.moveHistory, { moveNum: prevMoves + 1, desc: moveDesc }];

    // Simulate minor metric improvement with mock data
    const simulatedDist = Math.max(900, Math.round((this.state.metrics.playerDistance - 18.5) * 10) / 10);
    const orig = this.state.metrics.originalDistance;
    const savings = Math.max(0, Math.round(((orig - simulatedDist) / orig) * 1000) / 10);

    this.setState({
      movesUsed: prevMoves + 1,
      moveHistory: history,
      metrics: {
        ...this.state.metrics,
        playerDistance: simulatedDist,
        savingsPct: savings,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Move ${prevMoves + 1} recorded: ${moveDesc}`
      }
    });
    return true;
  }

  undoMove() {
    if (this.state.movesUsed <= 0 || this.state.moveHistory.length === 0) {
      this.setState({
        uiStatus: {
          ...this.state.uiStatus,
          status: 'ready',
          message: 'No moves to undo.'
        }
      });
      return false;
    }

    const newHistory = [...this.state.moveHistory];
    const undone = newHistory.pop();
    const newMoves = this.state.movesUsed - 1;

    // Slightly revert simulated distance
    const revertedDist = Math.min(this.state.metrics.originalDistance, Math.round((this.state.metrics.playerDistance + 18.5) * 10) / 10);
    const orig = this.state.metrics.originalDistance;
    const savings = Math.max(0, Math.round(((orig - revertedDist) / orig) * 1000) / 10);

    this.setState({
      movesUsed: newMoves,
      moveHistory: newHistory,
      metrics: {
        ...this.state.metrics,
        playerDistance: revertedDist,
        savingsPct: savings
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: `Undid: ${undone.desc}`
      }
    });
    return true;
  }

  resetLayout() {
    this.setState({
      movesUsed: 0,
      moveHistory: [],
      metrics: {
        ...this.state.metrics,
        playerDistance: this.state.metrics.originalDistance,
        savingsPct: 0.0,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: 'Layout reset to initial arrangement.'
      }
    });
  }

  loadBaseline() {
    this.setState({
      metrics: {
        ...this.state.metrics,
        playerDistance: this.state.metrics.baselineDistance,
        savingsPct: Math.round(((this.state.metrics.originalDistance - this.state.metrics.baselineDistance) / this.state.metrics.originalDistance) * 1000) / 10,
        lastCalculatedAt: new Date().toISOString()
      },
      uiStatus: {
        ...this.state.uiStatus,
        status: 'ready',
        message: 'Loaded automated baseline assignment.'
      }
    });
  }

  updateCost(key, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;

    this.setState({
      cost: {
        ...this.state.cost,
        [key]: num
      }
    });
  }

  setCameraPreset(preset) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        cameraPreset: preset
      }
    });
  }

  setColorMode(mode) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        colorMode: mode
      }
    });
  }

  selectSlot(slotInfo) {
    this.setState({
      viewport: {
        ...this.state.viewport,
        selectedSlot: slotInfo
      }
    });
  }

  setUIStatus(status, message = '') {
    this.setState({
      uiStatus: {
        ...this.state.uiStatus,
        status,
        message
      }
    });
  }
}

export const store = new Store();
