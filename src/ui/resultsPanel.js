/**
 * Right Results & Action Controls Panel Component
 * Displays distances (Original, Player, Baseline), percentage savings,
 * move usage counter, and action buttons (Run the Day, Undo, Reset, Baseline).
 */
import { store } from '../state.js';

export function renderResultsPanel(container) {
  const update = (state) => {
    const currentLevel = store.getCurrentLevel();
    const { metrics, movesUsed } = state;
    const moveLimit = currentLevel.moveLimit;
    const movesRemaining = Math.max(0, moveLimit - movesUsed);
    const progressPct = Math.min(100, (movesUsed / moveLimit) * 100);

    const isPositiveSavings = metrics.savingsPct > 0;
    const savingsColorClass = isPositiveSavings ? 'text-emerald' : 'text-muted';

    container.innerHTML = `
      <section class="panel-section">
        <div class="panel-header-with-tag">
          <h2 class="panel-title">
            <span class="panel-icon" aria-hidden="true">📊</span>
            Optimization Metrics
          </h2>
          <span class="badge badge-amber badge-subtle" title="All metrics currently computed using mock baseline until engine integration">
            Mock Data
          </span>
        </div>

        <div class="metrics-grid">
          <!-- Player Current Distance -->
          <div class="metric-card metric-primary">
            <div class="metric-label">Player Distance</div>
            <div class="metric-value font-mono">
              ${metrics.playerDistance.toFixed(1)} <span class="metric-unit">m</span>
            </div>
            <div class="metric-subtext">Estimated picker travel / day</div>
          </div>

          <!-- Savings Badge -->
          <div class="metric-card metric-savings">
            <div class="metric-label">Distance Savings</div>
            <div class="metric-value font-mono ${savingsColorClass}">
              ${isPositiveSavings ? '+' : ''}${metrics.savingsPct.toFixed(1)}%
            </div>
            <div class="metric-subtext">vs. Original Layout</div>
          </div>

          <!-- Comparison: Original & Baseline -->
          <div class="metric-row-split">
            <div class="metric-card metric-secondary">
              <div class="metric-label">Original</div>
              <div class="metric-value-sm font-mono">${metrics.originalDistance.toFixed(1)} m</div>
            </div>
            <div class="metric-card metric-secondary">
              <div class="metric-label">Baseline (Auto)</div>
              <div class="metric-value-sm font-mono">${metrics.baselineDistance.toFixed(1)} m</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Move Budget Tracker -->
      <section class="panel-section">
        <div class="move-budget-header">
          <span class="budget-label">Move Budget</span>
          <span class="budget-count font-mono"><strong>${movesUsed}</strong> / ${moveLimit} used</span>
        </div>
        <div class="progress-bar-track" role="progressbar" aria-valuenow="${movesUsed}" aria-valuemin="0" aria-valuemax="${moveLimit}">
          <div class="progress-bar-fill ${movesUsed >= moveLimit ? 'progress-full' : ''}" style="width: ${progressPct}%"></div>
        </div>
        <div class="budget-footer">
          <span class="remaining-text">${movesRemaining} moves remaining in this level</span>
        </div>
      </section>

      <!-- Operational Action Controls -->
      <section class="panel-section controls-section">
        <h2 class="panel-title">
          <span class="panel-icon" aria-hidden="true">⚡</span>
          Actions
        </h2>

        <div class="action-buttons-stack">
          <button id="run-day-btn" class="btn btn-amber btn-lg btn-block" title="Simulate full order batch picker routes">
            <span class="btn-icon" aria-hidden="true">▶</span>
            Run the Day
          </button>

          <div class="btn-grid-row">
            <button id="undo-btn" class="btn btn-outline" ${movesUsed === 0 ? 'disabled' : ''} title="Undo the last slotting change">
              <span class="btn-icon" aria-hidden="true">↶</span>
              Undo
            </button>
            <button id="reset-btn" class="btn btn-outline" title="Reset slots to starting layout">
              <span class="btn-icon" aria-hidden="true">↺</span>
              Reset
            </button>
          </div>

          <div class="btn-grid-row">
            <button id="preview-baseline-btn" class="btn ${state.isPreviewingBaseline ? 'btn-amber' : 'btn-outline'}" title="Temporarily preview automated baseline assignment without altering your layout">
              <span class="btn-icon" aria-hidden="true">${state.isPreviewingBaseline ? '👁️' : '👁️‍🗨️'}</span>
              ${state.isPreviewingBaseline ? 'Exit Preview' : 'Preview Baseline'}
            </button>
            <button id="apply-baseline-btn" class="btn btn-secondary" title="Apply automated baseline solution to your working layout">
              <span class="btn-icon" aria-hidden="true">⚙️</span>
              Apply Baseline
            </button>
          </div>
          ${state.isPreviewingBaseline ? `
            <div class="preview-active-pill" role="status">
              <span>👁️ Showing temporary baseline preview</span>
            </div>
          ` : ''}
        </div>

        <div class="metric-source-notice">
          <div class="notice-badge">⚠ Contract Rule Notice</div>
          <p class="notice-text">
            All real distances and routes belong to Person B's optimization engine.
            Values shown are developer mock fixtures.
          </p>
        </div>
      </section>
    `;

    // Event listeners
    const runBtn = container.querySelector('#run-day-btn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        store.setUIStatus('loading', 'Simulating picker batch routes (Run the Day)...');
        setTimeout(() => {
          store.setUIStatus('ready', 'Run completed! Traveled ' + metrics.playerDistance.toFixed(1) + ' m.');
        }, 1200);
      });
    }

    const undoBtn = container.querySelector('#undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        store.undoMove();
      });
    }

    const resetBtn = container.querySelector('#reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        store.resetLayout();
      });
    }

    const previewBtn = container.querySelector('#preview-baseline-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        store.previewBaseline(!state.isPreviewingBaseline);
      });
    }

    const applyBtn = container.querySelector('#apply-baseline-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        store.applyBaseline();
      });
    }
  };

  update(store.getState());
  store.subscribe(update);
}
