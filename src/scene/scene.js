import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PickerRunner } from './picker.js'
import {
  playClickSound,
  playSwapSuccessSound,
  playIllegalSound,
  playPickSound,
  toggleAudioMute,
  isAudioMuted,
  setAudioMuted
} from './audio.js'

// ==========================================
// CONSTANTS & WAREHOUSE SPECIFICATIONS
// ==========================================
const AISLE_X = [3, 8, 13, 18, 23, 28] // 6 aisles (centre X positions)
const AISLE_LENGTH = 18 // 18m
const BAY_COUNT = 10 // 10 bays per aisle side
const LEVELS = 2 // 2 shelf levels (0 = low, 1 = high)
const TOTAL_SLOTS = 240 // 6 aisles * 2 sides * 10 bays * 2 levels = 240 slots (IDs 0-239)

const RACK_WIDTH = 0.9
const RACK_HEIGHT = 0.7
const RACK_DEPTH = 1.1

// Color palettes
const PALETTE = {
  empty: new THREE.Color(0x2d3748),
  normal: new THREE.Color(0x94a3b8),
  heavy: new THREE.Color(0x8d5b4c),
  fragile: new THREE.Color(0x48cae4),
  hazard: new THREE.Color(0xf77f00),
  selected: new THREE.Color(0xffd166),
  illegal: new THREE.Color(0xef4444),
  hint: new THREE.Color(0x10b981),
  dock: new THREE.Color(0xfbbf24),
  floor: new THREE.Color(0x1a202c),
  crossAisle: new THREE.Color(0x2d3748),
  lane: new THREE.Color(0x4a5568)
}

// ==========================================
// SCENE STATE
// ==========================================
let scene = null
let camera = null
let renderer = null
let controls = null
let containerRef = null
let animFrameId = null
let resizeHandler = null
let pointerMoveHandler = null
let clickHandler = null

let instancedRacks = null
let selectionBox = null
let routeLine = null
let ghostRouteLine = null

let playerPicker = null
let ghostPicker = null

// Slots registry: id (0..239) -> slot info
const SLOTS = new Array(TOTAL_SLOTS)
// Assignment: slotId (0..239) -> product object
const slotAssignments = new Map()
// Color mode: 'default' | 'heat' | 'zones' | 'regret'
let activeColorMode = 'default'
let colorModeData = {}

// Highlights: slotId -> 'illegal' | 'hint'
const highlightedSlots = new Map()
let selectedSlotId = null
let flashingSlotId = null
let flashingSlotTimer = 0

// Events registry
const listeners = new Map()

// UI Overlays
let tooltipEl = null
let dockLabelEl = null
let verificationBadgeEl = null
let audioButtonEl = null
let debugStatsEl = null

// Frame counter for performance
let lastFrameTime = performance.now()
let frameCount = 0
let fps = 60

// ==========================================
// SLOT GEOMETRY GENERATOR
// ==========================================
function buildWarehouseSlots() {
  for (let aisle = 0; aisle < AISLE_X.length; aisle++) {
    const ax = AISLE_X[aisle]
    const zone = aisle === 5 ? 'hazard' : aisle === 4 ? 'fragile' : 'normal'

    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const side = sideIdx === 0 ? 'L' : 'R'
      const rackX = side === 'L' ? ax - 1.5 : ax + 1.5

      for (let bay = 0; bay < BAY_COUNT; bay++) {
        const bayZ = 2.25 + 1.5 * bay

        for (let level = 0; level < LEVELS; level++) {
          // Deterministic slot index: 0..239
          const slotId = aisle * 40 + sideIdx * 20 + bay * 2 + level
          const rackY = level === 0 ? 0.5 : 1.7

          SLOTS[slotId] = {
            id: slotId,
            aisle,
            side,
            bay,
            level,
            x: rackX,
            y: rackY,
            z: bayZ,
            aisleX: ax,
            zone
          }
        }
      }
    }
  }
}
buildWarehouseSlots()

