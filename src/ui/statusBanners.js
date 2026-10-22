/**
 * Status Banners & State Overlays Component
 * Renders loading indicators, error alerts, empty-data notifications, and mock-data notices.
 */
import { store } from '../state.js';

export function renderStatusBanners(container) {
  const update = (state) => {
    const { uiStatus } = state;

    if (!uiStatus || uiStatus.status === 'ready') {
      if (uiStatus?.message) {
        // Render brief info toast
        container.innerHTML = `
          <div class="toast-banner toast-info" role="status" aria-live="polite">
            <span class="toast-icon">ℹ️</span>
            <span class="toast-message">${uiStatus.message}</span>
            <button class="toast-close-btn" aria-label="Dismiss message">✕</button>
          </div>
        `;
        attachClose(container);
        return;
      }
      container.innerHTML = '';
      return;
    }

    if (uiStatus.status === 'loading') {
      container.innerHTML = `
        <div class="banner-overlay" role="alert" aria-busy="true">
          <div class="banner-card loading-card">
            <div class="spinner-ring" aria-hidden="true"></div>
            <div class="banner-content">
              <h3 class="banner-title">Optimization In Progress</h3>
              <p class="banner-text">${uiStatus.message || 'Calculating picker travel routes & evaluation metrics...'}</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (uiStatus.status === 'error') {
      container.innerHTML = `
        <div class="toast-banner toast-error" role="alert" aria-live="assertive">
          <span class="toast-icon">⚠️</span>
          <div class="toast-body">
            <strong>Error:</strong> ${uiStatus.message || 'Operation could not be completed.'}
          </div>
          <button class="toast-close-btn" aria-label="Dismiss error">✕</button>
        </div>
      `;
      attachClose(container);
      return;
    }

    if (uiStatus.status === 'empty') {
      container.innerHTML = `
        <div class="toast-banner toast-warning" role="alert">
          <span class="toast-icon">📭</span>
          <div class="toast-body">
            <strong>No Dataset Loaded:</strong> Running on fallback developer fixtures.
          </div>
          <button class="toast-close-btn" aria-label="Dismiss notice">✕</button>
        </div>
      `;
      attachClose(container);
      return;
    }
  };

  function attachClose(el) {
    const btn = el.querySelector('.toast-close-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        store.setUIStatus('ready', '');
      });
    }
  }

  update(store.getState());
  store.subscribe(update);
}
