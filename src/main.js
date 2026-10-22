import './style.css'
import {
  initScene,
  setAssignment,
  setColorMode,
  playOrders,
  stopReplay,
  on,
  highlightSlots,
  clearHighlights,
  setCameraPreset
} from './scene/scene.js'

// ==========================================
// MOCK DATA GENERATOR (For standalone testing)
// ==========================================
const MOCK_PRODUCTS = [
  { id: 1, code: 'HEAVY-01', name: 'Cast Iron Kettlebell 24kg', freq: 45, weight: 24, heavy: true, fragile: false, hazard: false },
  { id: 2, code: 'HEAVY-02', name: 'Car Battery 12V Heavy', freq: 38, weight: 18, heavy: true, fragile: false, hazard: false },
  { id: 3, code: 'FRAG-01', name: 'Ceramic Dinner Set 16pc', freq: 52, weight: 4.5, heavy: false, fragile: true, hazard: false },
  { id: 4, code: 'FRAG-02', name: 'Crystal Wine Glasses (6)', freq: 61, weight: 1.2, heavy: false, fragile: true, hazard: false },
  { id: 5, code: 'HAZ-01', name: 'Lithium Spray Solvent 500ml', freq: 29, weight: 0.8, heavy: false, fragile: false, hazard: true },
  { id: 6, code: 'HAZ-02', name: 'Industrial Degreaser Acid', freq: 33, weight: 2.1, heavy: false, fragile: false, hazard: true },
  { id: 7, code: 'FAST-01', name: 'Organic Cotton T-Shirt White', freq: 145, weight: 0.3, heavy: false, fragile: false, hazard: false },
  { id: 8, code: 'FAST-02', name: 'Wireless Bluetooth Earbuds', freq: 168, weight: 0.2, heavy: false, fragile: false, hazard: false },
  { id: 9, code: 'FAST-03', name: 'Stainless Steel Water Bottle', freq: 112, weight: 0.6, heavy: false, fragile: false, hazard: false },
  { id: 10, code: 'MED-01', name: 'Ergonomic Desk Mouse Pad', freq: 55, weight: 0.4, heavy: false, fragile: false, hazard: false },
  { id: 11, code: 'MED-02', name: 'LED Desk Lamp Dimmable', freq: 48, weight: 1.1, heavy: false, fragile: false, hazard: false },
  { id: 12, code: 'SLOW-01', name: 'Vintage Wall Clock 30cm', freq: 14, weight: 1.8, heavy: false, fragile: false, hazard: false }
]

// Mock initial slot assignments (scattered across warehouse)
const mockAssignment = {}
MOCK_PRODUCTS.forEach((p, idx) => {
  // Deliberately place some fast movers far away (aisle 5, bay 9) to show slotting regret
  const slotTarget = idx === 7 ? 238 : (idx * 18 + 5) % 240
  mockAssignment[p.id] = slotTarget
})

// Mock visit counts for heatmap
const mockHeatmap = {}
for (let i = 0; i < 240; i++) {
  mockHeatmap[i] = Math.floor(Math.random() * (i % 10 === 0 ? 80 : 15))
}
mockHeatmap._max = 80

// Mock regret scores
const mockRegret = [
  { productId: 8, slotId: 238, regretScore: 92.4 }, // Earbuds in far aisle 5
  { productId: 7, slotId: 185, regretScore: 78.1 },
  { productId: 9, slotId: 149, regretScore: 64.0 },
  { productId: 1, slotId: 41, regretScore: 42.5 }
]

// Sample picking orders (lists of slot IDs to pick in one trip)
const sampleOrders = [
  [mockAssignment[8], mockAssignment[3], mockAssignment[7]], // Order 1
  [mockAssignment[1], mockAssignment[5]],                   // Order 2
  [mockAssignment[2], mockAssignment[4], mockAssignment[9]] // Order 3
]

// Ghost baseline orders (fast items closer to dock at aisle 0, bay 0-2)
const sampleGhostOrders = [
  [2, 4, 6],
  [1, 5],
  [3, 7, 9]
]