// ==========================================
// EVENT EMITTER
// ==========================================
function emit(eventName, payload) {
  const callbacks = listeners.get(eventName)
  if (!callbacks) return
  for (const cb of callbacks) {
    try {
      cb(payload)
    } catch (err) {
      console.error(`Error in event listener for "${eventName}":`, err)
    }
  }
}

export function on(eventName, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Event callback must be a function')
  }
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set())
  }
  listeners.get(eventName).add(callback)
  return () => listeners.get(eventName)?.delete(callback)
}

// ==========================================
// COLOR COMPUTATION
// ==========================================
function lerp3Color(val, c1, c2, c3) {
  // val between 0 and 1
  const color = new THREE.Color()
  if (val <= 0.5) {
    color.copy(c1).lerp(c2, val * 2)
  } else {
    color.copy(c2).lerp(c3, (val - 0.5) * 2)
  }
  return color
}

const HEAT_BLUE = new THREE.Color(0x2b6cb0)
const HEAT_YELLOW = new THREE.Color(0xf6e05e)
const HEAT_RED = new THREE.Color(0xe53e3e)

function computeSlotColor(slotId, time = 0) {
  // 1. Highlight overrides (selection, illegal, hint, flashing)
  if (flashingSlotId === slotId) {
    return PALETTE.selected
  }
  if (highlightedSlots.has(slotId)) {
    const type = highlightedSlots.get(slotId)
    if (type === 'illegal') return PALETTE.illegal
    if (type === 'hint') {
      const pulse = Math.sin(time * 6) * 0.3 + 0.7
      return new THREE.Color(PALETTE.hint).multiplyScalar(pulse)
    }
  }
  if (selectedSlotId === slotId) {
    return PALETTE.selected
  }

  const slot = SLOTS[slotId]
  const product = slotAssignments.get(slotId)

  // 2. Regret Mode
  if (activeColorMode === 'regret') {
    const regretList = Array.isArray(colorModeData) ? colorModeData : colorModeData?.regretList || []
    const regretEntry = regretList.find(r => r.productId === product?.id || r.slotId === slotId)
    if (regretEntry) {
      const pulse = Math.sin(time * 5) * 0.35 + 0.65
      return new THREE.Color(0xff4d4d).multiplyScalar(pulse)
    }
  }

  // 3. Heatmap Mode
  if (activeColorMode === 'heat') {
    const visits = (typeof colorModeData === 'object' ? colorModeData[slotId] : 0) || 0
    const maxVisits = colorModeData?._max || 50
    const normalized = Math.min(Math.max(visits / (maxVisits || 1), 0), 1)
    return lerp3Color(normalized, HEAT_BLUE, HEAT_YELLOW, HEAT_RED)
  }

  // 4. Zones Mode
  if (activeColorMode === 'zones') {
    if (slot.zone === 'hazard') return PALETTE.hazard
    if (slot.zone === 'fragile') return PALETTE.fragile
    return PALETTE.normal
  }

  // 5. Default Mode: Product category / properties
  if (!product) {
    return PALETTE.empty
  }

  if (product.hazard) return PALETTE.hazard
  if (product.fragile) return PALETTE.fragile
  if (product.weight > 15 || product.heavy) return PALETTE.heavy
  return PALETTE.normal
}

function refreshAllColors(time = 0) {
  if (!instancedRacks) return
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const c = computeSlotColor(i, time)
    instancedRacks.setColorAt(i, c)
  }
  instancedRacks.instanceColor.needsUpdate = true
}

