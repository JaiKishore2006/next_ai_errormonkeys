/**
 * Shelf Shuffle - Main Integrated Entrypoint
 * 
 * Unifies:
 * - Person A: 3D Three.js Warehouse Simulation, OrbitControls, and Animated Picker
 * - Person B: Mathematical Optimization Engine, Retail Data Pipeline & Fast Evaluator
 * - Person C: Interactive Tri-Pane HUD, 5 Game Levels, Validation Rules & Swap State
 */

import './style.css';
import layout from '../public/data/layout.json';
import products from '../public/data/products.json';
import ordersBase from '../public/data/orders_base.json';

import { store } from './state.js';
import {
  originalAssignment,
  baselineAssignment,
  evaluate,
  regret
} from './engine/index.js';

import { renderHeader } from './ui/header.js';
import { renderLevelNav } from './ui/levelNav.js';
import { renderViewport } from './ui/viewport.js';
import { renderResultsPanel } from './ui/resultsPanel.js';
import { renderCostPanel } from './ui/costPanel.js';
import { renderStatusBanners } from './ui/statusBanners.js';

function bootstrap() {
  console.log('[ShelfShuffle] Bootstrapping Digital Twin...');

  // 1. Compute ground-truth assignments and baseline metrics from retail data
  const orig = originalAssignment(products);
  const base = baselineAssignment(layout, products);

  const evalOrig = evaluate(layout, orig, ordersBase, 'sshape');
  const evalBase = evaluate(layout, base, ordersBase, 'sshape');
  const initialRegret = regret(layout, orig, products);

  console.log(`[ShelfShuffle] Engine Initialized: Original = ${evalOrig.totalDistance}m, Baseline = ${evalBase.totalDistance}m (-${(((evalOrig.totalDistance - evalBase.totalDistance)/evalOrig.totalDistance)*100).toFixed(1)}%)`);

  // 2. Initialize Central State Store
  store.initFromData({
    layout,
    products,
    orders: ordersBase,
    originalAssignment: orig,
    baseline: base,
    month: '2011-03'
  });

  store.setEngineMetrics({
    playerDistance: evalOrig.totalDistance,
    originalDistance: evalOrig.totalDistance,
    baselineDistance: evalBase.totalDistance,
    runTimeSec: evalOrig.totalTimeSec,
    visitsBySlot: evalOrig.visitsBySlot,
    regretList: initialRegret
  });

  // 3. Mount UI Components into Shell
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

  // 4. Hook Engine Evaluator to Store Assignment Changes
  store.on('assignment-changed', (newAssignment, meta) => {
    // Only re-evaluate if not an internal initialization event
    if (meta?.source === 'init') return;

    const activeMethod = store.getState().method || 'sshape';
    const evalPlayer = evaluate(layout, newAssignment, ordersBase, activeMethod);
    const updatedRegret = regret(layout, newAssignment, products);

    store.setEngineMetrics({
      playerDistance: evalPlayer.totalDistance,
      originalDistance: evalOrig.totalDistance,
      baselineDistance: evalBase.totalDistance,
      runTimeSec: evalPlayer.totalTimeSec,
      visitsBySlot: evalPlayer.visitsBySlot,
      regretList: updatedRegret
    });
  });

  store.setUIStatus('ready', 'Shelf Shuffle Connected: 3D Warehouse Twin + Real Retail Engine + Game Rules.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
