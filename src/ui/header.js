/**
 * Top Application Header Component
 * Displays application branding, current level pill, and status badges.
 */
import { store } from '../state.js';

export function renderHeader(container) {
  const update = (state) => {
    const level = store.getCurrentLevel();
    const mockBadge = state.metrics.isMockData 
      ? `<span class="badge badge-amber" title="Metrics are generated from mock data until Person B engine connects">⚡ DEV MOCK DATA</span>`
      : `<span class="badge badge-emerald">● ENGINE LIVE</span>`;

    container.innerHTML = `
      <div class="header-brand">
        <div class="header-logo-icon" aria-hidden="true">📦</div>
        <div>
          <h1 class="header-title">Shelf Shuffle</h1>
          <p class="header-subtitle">Warehouse Digital Twin & Slotting Optimizer</p>
        </div>
      </div>

      <div class="header-center">
        <div class="level-indicator-badge">
          <span class="level-tag">CURRENT LEVEL</span>
          <span class="level-name">${level.name}</span>
        </div>
      </div>

      <div class="header-badges">
        ${mockBadge}
        <span class="badge badge-slate" id="scene-status-pill" title="3D scene canvas status">Scene: 2D/3D Hybrid</span>
        <button id="quick-reset-btn" class="btn btn-ghost btn-sm" title="Reset current level arrangement">
          ↺ Reset
        </button>
      </div>
    `;

    const resetBtn = container.querySelector('#quick-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        store.resetLayout();
      });
    }
  };

  update(store.getState());
  store.subscribe(update);
}