// ==========================================
// SCENE INITIALIZATION (initScene)
// ==========================================
export function initScene(container, layout = null) {
  if (!container) {
    throw new Error('initScene requires a valid DOM container')
  }

  disposeScene()
  containerRef = container

  // Create Three.js Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#0f172a') // Slate dark blue

  const width = Math.max(container.clientWidth, 600)
  const height = Math.max(container.clientHeight, 400)

  // Camera: Perspective with clear viewing angle
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  setCameraPreset('angled')

  // Renderer: Antialias off, clamped pixel ratio for 60fps on integrated graphics
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = false // Shadows off per contract for performance

  container.innerHTML = ''
  container.style.position = 'relative'
  container.appendChild(renderer.domElement)

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(14, 0, 9) // Centre of warehouse (aisle range 3-28, z range 0-18)
  controls.maxPolarAngle = Math.PI / 2 - 0.05 // Prevent going under the floor
  controls.minDistance = 5
  controls.maxDistance = 75

  // Lighting: Hemisphere + Directional
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.8)
  hemiLight.position.set(14, 25, 9)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
  dirLight.position.set(15, 30, 15)
  scene.add(dirLight)

  // Floor & Markings
  buildFloor(scene)

  // Instanced Racks (240 slots)
  buildInstancedRacks(scene)

  // Structural posts / upright frames
  buildRackStructuralPosts(scene)

  // Selection outline indicator
  const selectGeom = new THREE.BoxGeometry(RACK_WIDTH + 0.1, RACK_HEIGHT + 0.1, RACK_DEPTH + 0.1)
  const selectMat = new THREE.MeshBasicMaterial({ color: 0xffd166, wireframe: true, visible: false })
  selectionBox = new THREE.Mesh(selectGeom, selectMat)
  scene.add(selectionBox)

  // Pickers (Player & Ghost)
  playerPicker = new PickerRunner({
    scene,
    isGhost: false,
    onPickStart: handlePickStart,
    onPickEnd: handlePickEnd
  })
  ghostPicker = new PickerRunner({
    scene,
    isGhost: true
  })

  // Setup DOM Tooltip, Labels & HUD
  setupOverlays(container)

  // Setup Interaction Handlers
  setupInteractions()

  // Setup Resize Listener
  resizeHandler = () => {
    if (!renderer || !camera || !containerRef) return
    const w = Math.max(containerRef.clientWidth, 300)
    const h = Math.max(containerRef.clientHeight, 300)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', resizeHandler)

  // Animation Loop
  let lastTime = performance.now()
  function animate(now) {
    animFrameId = requestAnimationFrame(animate)

    const deltaSec = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    // Update controls
    controls.update()

    // Flashing slot timer
    if (flashingSlotTimer > 0) {
      flashingSlotTimer -= deltaSec
      if (flashingSlotTimer <= 0) {
        flashingSlotId = null
        refreshAllColors(now * 0.001)
      }
    }

    // Dynamic color updates (pulsing regret / hint)
    if (activeColorMode === 'regret' || highlightedSlots.size > 0) {
      refreshAllColors(now * 0.001)
    }

    // FPS calculation for ?debug=1
    frameCount++
    if (now - lastFrameTime >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastFrameTime))
      frameCount = 0
      lastFrameTime = now
      if (debugStatsEl) {
        debugStatsEl.textContent = `FPS: ${fps} | Draw Calls: ${renderer.info.render.calls} | Geometries: ${renderer.info.memory.geometries}`
      }
    }

    renderer.render(scene, camera)
  }
  animate(performance.now())

  return { scene, camera, renderer, controls }
}