// ==========================================
// APP DOM SCAFFOLDING
// ==========================================
const app = document.querySelector('#app')

app.innerHTML = `
  <div style="position: relative; width: 100vw; height: 100vh; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1120;">
    <!-- 3D Scene Viewport -->
    <div id="warehouse-scene" style="width: 100%; height: 100%;"></div>

    <!-- Top Navigation & Controls Toolbar -->
    <header style="
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      align-items: center;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      padding: 10px 18px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      z-index: 50;
      color: #f8fafc;
    ">
      <div style="font-weight: 800; font-size: 15px; letter-spacing: -0.02em; color: #f59e0b; margin-right: 6px; display: flex; align-items: center; gap: 6px;">
        <span>📦</span>
        <span>Shelf Shuffle</span>
      </div>

      <div style="height: 20px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>

      <!-- Camera Presets -->
      <div style="display: flex; gap: 4px;">
        <button id="btn-camera-angled" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #334155; color: #fff; cursor: pointer;">Angled</button>
        <button id="btn-camera-top" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; cursor: pointer;">Top</button>
      </div>

      <div style="height: 20px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>

      <!-- Color Modes -->
      <div style="display: flex; gap: 4px;">
        <button id="mode-default" class="mode-btn" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #f59e0b; background: #f59e0b; color: #000; cursor: pointer;">Default</button>
        <button id="mode-zones" class="mode-btn" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; cursor: pointer;">Zones</button>
        <button id="mode-heat" class="mode-btn" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; cursor: pointer;">Heatmap</button>
        <button id="mode-regret" class="mode-btn" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; cursor: pointer;">Regret</button>
      </div>

      <div style="height: 20px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>

      <!-- Replay Controls -->
      <button id="btn-replay" style="
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 6px;
        border: none;
        background: #10b981;
        color: #ffffff;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      ">
        <span>▶</span>
        <span>Replay Orders</span>
      </button>

      <button id="btn-hint" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; cursor: pointer;">💡 Hint</button>
    </header>

    <!-- Bottom Replay Counter & HUD -->
    <div id="hud-panel" style="
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
      padding: 10px 20px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 20px;
      color: #f1f5f9;
      font-size: 13px;
      z-index: 50;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    ">
      <div>
        <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 700; display: block;">Distance Walked</span>
        <span id="stat-distance" style="font-size: 18px; font-weight: 800; color: #38bdf8;">0.0 m</span>
      </div>
      <div style="height: 24px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>
      <div>
        <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 700; display: block;">Simulated Time</span>
        <span id="stat-time" style="font-size: 18px; font-weight: 800; color: #a78bfa;">0.0 s</span>
      </div>
      <div style="height: 24px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>
      <div>
        <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 700; display: block;">Speed Multiplier</span>
        <select id="speed-select" style="background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 4px; padding: 2px 6px; font-size: 12px; cursor: pointer;">
          <option value="1">1×</option>
          <option value="5" selected>5×</option>
          <option value="20">20×</option>
        </select>
      </div>
    </div>

    <!-- Notification Toast -->
    <div id="toast" style="
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #f8fafc;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #475569;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
      display: none;
      z-index: 100;
      transition: opacity 0.2s ease;
    "></div>
  </div>
`

// ==========================================
// INITIALIZE SCENE & HOOK EVENTS
// ==========================================
const container = document.querySelector('#warehouse-scene')
initScene(container)

// Seed mock products and assignments
setAssignment(mockAssignment, MOCK_PRODUCTS)

// Toast Helper
const toastEl = document.querySelector('#toast')
function showToast(msg, isSuccess = true) {
  toastEl.textContent = msg
  toastEl.style.borderColor = isSuccess ? '#10b981' : '#ef4444'
  toastEl.style.display = 'block'
  setTimeout(() => {
    toastEl.style.display = 'none'
  }, 2200)
}

// Event Listeners from Scene
on('slot-click', ({ slotId, slot, product }) => {
  const prodName = product ? product.name : 'Empty'
  showToast(`Selected Slot #${slotId} (${prodName}) - Click another slot to swap!`)
})

