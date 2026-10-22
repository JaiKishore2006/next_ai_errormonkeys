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

function bootstrap() {
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
    const state = store.getState();
    const effectiveAssignment = store.getEffectiveAssignment();
    setAssignment(effectiveAssignment, Object.values(state.products || {}));

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
      setAssignment(assignment, Object.values(store.getState().products || {}));
    });

    // Synchronize camera and color mode changes from store
    let lastCamera = state.viewport?.cameraPreset;
    let lastColorMode = state.viewport?.colorMode;

    store.subscribe((nextState) => {
      const { cameraPreset, colorMode } = nextState.viewport || {};

      if (cameraPreset && cameraPreset !== lastCamera) {
        lastCamera = cameraPreset;
        const mappedPreset = cameraPreset === 'top-down' ? 'top' : 'angled';
        setCameraPreset(mappedPreset);
      }

      if (colorMode && colorMode !== lastColorMode) {
        lastColorMode = colorMode;
        const modeMap = {
          velocity: 'heat',
          zone: 'zones',
          category: 'default',
          heat: 'heat',
          zones: 'zones',
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