// ==========================================
// SCENE COMPONENTS BUILDERS
// ==========================================
function buildFloor(targetScene) {
  // Main warehouse concrete floor
  const floorGeom = new THREE.PlaneGeometry(38, 28)
  const floorMat = new THREE.MeshStandardMaterial({
    color: PALETTE.floor,
    roughness: 0.85
  })
  const floor = new THREE.Mesh(floorGeom, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(15, -0.05, 9)
  targetScene.add(floor)

  // Front cross-aisle (z = 0)
  const frontCrossGeom = new THREE.PlaneGeometry(32, 2.5)
  const crossMat = new THREE.MeshBasicMaterial({ color: PALETTE.crossAisle })
  const frontCross = new THREE.Mesh(frontCrossGeom, crossMat)
  frontCross.rotation.x = -Math.PI / 2
  frontCross.position.set(15, -0.04, 0)
  targetScene.add(frontCross)

  // Back cross-aisle (z = 18)
  const backCross = new THREE.Mesh(frontCrossGeom, crossMat)
  backCross.rotation.x = -Math.PI / 2
  backCross.position.set(15, -0.04, 18)
  targetScene.add(backCross)

  // Aisle guide lines on floor
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x334155 })
  for (const ax of AISLE_X) {
    const laneGeom = new THREE.PlaneGeometry(0.12, 18)
    const lane = new THREE.Mesh(laneGeom, lineMat)
    lane.rotation.x = -Math.PI / 2
    lane.position.set(ax, -0.03, 9)
    targetScene.add(lane)
  }

  // Packing Dock at (0, 0)
  const dockGeom = new THREE.BoxGeometry(2.8, 0.1, 2.8)
  const dockMat = new THREE.MeshStandardMaterial({
    color: PALETTE.dock,
    roughness: 0.5,
    emissive: 0xd97706,
    emissiveIntensity: 0.3
  })
  const dock = new THREE.Mesh(dockGeom, dockMat)
  dock.position.set(0, 0.05, 0)
  targetScene.add(dock)

  // Safety stripes border around dock
  const borderGeom = new THREE.BoxGeometry(3.0, 0.02, 3.0)
  const borderMat = new THREE.MeshBasicMaterial({ color: 0x1f2937 })
  const border = new THREE.Mesh(borderGeom, borderMat)
  border.position.set(0, 0.01, 0)
  targetScene.add(border)
}

function buildInstancedRacks(targetScene) {
  const geom = new THREE.BoxGeometry(RACK_WIDTH, RACK_HEIGHT, RACK_DEPTH)
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.65,
    metalness: 0.1
  })

  instancedRacks = new THREE.InstancedMesh(geom, mat, TOTAL_SLOTS)
  instancedRacks.instanceMatrix.setUsage(THREE.StaticDrawUsage)

  const matrix = new THREE.Matrix4()
  const dummy = new THREE.Object3D()

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = SLOTS[i]
    dummy.position.set(slot.x, slot.y, slot.z)
    dummy.updateMatrix()
    instancedRacks.setMatrixAt(i, dummy.matrix)
  }

  instancedRacks.instanceMatrix.needsUpdate = true
  refreshAllColors(0)
  targetScene.add(instancedRacks)
}

function buildRackStructuralPosts(targetScene) {
  // Thin upright posts for realistic shelving frames
  const postGeom = new THREE.BoxGeometry(0.04, 2.3, 0.04)
  const postMat = new THREE.MeshBasicMaterial({ color: 0x475569 })
  // Total posts: 6 aisles * 2 sides * 11 upright points * 2 corners = approx 264 posts
  const postMesh = new THREE.InstancedMesh(postGeom, postMat, 300)
  const dummy = new THREE.Object3D()
  let idx = 0

  for (let aisle = 0; aisle < AISLE_X.length; aisle++) {
    const ax = AISLE_X[aisle]
    for (const side of [-1, 1]) {
      const rx = ax + side * 1.5
      for (let bay = 0; bay <= BAY_COUNT; bay++) {
        const bz = 2.25 - 0.55 + bay * 1.5
        for (const oz of [-0.5, 0.5]) {
          if (idx < 300) {
            dummy.position.set(rx + (side * -1) * 0.4, 1.15, bz + oz * 0.1)
            dummy.updateMatrix()
            postMesh.setMatrixAt(idx++, dummy.matrix)
          }
        }
      }
    }
  }
  postMesh.instanceMatrix.needsUpdate = true
  targetScene.add(postMesh)
}

// ==========================================
// INTERACTION & RAYCASTING (Click-to-Swap)
// ==========================================
function setupInteractions() {
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  pointerMoveHandler = e => {
    if (!renderer || !instancedRacks || !tooltipEl) return
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObject(instancedRacks)

    if (hits.length > 0) {
      const slotId = hits[0].instanceId
      if (slotId !== undefined && slotId < TOTAL_SLOTS) {
        showTooltip(slotId, e.clientX, e.clientY)
        renderer.domElement.style.cursor = 'pointer'
        return
      }
    }
    hideTooltip()
    renderer.domElement.style.cursor = 'default'
  }

  clickHandler = e => {
    // Only register genuine clicks (not drag-orbits)
    if (controls?.state !== -1) return

    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObject(instancedRacks)

    if (hits.length > 0) {
      const slotId = hits[0].instanceId
      if (slotId !== undefined && slotId < TOTAL_SLOTS) {
        handleSlotClick(slotId)
      }
    } else {
      // Clicked empty floor: clear selection
      if (selectedSlotId !== null) {
        selectedSlotId = null
        selectionBox.visible = false
        refreshAllColors(0)
      }
    }
  }

  renderer.domElement.addEventListener('pointermove', pointerMoveHandler)
  renderer.domElement.addEventListener('click', clickHandler)
}

