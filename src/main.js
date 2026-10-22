/**
 * Shelf Shuffle - Main Application Entrypoint
 * Integrates Person C's modular UI shell with Person A's 3D Three.js warehouse digital twin.
 */

import './style.css';
import { store } from './state.js';
import { renderHeader } from './ui/header.js';
import { renderLevelNav } from './ui/levelNav.js';
import { renderViewport } from './ui/viewport.js';
import { renderResultsPanel } from './ui/resultsPanel.js';
import { renderCostPanel } from './ui/costPanel.js';
import { renderStatusBanners } from './ui/statusBanners.js';

import {
  initScene,
  setAssignment,
  setColorMode,
  setCameraPreset,
  playOrders,
  on as onSceneEvent
} from './scene/scene.js';

// Realistic product catalog matching retail dataset contracts
const INITIAL_PRODUCTS = [
  { id: 0, code: '85123A', name: 'WHITE HANGING HEART T-LIGHT HOLDER', freq: 230, weight: 2.5, heavy: false, fragile: false, hazard: false, originalSlot: 1 },
  { id: 1, code: '71053', name: 'WHITE METAL LANTERN (HEAVY)', freq: 180, weight: 18, heavy: true, fragile: false, hazard: false, originalSlot: 0 },
  { id: 2, code: '84406B', name: 'CREAM CUPID HEARTS COAT HANGER', freq: 160, weight: 1.2, heavy: false, fragile: false, hazard: false, originalSlot: 3 },
  { id: 3, code: '84029G', name: 'KNITTED UNION FLAG WATER BOTTLE', freq: 150, weight: 16, heavy: true, fragile: false, hazard: false, originalSlot: 2 },
  { id: 4, code: '84029E', name: 'RED WOOLLY HOTTIE WHITE HEART', freq: 140, weight: 2.1, heavy: false, fragile: false, hazard: false, originalSlot: 5 },
  { id: 5, code: '22752', name: 'SET 7 BABUSHKA NESTING BOXES', freq: 125, weight: 20, heavy: true, fragile: false, hazard: false, originalSlot: 4 },
  { id: 6, code: '21730', name: 'GLASS STAR FROSTED T-LIGHT HOLDER', freq: 110, weight: 0.8, heavy: false, fragile: true, hazard: false, originalSlot: 160 },
  { id: 7, code: '22633', name: 'HAND WARMER UNION JACK', freq: 95, weight: 0.3, heavy: false, fragile: false, hazard: false, originalSlot: 7 },
  { id: 8, code: '22632', name: 'HAND WARMER RED RETROSPOT', freq: 85, weight: 0.3, heavy: false, fragile: false, hazard: false, originalSlot: 6 },
  { id: 9, code: '84997D', name: 'CHILDRENS CUTLERY POLKADOT PINK', freq: 70, weight: 1.4, heavy: false, fragile: true, hazard: false, originalSlot: 162 },
  { id: 10, code: 'CHEM-01', name: 'INDUSTRIAL FLAMMABLE CLEANER 5L', freq: 45, weight: 5.0, heavy: false, fragile: false, hazard: true, originalSlot: 200 }
];

function bootstrap() {
  // Populate products into store state
  const productsMap = {};
  INITIAL_PRODUCTS.forEach(p => { productsMap[p.id] = p; });
  store.setState({ products: productsMap });

  // Initialize initial assignment array: assignment[productId] = slotId
  const initialAssignment = Array.from({ length: 40 }, (_, i) => {
    if (INITIAL_PRODUCTS[i]) {
      return INITIAL_PRODUCTS[i].originalSlot;
    }
    return (i * 5) % 240;
  });

  const baselineAssignment = Array.from({ length: 40 }, (_, i) => i * 2);

  store.initFromData({
    originalAssignment: initialAssignment,
    baseline: baselineAssignment,
    month: '2011-03'
  });

  const headerMount = document.querySelector('#top-header');
  const leftPanelMount = document.querySelector('#left-panel');
  const viewportMount = document.querySelector('#viewport-container');
  const rightPanelMount = document.querySelector('#right-panel');
  const costPanelMount = document.querySelector('#cost-panel');
  const bannersMount = document.querySelector('#status-banners-root');

  if (headerMount) renderHeader(headerMount);
  if (leftPanelMount) renderLevelNav(leftPanelMount);
  if (viewportMount) renderViewport(viewportMount);
  if (rightPanelMount) renderResultsPanel(rightPanelMount);
  if (costPanelMount) renderCostPanel(costPanelMount);
  if (bannersMount) renderStatusBanners(bannersMount);

  // Initialize Person A 3D Scene into #scene-container
  const sceneContainer = document.querySelector('#scene-container');
  if (sceneContainer) {
    initScene(sceneContainer);

    // Initial slot assignment sync
    const effectiveAssignment = store.getEffectiveAssignment();
    setAssignment(effectiveAssignment, INITIAL_PRODUCTS);

    // Listen for slot selection from 3D scene -> updates store
    onSceneEvent('slot-click', ({ slotId, slot, product }) => {
      store.selectSlot({
        slotId,
        aisle: slot?.aisle ?? 0,
        bay: slot?.bay ?? 0,
        level: slot?.level ?? 0,
        product: product?.name || product?.code || `Slot #${slotId}`
      });
    });

    // Listen for swap request from 3D scene (click slot A then slot B) -> executes swap in store
    onSceneEvent('swap-request', ({ slotA, slotB }) => {
      store.swapSlots(slotA, slotB);
    });

    // Synchronize store updates to 3D scene
    store.on('assignment-changed', (assignment) => {
      setAssignment(assignment, INITIAL_PRODUCTS);
    });

    // Synchronize camera and color mode changes from store
    const state = store.getState();
    let lastCamera = state.viewport?.cameraPreset;
    let lastColorMode = state.viewport?.colorMode;

    store.subscribe((nextState) => {
      const { cameraPreset, colorMode } = nextState.viewport || {};

      if (cameraPreset && cameraPreset !== lastCamera) {
        lastCamera = cameraPreset;
        const mappedPreset = cameraPreset === 'top' || cameraPreset === 'top-down' ? 'top' : 'angled';
        setCameraPreset(mappedPreset);
      }

      if (colorMode && colorMode !== lastColorMode) {
        lastColorMode = colorMode;
        const modeMap = {
          velocity: 'heat',
          heat: 'heat',
          zone: 'zones',
          zones: 'zones',
          category: 'default',
          default: 'default',
          regret: 'regret'
        };
        setColorMode(modeMap[colorMode] || 'default');
      }
    });

    // Connect "Run the Day" button to trigger 3D picker replay
    document.addEventListener('click', (e) => {
      const runBtn = e.target.closest('#run-day-btn');
      if (runBtn) {
        const sampleOrders = [
          [2, 42, 85],
          [10, 55],
          [24, 78, 120]
        ];
        playOrders(sampleOrders, { speed: 5, ghost: true });
      }
    });
  }

  store.setUIStatus('ready', 'Shelf Shuffle 3D Digital Twin ready. 3D Scene mounted.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
