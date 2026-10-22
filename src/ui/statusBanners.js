/**
 * Status Banners & State Overlays Component
 * Renders non-blocking loading indicators, error alerts, empty-data notifications, and toast banners.
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
      // Non-blocking toast with subtle animated spinner ring - does NOT cover 3D scene
      container.innerHTML = `
        <div class="toast-banner toast-info" role="status" aria-live="polite" style="display: flex; align-items: center; gap: 10px; border-left: 3px solid #f59e0b; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px);">
          <span class="spinner-ring" style="width: 16px; height: 16px; border-width: 2px; flex-shrink: 0;" aria-hidden="true"></span>
          <div class="toast-body" style="font-size: 12px; color: #f8fafc;">
            <strong>Simulating:</strong> ${uiStatus.message || 'Calculating picker travel routes & evaluation metrics...'}
          </div>
          <button class="toast-close-btn" aria-label="Dismiss message">✕</button>
        </div>
      `;
      attachClose(container);
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