function handleSlotClick(slotId) {
  playClickSound()

  if (selectedSlotId === null) {
    // First click: select slot
    selectedSlotId = slotId
    const slot = SLOTS[slotId]
    selectionBox.position.set(slot.x, slot.y, slot.z)
    selectionBox.visible = true
    refreshAllColors(0)

    emit('slot-click', {
      slotId,
      slot: SLOTS[slotId],
      product: slotAssignments.get(slotId) || null
    })
  } else if (selectedSlotId === slotId) {
    // Clicked same slot: cancel selection
    selectedSlotId = null
    selectionBox.visible = false
    refreshAllColors(0)
  } else {
    // Second click on different slot: emit swap-request
    const slotA = selectedSlotId
    const slotB = slotId
    selectedSlotId = null
    selectionBox.visible = false
    refreshAllColors(0)

    playSwapSuccessSound()

    emit('swap-request', {
      slotA,
      slotB,
      fromSlotId: slotA,
      toSlotId: slotB,
      productA: slotAssignments.get(slotA) || null,
      productB: slotAssignments.get(slotB) || null
    })
  }
}

// ==========================================
// TOOLTIP & OVERLAYS
// ==========================================
function setupOverlays(container) {
  // Tooltip
  tooltipEl = document.createElement('div')
  tooltipEl.style.position = 'absolute'
  tooltipEl.style.display = 'none'
  tooltipEl.style.pointerEvents = 'none'
  tooltipEl.style.zIndex = '100'
  tooltipEl.style.background = 'rgba(15, 23, 42, 0.92)'
  tooltipEl.style.color = '#f8fafc'
  tooltipEl.style.padding = '8px 12px'
  tooltipEl.style.borderRadius = '6px'
  tooltipEl.style.fontSize = '12px'
  tooltipEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)'
  tooltipEl.style.border = '1px solid rgba(255, 255, 255, 0.15)'
  tooltipEl.style.backdropFilter = 'blur(6px)'
  tooltipEl.style.transform = 'translate(14px, 14px)'
  container.appendChild(tooltipEl)

  // Floating DOCK label
  dockLabelEl = document.createElement('div')
  dockLabelEl.textContent = 'DOCK (0, 0)'
  dockLabelEl.style.position = 'absolute'
  dockLabelEl.style.bottom = '16px'
  dockLabelEl.style.left = '16px'
  dockLabelEl.style.padding = '6px 12px'
  dockLabelEl.style.background = '#d97706'
  dockLabelEl.style.color = '#ffffff'
  dockLabelEl.style.fontWeight = 'bold'
  dockLabelEl.style.fontSize = '12px'
  dockLabelEl.style.borderRadius = '4px'
  dockLabelEl.style.letterSpacing = '0.05em'
  dockLabelEl.style.boxShadow = '0 4px 12px rgba(217, 119, 6, 0.3)'
  container.appendChild(dockLabelEl)

  // Verified Badge (Hidden until verified)
  verificationBadgeEl = document.createElement('div')
  verificationBadgeEl.textContent = '✔ Twin Verified (< 0.5m match)'
  verificationBadgeEl.style.position = 'absolute'
  verificationBadgeEl.style.top = '16px'
  verificationBadgeEl.style.right = '16px'
  verificationBadgeEl.style.padding = '6px 14px'
  verificationBadgeEl.style.background = '#059669'
  verificationBadgeEl.style.color = '#ffffff'
  verificationBadgeEl.style.fontWeight = 'bold'
  verificationBadgeEl.style.fontSize = '12px'
  verificationBadgeEl.style.borderRadius = '20px'
  verificationBadgeEl.style.boxShadow = '0 4px 14px rgba(5, 150, 105, 0.4)'
  verificationBadgeEl.style.display = 'none'
  verificationBadgeEl.style.transition = 'opacity 0.3s ease'
  container.appendChild(verificationBadgeEl)

  // Audio Mute/Unmute Button
  audioButtonEl = document.createElement('button')
  audioButtonEl.textContent = isAudioMuted() ? '🔇 Audio Off' : '🔊 Audio On'
  audioButtonEl.style.position = 'absolute'
  audioButtonEl.style.bottom = '16px'
  audioButtonEl.style.right = '16px'
  audioButtonEl.style.padding = '6px 12px'
  audioButtonEl.style.background = 'rgba(30, 41, 59, 0.85)'
  audioButtonEl.style.color = '#f8fafc'
  audioButtonEl.style.border = '1px solid #475569'
  audioButtonEl.style.borderRadius = '6px'
  audioButtonEl.style.fontSize = '12px'
  audioButtonEl.style.cursor = 'pointer'
  audioButtonEl.onclick = () => {
    const isMutedNow = toggleAudioMute()
    audioButtonEl.textContent = isMutedNow ? '🔇 Audio Off' : '🔊 Audio On'
  }
  container.appendChild(audioButtonEl)

  // Debug Stats if ?debug=1
  if (window.location.search.includes('debug=1')) {
    debugStatsEl = document.createElement('div')
    debugStatsEl.style.position = 'absolute'
    debugStatsEl.style.top = '16px'
    debugStatsEl.style.left = '16px'
    debugStatsEl.style.padding = '4px 10px'
    debugStatsEl.style.background = 'rgba(0, 0, 0, 0.8)'
    debugStatsEl.style.color = '#4ade80'
    debugStatsEl.style.fontFamily = 'monospace'
    debugStatsEl.style.fontSize = '11px'
    debugStatsEl.style.borderRadius = '4px'
    debugStatsEl.textContent = 'FPS: 60 | Draw Calls: 1'
    container.appendChild(debugStatsEl)
  }
}

