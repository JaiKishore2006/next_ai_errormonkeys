/**
 * Left Level Navigation & Rules Panel Component
 * Displays available levels, objectives, and warehouse constraint rules.
 */
import { store, LEVELS } from '../state.js';

export function renderLevelNav(container) {
  const update = (state) => {
    const currentLevel = store.getCurrentLevel();

    container.innerHTML = `
      <section class="panel-section">
        <h2 class="panel-title">
          <span class="panel-icon" aria-hidden="true">🗺️</span>
          Levels
        </h2>
        <div class="level-list" role="tablist" aria-label="Warehouse scenario levels">
          ${LEVELS.map(lvl => {
            const isActive = lvl.id === state.currentLevelId;
            return `
              <button 
                class="level-card-btn ${isActive ? 'active' : ''}" 
                role="tab" 
                aria-selected="${isActive}"
                data-level-id="${lvl.id}"
              >
                <div class="level-card-header">
                  <span class="level-number">L${lvl.id}</span>
                  <span class="level-title-text">${lvl.name.split(':')[1] || lvl.name}</span>
                </div>
                <div class="level-card-meta">
                  <span class="meta-tag">Budget: ${lvl.moveLimit} moves</span>
                  <span class="meta-tag target-tag">Target: ${lvl.targetSavings}</span>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <section class="panel-section rules-section">
        <h2 class="panel-title">
          <span class="panel-icon" aria-hidden="true">📋</span>
          Rules & Constraints
        </h2>
        
        <div class="rules-card">
          <h3 class="rules-level-name">${currentLevel.name}</h3>
          <p class="rules-description">${currentLevel.description}</p>
          
          <div class="rules-list-wrapper">
            <h4 class="rules-subheading">Operational Constraints</h4>
            <ul class="rules-list">
              ${currentLevel.rules.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>

          <div class="rules-specs">
            <div class="spec-item">
              <span class="spec-label">Warehouse Size</span>
              <span class="spec-value">6 Aisles • 240 Slots</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Hazard Zone</span>
              <span class="spec-value text-amber">Aisle 5 Only</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Fragile Zone</span>
              <span class="spec-value text-blue">Aisle 4 Only</span>
            </div>
          </div>
        </div>
      </section>
    `;

    // Attach level switch listeners
    container.querySelectorAll('.level-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(btn.getAttribute('data-level-id'), 10);
        store.setLevel(id);
      });
    });
  };

  update(store.getState());
  store.subscribe(update);
}
