/**
 * Shelf Shuffle - Main Application Entrypoint (Person C)
 * 
 * Orchestrates the application shell, mounts modular UI components,
 * sets up state subscriptions, and reserves stable mount points for
 * Person A (Scene) and Person B (Engine) integrations.
 */

import './style.css';
import { store } from './state.js';
import { renderHeader } from './ui/header.js';
import { renderLevelNav } from './ui/levelNav.js';
import { renderViewport } from './ui/viewport.js';
import { renderResultsPanel } from './ui/resultsPanel.js';
import { renderCostPanel } from './ui/costPanel.js';
import { renderStatusBanners } from './ui/statusBanners.js';

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

  // Initialize status message
  store.setUIStatus('ready', 'Shelf Shuffle UI shell ready. Dev mock fixtures loaded.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