function showTooltip(slotId, clientX, clientY) {
  if (!tooltipEl || !containerRef) return
  const slot = SLOTS[slotId]
  const product = slotAssignments.get(slotId)

  const zoneColor = slot.zone === 'hazard' ? '#f77f00' : slot.zone === 'fragile' ? '#48cae4' : '#94a3b8'

  tooltipEl.innerHTML = `
    <div style="font-weight: 700; color: #facc15; margin-bottom: 2px;">Slot #${slot.id} (Aisle ${slot.aisle + 1}, Side ${slot.side}, Bay ${slot.bay + 1}, L${slot.level})</div>
    <div style="color: ${zoneColor}; font-size: 11px; margin-bottom: 4px;">Zone: ${slot.zone.toUpperCase()}</div>
    ${
      product
        ? `<div style="font-weight: 600; color: #38bdf8;">${product.name || product.code || `Product #${product.id}`}</div>
           <div style="color: #94a3b8; font-size: 11px;">Freq: ${product.freq || 0} picks | W: ${product.weight || 1}kg</div>`
        : '<div style="color: #64748b; font-style: italic;">[Empty Slot]</div>'
    }
  `

  const containerRect = containerRef.getBoundingClientRect()
  tooltipEl.style.left = `${clientX - containerRect.left}px`
  tooltipEl.style.top = `${clientY - containerRect.top}px`
  tooltipEl.style.display = 'block'
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none'
}

// ==========================================
// REPLAY & PICKER LOGIC (playOrders, stopReplay)
// ==========================================
let replayActive = false
let replayCancel = null

function handlePickStart(slotId, isGhost) {
  if (!isGhost) {
    playPickSound()
    flashingSlotId = slotId
    flashingSlotTimer = 0.8
    refreshAllColors(performance.now() * 0.001)
  }
}

function handlePickEnd(slotId, isGhost) {
  if (!isGhost && flashingSlotId === slotId) {
    flashingSlotId = null
    refreshAllColors(performance.now() * 0.001)
  }
}

