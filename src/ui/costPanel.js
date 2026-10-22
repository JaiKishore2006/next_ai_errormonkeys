/**
 * Lower Cost-Analysis & ROI Panel Component
 * Features interactive parameter sliders (Hourly Wage, Daily Order Volume, Working Days)
 * and displays real-time calculated financial and labor time savings.
 */
import { store } from '../state.js';

export function renderCostPanel(container) {
  const update = (state) => {
    const { cost, metrics } = state;
    
    // Derived computations based on warehouse geometry contracts
    // Walking speed = 1.2 m/s
    const distanceSavedMeters = Math.max(0, metrics.originalDistance - metrics.playerDistance);
    const walkTimeSavedSecPerDay = distanceSavedMeters / (cost.walkingSpeedMps || 1.2);
    const walkHoursSavedPerDay = walkTimeSavedSecPerDay / 3600;
    const annualHoursSaved = walkHoursSavedPerDay * cost.workingDaysPerYear;
    const annualFinancialSavings = annualHoursSaved * cost.hourlyWage;

    container.innerHTML = `
      <div class="cost-panel-inner">
        <div class="cost-panel-header">
          <div class="cost-panel-title-group">
            <h2 class="cost-panel-title">
              <span class="panel-icon" aria-hidden="true">💰</span>
              Cost Analysis & Labor ROI
            </h2>
            <span class="cost-subtitle">
              Dynamic financial projections based on travel reduction & warehouse contracts
            </span>
          </div>
          <span class="badge badge-amber badge-subtle">Simulated Projection</span>
        </div>

        <div class="cost-content-grid">
          <!-- Parameter Sliders -->
          <div class="cost-sliders-col">
            <fieldset class="slider-group">
              <div class="slider-header">
                <label for="slider-wage" class="slider-label">Picker Wage ($/hr)</label>
                <span class="slider-value font-mono">$${cost.hourlyWage.toFixed(2)}</span>
              </div>
              <input 
                type="range" 
                id="slider-wage" 
                class="range-slider" 
                min="15" 
                max="50" 
                step="0.5" 
                value="${cost.hourlyWage}"
                aria-valuemin="15"
                aria-valuemax="50"
                aria-valuenow="${cost.hourlyWage}"
              />
              <div class="slider-limits">
                <span>$15/hr</span>
                <span>$50/hr</span>
              </div>
            </fieldset>

            <fieldset class="slider-group">
              <div class="slider-header">
                <label for="slider-orders" class="slider-label">Daily Order Volume</label>
                <span class="slider-value font-mono">${cost.dailyOrders} orders</span>
              </div>
              <input 
                type="range" 
                id="slider-orders" 
                class="range-slider" 
                min="50" 
                max="500" 
                step="10" 
                value="${cost.dailyOrders}"
                aria-valuemin="50"
                aria-valuemax="500"
                aria-valuenow="${cost.dailyOrders}"
              />
              <div class="slider-limits">
                <span>50</span>
                <span>500 orders/day</span>
              </div>
            </fieldset>

            <fieldset class="slider-group">
              <div class="slider-header">
                <label for="slider-days" class="slider-label">Working Days / Year</label>
                <span class="slider-value font-mono">${cost.workingDaysPerYear} days</span>
              </div>
              <input 
                type="range" 
                id="slider-days" 
                class="range-slider" 
                min="200" 
                max="365" 
                step="5" 
                value="${cost.workingDaysPerYear}"
                aria-valuemin="200"
                aria-valuemax="365"
                aria-valuenow="${cost.workingDaysPerYear}"
              />
              <div class="slider-limits">
                <span>200</span>
                <span>365 days</span>
              </div>
            </fieldset>
          </div>

          <!-- Dynamic Output Projection Cards -->
          <div class="cost-projections-col">
            <div class="projection-card highlight-card">
              <div class="proj-label">Annual Labor Savings</div>
              <div class="proj-value font-mono text-amber">
                $${annualFinancialSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div class="proj-subtext">Direct picker travel cost eliminated</div>
            </div>

            <div class="projection-subcards-row">
              <div class="projection-card">
                <div class="proj-label">Daily Distance Cut</div>
                <div class="proj-value-sm font-mono text-emerald">
                  ${distanceSavedMeters.toFixed(1)} m
                </div>
                <div class="proj-subtext">${((distanceSavedMeters / (metrics.originalDistance || 1)) * 100).toFixed(1)}% reduction</div>
              </div>

              <div class="projection-card">
                <div class="proj-label">Picker Hours Saved</div>
                <div class="proj-value-sm font-mono text-cyan">
                  ${annualHoursSaved.toFixed(1)} hrs/yr
                </div>
                <div class="proj-subtext">@ 1.2 m/s walk speed</div>
              </div>

              <div class="projection-card">
                <div class="proj-label">Warehouse Efficiency</div>
                <div class="proj-value-sm font-mono text-amber">
                  +${metrics.savingsPct.toFixed(1)}%
                </div>
                <div class="proj-subtext">vs. baseline standard</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind slider input events
    const wageSlider = container.querySelector('#slider-wage');
    if (wageSlider) {
      wageSlider.addEventListener('input', (e) => {
        store.updateCost('hourlyWage', e.target.value);
      });
    }

    const ordersSlider = container.querySelector('#slider-orders');
    if (ordersSlider) {
      ordersSlider.addEventListener('input', (e) => {
        store.updateCost('dailyOrders', e.target.value);
      });
    }

    const daysSlider = container.querySelector('#slider-days');
    if (daysSlider) {
      daysSlider.addEventListener('input', (e) => {
        store.updateCost('workingDaysPerYear', e.target.value);
      });
    }
  };

  update(store.getState());
  store.subscribe(update);
}