on('swap-request', ({ slotA, slotB, productA, productB }) => {
  // Update local assignment
  const prodA = MOCK_PRODUCTS.find(p => mockAssignment[p.id] === slotA)
  const prodB = MOCK_PRODUCTS.find(p => mockAssignment[p.id] === slotB)

  if (prodA) mockAssignment[prodA.id] = slotB
  if (prodB) mockAssignment[prodB.id] = slotA

  setAssignment(mockAssignment, MOCK_PRODUCTS)
  showToast(`Swapped Slot #${slotA} ↔ Slot #${slotB}!`, true)
})

const statDistance = document.querySelector('#stat-distance')
const statTime = document.querySelector('#stat-time')

on('replay-progress', ({ metersWalked, elapsedSec, complete }) => {
  statDistance.textContent = `${metersWalked || 0} m`
  statTime.textContent = `${elapsedSec || 0} s`
  if (complete) {
    document.querySelector('#btn-replay').innerHTML = '<span>▶</span><span>Replay Orders</span>'
  }
})

// ==========================================
// UI TOOLBAR ACTIONS
// ==========================================
document.querySelector('#btn-camera-angled').onclick = (e) => {
  setCameraPreset('angled')
  e.target.style.background = '#334155'
  e.target.style.color = '#fff'
  document.querySelector('#btn-camera-top').style.background = '#1e293b'
  document.querySelector('#btn-camera-top').style.color = '#cbd5e1'
}

document.querySelector('#btn-camera-top').onclick = (e) => {
  setCameraPreset('top')
  e.target.style.background = '#334155'
  e.target.style.color = '#fff'
  document.querySelector('#btn-camera-angled').style.background = '#1e293b'
  document.querySelector('#btn-camera-angled').style.color = '#cbd5e1'
}

function updateModeButtons(activeId) {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    if (btn.id === activeId) {
      btn.style.background = '#f59e0b'
      btn.style.borderColor = '#f59e0b'
      btn.style.color = '#000'
    } else {
      btn.style.background = '#1e293b'
      btn.style.borderColor = '#475569'
      btn.style.color = '#cbd5e1'
    }
  })
}

document.querySelector('#mode-default').onclick = () => {
  setColorMode('default')
  updateModeButtons('mode-default')
}

document.querySelector('#mode-zones').onclick = () => {
  setColorMode('zones')
  updateModeButtons('mode-zones')
}

document.querySelector('#mode-heat').onclick = () => {
  setColorMode('heat', mockHeatmap)
  updateModeButtons('mode-heat')
}

document.querySelector('#mode-regret').onclick = () => {
  setColorMode('regret', mockRegret)
  updateModeButtons('mode-regret')
}

let isReplaying = false
const replayBtn = document.querySelector('#btn-replay')
const speedSelect = document.querySelector('#speed-select')

replayBtn.onclick = () => {
  if (isReplaying) {
    stopReplay()
    isReplaying = false
    replayBtn.innerHTML = '<span>▶</span><span>Replay Orders</span>'
  } else {
    isReplaying = true
    replayBtn.innerHTML = '<span>⏹</span><span>Stop Replay</span>'
    const speed = Number(speedSelect.value) || 5
    playOrders(sampleOrders, {
      speed,
      ghost: true,
      ghostRoutes: sampleGhostOrders
    }).then(() => {
      isReplaying = false
      replayBtn.innerHTML = '<span>▶</span><span>Replay Orders</span>'
      showToast('Replay Complete! Twin Verified ✔', true)
    })
  }
}

let hintActive = false
document.querySelector('#btn-hint').onclick = (e) => {
  hintActive = !hintActive
  if (hintActive) {
    // Highlight top regret slot and optimal dock-adjacent slot
    highlightSlots([238, 2], 'hint')
    e.target.style.background = '#10b981'
    e.target.style.color = '#ffffff'
    showToast('Suggested Move: Swap Fast Movers to front dock slots!')
  } else {
    clearHighlights()
    e.target.style.background = '#1e293b'
    e.target.style.color = '#cbd5e1'
  }
}