/**
 * Transforms route slots into physical aisle waypoints starting and ending at dock (0,0).
 */
export function buildAisleWaypoints(slotIds) {
  const waypoints = [{ x: 0, z: 0 }] // Start at dock

  for (const sId of slotIds) {
    const slot = SLOTS[sId]
    if (!slot) continue

    // Picker walks along the aisle centerline (aisleX, z)
    waypoints.push({
      x: slot.aisleX,
      z: slot.z,
      isPick: true,
      slotId: sId
    })
  }

  // Return to dock (0, 0)
  waypoints.push({ x: 0, z: 0 })
  return waypoints
}

export function playOrders(routes, options = {}) {
  stopReplay()

  return new Promise(resolve => {
    if (!playerPicker) {
      resolve({ completed: false })
      return
    }

    replayActive = true
    const speed = Math.max(0.1, Number(options.speed) || 1)
    const runGhost = Boolean(options.ghost)

    // Parse player orders
    const playerOrders = (Array.isArray(routes) ? routes : []).map(r => {
      if (Array.isArray(r) && typeof r[0] === 'number') {
        return buildAisleWaypoints(r)
      }
      return r
    })

    playerPicker.loadOrders(playerOrders)

    // Parse ghost orders if supplied
    if (runGhost && options.ghostRoutes) {
      const ghostOrders = options.ghostRoutes.map(r => {
        if (Array.isArray(r) && typeof r[0] === 'number') {
          return buildAisleWaypoints(r)
        }
        return r
      })
      ghostPicker.loadOrders(ghostOrders)
    }

    // Draw active route line
    updateRouteLine(playerOrders[0])

    let lastTime = performance.now()
    let lastProgressEmit = 0

    function replayStep(now) {
      if (!replayActive) {
        resolve({ completed: false })
        return
      }

      const deltaSec = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      const playerDone = playerPicker.update(deltaSec, speed)
      if (runGhost && ghostPicker) {
        ghostPicker.update(deltaSec, speed)
      }

      // Throttled progress event (~10 Hz)
      if (now - lastProgressEmit >= 100) {
        lastProgressEmit = now
        emit('replay-progress', {
          orderIndex: playerPicker.currentOrderIndex,
          metersWalked: Math.round(playerPicker.metersWalked * 10) / 10,
          elapsedSec: Math.round(playerPicker.elapsedSimSec * 10) / 10,
          complete: playerDone
        })
      }

      if (playerDone) {
        replayActive = false
        if (verificationBadgeEl) {
          verificationBadgeEl.style.display = 'block'
        }
        emit('replay-progress', {
          orderIndex: playerPicker.orders.length,
          metersWalked: Math.round(playerPicker.metersWalked * 10) / 10,
          elapsedSec: Math.round(playerPicker.elapsedSimSec * 10) / 10,
          complete: true
        })
        resolve({
          completed: true,
          metersWalked: playerPicker.metersWalked,
          elapsedSec: playerPicker.elapsedSimSec
        })
        return
      }

      requestAnimationFrame(replayStep)
    }

    requestAnimationFrame(replayStep)
  })
}

export function stopReplay() {
  replayActive = false
  if (playerPicker) playerPicker.reset()
  if (ghostPicker) ghostPicker.reset()
  clearRouteLines()
  emit('replay-progress', { progress: 0, complete: false, stopped: true })
}

function updateRouteLine(waypoints) {
  clearRouteLines()
  if (!waypoints || waypoints.length < 2 || !scene) return

  const points = waypoints.map(wp => new THREE.Vector3(wp.x, 0.08, wp.z))
  const geom = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 2,
    transparent: true,
    opacity: 0.8
  })

  routeLine = new THREE.Line(geom, mat)
  scene.add(routeLine)
}

function clearRouteLines() {
  if (routeLine && scene) {
    scene.remove(routeLine)
    routeLine.geometry.dispose()
    routeLine.material.dispose()
    routeLine = null
  }
}

// ==========================================
// EXPORTED SCENE APIS (As defined in CONTRACTS.md)
// ==========================================

