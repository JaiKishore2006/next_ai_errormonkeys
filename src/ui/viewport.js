/**
 * Central Warehouse Viewport Component (Integrated)
 * 
 * Mounts Person A's high-performance 3D Three.js warehouse simulation into #scene-container,
 * connects OrbitControls camera presets, provides dynamic slot coloring modes (Category,
 * Heatmap velocity, Safety zones, Displacement regret), and wires raycast slot clicks and
 * drag-and-drop swaps to Person C's state store and Person B's optimization engine.
 */

import { store } from '../state.js';
import {
  initScene,
  setAssignment,
  setColorMode,
  setCameraPreset,
  highlightSlots,
  clearHighlights,
  on
} from '../scene/scene.js';
import { playIllegalSound, playSwapSuccessSound } from '../scene/audio.js';

export function renderViewport(container) {
  // 1. Render initial shell structure once
  container.innerHTML = `
    <div class="viewport-header">
      <div class="viewport-controls-group">
        <span class="control-label">Camera:</span>
        <div class="btn-group" role="group" aria-label="Camera Presets">
          <button class="btn btn-sm btn-amber" id="cam-preset-angled" data-preset="angled" title="3D Isometric perspective view">
            Isometric (3D)
          </button>
          <button class="btn btn-sm btn-outline" id="cam-preset-top" data-preset="top" title="Top-down 2D orthographic picking plan">
            Top-Down (Plan)
          </button>
        </div>
      </div>

      <div class="viewport-controls-group">
        <span class="control-label">Color Mode:</span>
        <select id="color-mode-select" class="select-dropdown" aria-label="Slot Color Overlay Mode">
          <option value="default">Product Category</option>
          <option value="heat">Pick Velocity (Heatmap)</option>
          <option value="zones">Safety Zones (Hazard / Fragile)</option>
          <option value="regret">Displacement Regret</option>
        </select>
      </div>
    </div>

    <!-- Stable Mount Point for Person A's Three.js Scene -->
    <div id="scene-container" class="scene-container-wrapper" tabindex="0" role="region" aria-label="Warehouse 3D Simulation Canvas" style="position: relative; flex: 1; min-height: 420px; outline: none;">
      <!-- Three.js Canvas mounts here -->
    </div>

    <!-- Bottom Inspector Bar -->
    <div class="viewport-footer">
      <div class="slot-inspector" id="slot-inspector-content">
        <span class="inspector-data text-muted">Click any rack slot in the 3D warehouse to inspect details or click two slots to swap</span>
      </div>
      <div class="viewport-status-info">
        <span>Speed: 1.2 m/s</span>
        <span class="separator">•</span>
        <span>Pick: 12s</span>
      </div>
    </div>
  `;

  const sceneContainer = container.querySelector('#scene-container');
  const inspectorContent = container.querySelector('#slot-inspector-content');
  const colorSelect = container.querySelector('#color-mode-select');
  const btnAngled = container.querySelector('#cam-preset-angled');
  const btnTop = container.querySelector('#cam-preset-top');

  // 2. Initialize Person A's 3D Scene
  let sceneReady = false;
  try {
    initScene(sceneContainer, store.getState().layout);
    sceneReady = true;

    // Apply initial assignment
    const effective = store.getEffectiveAssignment();
    const products = store.getState().products || [];
    setAssignment(effective, products);
  } catch (err) {
    console.error('[Viewport] Error initializing 3D scene:', err);
  }

  // Helper to render inspector content
  function updateInspector(slotId, slot, product) {
    if (!inspectorContent) return;
    if (slotId === null || slotId === undefined) {
      inspectorContent.innerHTML = `<span class="inspector-data text-muted">Click any rack slot in the 3D warehouse to inspect details or click two slots to swap</span>`;
      return;
    }

    const prodName = product ? (product.name || `SKU #${product.id}`) : 'Empty Slot';
    const prodCode = product?.code ? ` (${product.code})` : '';
    const weightTag = product?.weight === 'heavy' || product?.heavy ? ' • <span class="text-amber">Heavy</span>' : '';
    const fragileTag = product?.fragile ? ' • <span class="text-sky">Fragile</span>' : '';
    const hazardTag = product?.hazard ? ' • <span class="text-rose">Hazardous</span>' : '';
    const freqTag = product?.freq ? ` • <strong>${product.freq}</strong> picks` : '';

    inspectorContent.innerHTML = `
      <span class="inspector-data">
        Slot <strong>#${slotId}</strong> (Aisle ${slot ? slot.aisle + 1 : '?'}, Bay ${slot ? slot.bay + 1 : '?'}, L${slot ? slot.level : 0}) : 
        <strong>${prodName}</strong>${prodCode}${weightTag}${fragileTag}${hazardTag}${freqTag}
      </span>
    `;
  }

  // 3. Connect Scene Events
  if (sceneReady) {
    on('slot-click', ({ slotId, slot, product }) => {
      updateInspector(slotId, slot, product);
      store.selectSlot({
        slotId,
        aisle: slot?.aisle ?? 0,
        bay: slot?.bay ?? 0,
        level: slot?.level ?? 0,
        product: product?.name || null
      });
    });

    on('swap-request', ({ slotA, slotB }) => {
      const res = store.swapSlots(slotA, slotB);
      if (!res.success) {
        playIllegalSound();
        highlightSlots([slotA, slotB], 'illegal');
        setTimeout(() => clearHighlights(), 1800);
      } else {
        playSwapSuccessSound();
      }
    });
  }

  // 4. Camera Presets
  btnAngled?.addEventListener('click', () => {
    btnAngled.className = 'btn btn-sm btn-amber';
    btnTop.className = 'btn btn-sm btn-outline';
    setCameraPreset('angled', true);
    store.setCameraPreset('isometric');
  });

  btnTop?.addEventListener('click', () => {
    btnTop.className = 'btn btn-sm btn-amber';
    btnAngled.className = 'btn btn-sm btn-outline';
    setCameraPreset('top', true);
    store.setCameraPreset('top-down');
  });

  // 5. Color Mode Dropdown
  colorSelect?.addEventListener('change', (e) => {
    const mode = e.target.value;
    applyColorMode(mode);
  });

  function applyColorMode(mode) {
    if (!sceneReady) return;
    const state = store.getState();
    let data = {};
    if (mode === 'heat') {
      data = state.visitsBySlot || {};
    } else if (mode === 'regret') {
      data = state.regretList || [];
    }
    setColorMode(mode, data);
  }

  // 6. Listen to Store Assignment & Metric Changes
  store.on('assignment-changed', (newAssignment) => {
    if (!sceneReady) return;
    const products = store.getState().products || [];
    setAssignment(newAssignment, products);

    // Refresh overlay colors
    const activeMode = colorSelect?.value || 'default';
    if (activeMode === 'heat' || activeMode === 'regret') {
      applyColorMode(activeMode);
    }
  });

  store.on('run-finished', () => {
    const activeMode = colorSelect?.value || 'default';
    if (activeMode === 'heat' || activeMode === 'regret') {
      applyColorMode(activeMode);
    }
  });
}
