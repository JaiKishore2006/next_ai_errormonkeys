/**
 * Central Warehouse Viewport Component
 * Houses the stable #scene-container mount point and renders a clearly labeled
 * placeholder schematic when Person A's 3D scene module has not yet initialized.
 */
import { store } from '../state.js';

export function renderViewport(container) {
  const update = (state) => {
    const { cameraPreset, colorMode, selectedSlot } = state.viewport;

    container.innerHTML = `
      <div class="viewport-header">
        <div class="viewport-controls-group">
          <span class="control-label">Camera:</span>
          <div class="btn-group" role="group" aria-label="Camera Presets">
            <button class="btn btn-sm ${cameraPreset === 'isometric' ? 'btn-amber' : 'btn-outline'}" data-preset="isometric">
              Isometric
            </button>
            <button class="btn btn-sm ${cameraPreset === 'top-down' ? 'btn-amber' : 'btn-outline'}" data-preset="top-down">
              Top-Down
            </button>
            <button class="btn btn-sm ${cameraPreset === 'aisle' ? 'btn-amber' : 'btn-outline'}" data-preset="aisle">
              Aisle View
            </button>
          </div>
        </div>

        <div class="viewport-controls-group">
          <span class="control-label">Color Mode:</span>
          <select id="color-mode-select" class="select-dropdown" aria-label="Slot Color Overlay Mode">
            <option value="velocity" ${colorMode === 'velocity' ? 'selected' : ''}>Pick Velocity (Heatmap)</option>
            <option value="category" ${colorMode === 'category' ? 'selected' : ''}>Product Category</option>
            <option value="zone" ${colorMode === 'zone' ? 'selected' : ''}>Zone (Hazard/Fragile)</option>
          </select>
        </div>
      </div>

      <!-- Stable Mount Point for Person A's Three.js Scene -->
      <div id="scene-container" class="scene-container-wrapper" tabindex="0" role="region" aria-label="Warehouse 3D Simulation Canvas">
        <!-- Clearly Labeled Placeholder rendered when Person A's Three.js scene is not mounted -->
        <div class="scene-placeholder" id="scene-placeholder-card">
          <div class="placeholder-watermark" aria-hidden="true">THREE.JS CANVAS MOUNT POINT</div>
          
          <div class="placeholder-badge">
            <span class="badge-dot pulse"></span>
            <span>Person A Scene Placeholder (#scene-container)</span>
          </div>

          <div class="warehouse-schematic-grid" aria-label="2D Warehouse Schematic Representation">
            <div class="dock-zone">
              <span class="dock-marker">🚚 Dock (0,0)</span>
            </div>
            
            <div class="aisles-container">
              ${[0, 1, 2, 3, 4, 5].map(aisle => {
                const isHazard = aisle === 5;
                const isFragile = aisle === 4;
                const zoneClass = isHazard ? 'zone-hazard' : isFragile ? 'zone-fragile' : 'zone-standard';
                const zoneLabel = isHazard ? 'Hazard (A5)' : isFragile ? 'Fragile (A4)' : `Aisle ${aisle}`;
                
                return `
                  <div class="schematic-aisle ${zoneClass}">
                    <div class="aisle-header-label">${zoneLabel}</div>
                    <div class="rack-row left-rack">
                      ${[0, 1, 2, 3, 4].map(bay => {
                        const slotId = aisle * 40 + bay * 2;
                        const isSelected = selectedSlot && selectedSlot.slotId === slotId;
                        return `
                          <button 
                            class="mock-slot-cell ${isSelected ? 'selected' : ''}" 
                            data-slot-id="${slotId}"
                            data-aisle="${aisle}"
                            data-bay="${bay}"
                            title="Aisle ${aisle}, Bay ${bay}, Slot #${slotId}"
                            aria-label="Slot ${slotId} in Aisle ${aisle}"
                          >
                            ${slotId}
                          </button>
                        `;
                      }).join('')}
                    </div>
                    <div class="aisle-walkway">
                      <span class="walkway-arrow">↕</span>
                    </div>
                    <div class="rack-row right-rack">
                      ${[5, 6, 7, 8, 9].map(bay => {
                        const slotId = aisle * 40 + bay * 2;
                        const isSelected = selectedSlot && selectedSlot.slotId === slotId;
                        return `
                          <button 
                            class="mock-slot-cell ${isSelected ? 'selected' : ''}" 
                            data-slot-id="${slotId}"
                            data-aisle="${aisle}"
                            data-bay="${bay}"
                            title="Aisle ${aisle}, Bay ${bay}, Slot #${slotId}"
                            aria-label="Slot ${slotId} in Aisle ${aisle}"
                          >
                            ${slotId}
                          </button>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="placeholder-instructions">
            <span class="instruction-icon">ℹ️</span>
            <span>Click any slot cell above to inspect slot details and test swap actions.</span>
          </div>
        </div>
      </div>

      <!-- Bottom Inspector Bar -->
      <div class="viewport-footer">
        <div class="slot-inspector">
          <span class="inspector-label">Selected Slot:</span>
          ${selectedSlot ? `
            <span class="inspector-data">
              Slot <strong>#${selectedSlot.slotId}</strong> • 
              Aisle <strong>${selectedSlot.aisle}</strong> • 
              Bay <strong>${selectedSlot.bay}</strong> • 
              Level <strong>${selectedSlot.level ?? 0}</strong>
            </span>
            <button id="test-swap-btn" class="btn btn-xs btn-amber">
              Swap with Neighbor (Test Move)
            </button>
          ` : `
            <span class="inspector-data text-muted">Click a slot to inspect details</span>
          `}
        </div>
        <div class="viewport-status-info">
          <span>Speed: 1.2 m/s</span>
          <span class="separator">•</span>
          <span>Pick: 12s</span>
        </div>
      </div>
    `;

    // Camera preset clicks
    container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        store.setCameraPreset(btn.getAttribute('data-preset'));
      });
    });

    // Color mode select
    const colorSelect = container.querySelector('#color-mode-select');
    if (colorSelect) {
      colorSelect.addEventListener('change', (e) => {
        store.setColorMode(e.target.value);
      });
    }

    // Slot click handler: click one to select, click second to swap!
    container.querySelectorAll('.mock-slot-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const targetSlotId = parseInt(cell.getAttribute('data-slot-id'), 10);
        const aisle = parseInt(cell.getAttribute('data-aisle'), 10);
        const bay = parseInt(cell.getAttribute('data-bay'), 10);
        const slotLevel = targetSlotId % 2;

        if (selectedSlot && selectedSlot.slotId !== targetSlotId) {
          // Second click on different slot -> Execute Swap!
          store.swapSlots(selectedSlot.slotId, targetSlotId);
          store.selectSlot({ slotId: targetSlotId, aisle, bay, level: slotLevel, product: `SKU-${1000 + targetSlotId}` });
        } else {
          // Select this slot
          store.selectSlot({ slotId: targetSlotId, aisle, bay, level: slotLevel, product: `SKU-${1000 + targetSlotId}` });
        }
      });
    });

    // Test swap button handler
    const swapBtn = container.querySelector('#test-swap-btn');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        if (selectedSlot) {
          // Swap with adjacent slot in same bay (or next slot)
          const targetSlotId = selectedSlot.slotId % 2 === 0 ? selectedSlot.slotId + 2 : selectedSlot.slotId - 2;
          store.swapSlots(selectedSlot.slotId, Math.max(0, Math.min(239, targetSlotId)));
        }
      });
    }
  };

  update(store.getState());
  store.subscribe(update);
}