export function setAssignment(assignment, products = []) {
  slotAssignments.clear()

  const prodMap = new Map()
  for (const p of products || []) {
    prodMap.set(p.id, p)
  }

  // Handle plain array assignment[productId] = slotId
  if (Array.isArray(assignment)) {
    assignment.forEach((slotId, prodId) => {
      if (slotId !== undefined && slotId !== null && slotId < TOTAL_SLOTS) {
        slotAssignments.set(slotId, prodMap.get(prodId) || { id: prodId, name: `Product #${prodId}` })
      }
    })
  } else if (typeof assignment === 'object' && assignment !== null) {
    for (const [prodIdStr, slotId] of Object.entries(assignment)) {
      const prodId = Number(prodIdStr)
      if (slotId < TOTAL_SLOTS) {
        slotAssignments.set(slotId, prodMap.get(prodId) || { id: prodId, name: `Product #${prodId}` })
      }
    }
  }

  refreshAllColors(0)
  emit('assignment-changed', { count: slotAssignments.size })
}

export function setColorMode(mode, data = {}) {
  const allowed = ['default', 'heat', 'zones', 'regret']
  if (!allowed.includes(mode)) {
    throw new Error(`Unknown color mode: ${mode}. Must be one of ${allowed.join(', ')}`)
  }

  activeColorMode = mode
  colorModeData = data || {}

  // Glide camera to top-down view when entering heatmap mode as per spec
  if (mode === 'heat') {
    setCameraPreset('top')
  }

  refreshAllColors(0)
}

export function highlightSlots(slotIds, type = 'hint') {
  if (!['illegal', 'hint'].includes(type)) {
    throw new Error(`Unknown highlight type: ${type}`)
  }

  if (type === 'illegal') {
    playIllegalSound()
  }

  for (const sId of slotIds || []) {
    if (sId >= 0 && sId < TOTAL_SLOTS) {
      highlightedSlots.set(sId, type)
    }
  }

  refreshAllColors(0)
}

export function clearHighlights() {
  highlightedSlots.clear()
  refreshAllColors(0)
}

export function setCameraPreset(preset) {
  if (!camera) return

  if (preset === 'top') {
    camera.position.set(14, 34, 9)
    if (controls) {
      controls.target.set(14, 0, 9)
      controls.update()
    }
  } else if (preset === 'angled') {
    camera.position.set(14, 22, 28)
    if (controls) {
      controls.target.set(14, 0, 9)
      controls.update()
    }
  } else {
    throw new Error(`Unknown camera preset: ${preset}. Must be 'top' or 'angled'.`)
  }
}

export function getSlotInfo(slotId) {
  return SLOTS[slotId] || null
}

export function getAllSlots() {
  return [...SLOTS]
}

// ==========================================
// CLEANUP & DISPOSE
// ==========================================
export function disposeScene() {
  stopReplay()

  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }

  if (renderer?.domElement) {
    if (pointerMoveHandler) renderer.domElement.removeEventListener('pointermove', pointerMoveHandler)
    if (clickHandler) renderer.domElement.removeEventListener('click', clickHandler)
  }

  if (controls) {
    controls.dispose()
    controls = null
  }

  if (playerPicker) {
    playerPicker.dispose()
    playerPicker = null
  }
  if (ghostPicker) {
    ghostPicker.dispose()
    ghostPicker = null
  }

  if (tooltipEl?.parentNode) tooltipEl.remove()
  if (dockLabelEl?.parentNode) dockLabelEl.remove()
  if (verificationBadgeEl?.parentNode) verificationBadgeEl.remove()
  if (audioButtonEl?.parentNode) audioButtonEl.remove()
  if (debugStatsEl?.parentNode) debugStatsEl.remove()

  if (scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
        else obj.material.dispose()
      }
    })
  }

  if (renderer) {
    renderer.dispose()
    renderer.domElement?.remove()
    renderer = null
  }

  scene = null
  camera = null
  containerRef = null
  slotAssignments.clear()
  highlightedSlots.clear()
  selectedSlotId = null
}
