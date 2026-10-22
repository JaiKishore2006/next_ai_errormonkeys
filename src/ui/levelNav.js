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
            const budgetLabel = lvl.moveLimit !== null ? `${lvl.moveLimit} moves` : 'Unlimited';
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
                  <span class="meta-tag">Budget: ${budgetLabel}</span>
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
            <h4 class="rules-subheading">Active Level Rules</h4>
            <ul class="rules-list">
              ${(currentLevel.ruleDescriptions || []).map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>

          <div class="rules-specs">
            <div class="spec-item">
              <span class="spec-label">Heavy Products</span>
              <span class="spec-value ${currentLevel.rules.heavyOnLowShelves ? 'text-amber' : 'text-muted'}">
                ${currentLevel.rules.heavyOnLowShelves ? 'Level 0 Only' : 'Any Shelf'}
              </span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Hazard Zone</span>
              <span class="spec-value ${currentLevel.rules.hazardZone ? 'text-amber' : 'text-muted'}">
                ${currentLevel.rules.hazardZone ? 'Aisle 5 Enforced' : 'Inactive'}
              </span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Fragile Zone</span>
              <span class="spec-value ${currentLevel.rules.fragileZone ? 'text-blue' : 'text-muted'}">
                ${currentLevel.rules.fragileZone ? 'Aisle 4 Enforced' : 'Inactive'}
              </span>
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
