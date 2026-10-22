/**
 * Central Warehouse Viewport Component
 * Houses the stable #scene-container mount point for Person A's 3D Three.js scene,
 * along with viewport camera presets, color overlays, and slot inspection footer.
 */
import { store } from '../state.js';

export function renderViewport(container) {
  // 1. Render stable DOM shell ONCE so #scene-container is NEVER destroyed on state updates
  container.innerHTML = `
    <div class="viewport-header">
      <div class="viewport-controls-group">
        <span class="control-label">Camera:</span>
        <div class="btn-group" role="group" aria-label="Camera Presets">
          <button class="btn btn-sm btn-amber" data-preset="angled" id="cam-preset-angled">
            Angled (3D)
          </button>
          <button class="btn btn-sm btn-outline" data-preset="top" id="cam-preset-top">
            Top-Down
          </button>
        </div>
      </div>

      <div class="viewport-controls-group">
        <span class="control-label">Color Mode:</span>
        <select id="color-mode-select" class="select-dropdown" aria-label="Slot Color Overlay Mode">
          <option value="default" selected>Default (Category)</option>
          <option value="zones">Storage Zones (Hazard/Fragile)</option>
          <option value="heat">Pick Velocity (Heatmap)</option>
          <option value="regret">Slotting Regret</option>
        </select>
      </div>
    </div>

    <!-- Dedicated Mount Point for Person A's Three.js Scene Canvas -->
    <div 
      id="scene-container" 
      class="scene-container-wrapper" 
      tabindex="0" 
      role="region" 
      aria-label="Warehouse 3D Simulation Canvas"
      style="flex: 1; width: 100%; height: 100%; min-height: 480px; position: relative; overflow: hidden; background: #0f172a;"
    ></div>

    <!-- Bottom Slot Inspector Bar -->
    <div class="viewport-footer">
      <div class="slot-inspector" id="slot-inspector-content">
        <span class="inspector-data text-muted">Click any rack slot in the 3D floor to inspect & swap</span>
      </div>
      <div class="viewport-status-info">
        <span>Walking: 1.2 m/s</span>
        <span class="separator">•</span>
        <span>Pick Pause: 12s</span>
      </div>
    </div>
  `;

  // 2. Camera preset click listeners
  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      store.setCameraPreset(preset);
    });
  });

  // 3. Color mode dropdown listener
  const colorSelect = container.querySelector('#color-mode-select');
  if (colorSelect) {
    colorSelect.addEventListener('change', (e) => {
      store.setColorMode(e.target.value);
    });
  }

  // 4. Reactive UI updates (targeted to buttons and footer only — NEVER clears #scene-container!)
  const update = (state) => {
    const { cameraPreset, colorMode, selectedSlot } = state.viewport || {};

    // Update active camera button styling
    const angledBtn = container.querySelector('#cam-preset-angled');
    const topBtn = container.querySelector('#cam-preset-top');
    if (angledBtn && topBtn) {
      if (cameraPreset === 'top' || cameraPreset === 'top-down') {
        topBtn.className = 'btn btn-sm btn-amber';
        angledBtn.className = 'btn btn-sm btn-outline';
      } else {
        angledBtn.className = 'btn btn-sm btn-amber';
        topBtn.className = 'btn btn-sm btn-outline';
      }
    }

    // Update color mode select dropdown
    if (colorSelect && colorMode && colorSelect.value !== colorMode) {
      colorSelect.value = colorMode;
    }

    // Update footer slot inspector
    const inspectorEl = container.querySelector('#slot-inspector-content');
    if (inspectorEl) {
      if (selectedSlot) {
        inspectorEl.innerHTML = `
          <span class="inspector-label">Selected Slot:</span>
          <span class="inspector-data">
            Slot <strong>#${selectedSlot.slotId}</strong> • 
            Aisle <strong>${selectedSlot.aisle + 1}</strong> • 
            Bay <strong>${selectedSlot.bay + 1}</strong> • 
            Level <strong>${selectedSlot.level ?? 0}</strong> • 
            <span style="color: #38bdf8; font-weight: 600;">${selectedSlot.product || 'Empty'}</span>
          </span>
          <span class="badge badge-amber badge-subtle" style="margin-left: 8px;">Click 2nd slot to Swap</span>
        `;
      } else {
        inspectorEl.innerHTML = `
          <span class="inspector-data text-muted">Click any rack slot in the 3D floor to inspect & swap</span>
        `;
      }
    }
  };

  store.subscribe(update);
}
