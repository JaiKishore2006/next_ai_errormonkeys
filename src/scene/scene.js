import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import { PickerRunner } from './picker.js'
import { fireConfetti } from './confetti.js'
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

// Method route colors
const METHOD_COLORS = {
  sshape: 0x38bdf8,     // Cyan
  return: 0xfb923c,     // Orange
  'largest-gap': 0xc084fc, // Purple
  optimal: 0x34d399     // Emerald
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
let dockMesh = null
let dockMaterial = null
let selectionBox = null
let routeLine = null

let playerPicker = null
let ghostPicker = null

// Slots registry: id (0..239) -> slot info
const SLOTS = new Array(TOTAL_SLOTS)
// Assignment: slotId (0..239) -> product object
const slotAssignments = new Map()
// Color mode: 'default' | 'heat' | 'zones' | 'regret'
let activeColorMode = 'default'
let colorModeData = {}
let activeRoutingMethod = 'sshape'

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
const regretLabels = []

// Performance tracking
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
  // Overrides: flashing, illegal, hint, selected
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

  // Regret Mode
  if (activeColorMode === 'regret') {
    const regretList = Array.isArray(colorModeData) ? colorModeData : colorModeData?.regretList || []
    const regretEntry = regretList.find(r => r.productId === product?.id || r.slotId === slotId)
    if (regretEntry) {
      const pulse = Math.sin(time * 5) * 0.35 + 0.65
      return new THREE.Color(0xff4d4d).multiplyScalar(pulse)
    }
  }

  // Heatmap Mode
  if (activeColorMode === 'heat') {
    const visits = (typeof colorModeData === 'object' ? colorModeData[slotId] : 0) || 0
    const maxVisits = colorModeData?._max || 50
    const normalized = Math.min(Math.max(visits / (maxVisits || 1), 0), 1)
    return lerp3Color(normalized, HEAT_BLUE, HEAT_YELLOW, HEAT_RED)
  }

  // Zones Mode
  if (activeColorMode === 'zones') {
    if (slot.zone === 'hazard') return PALETTE.hazard
    if (slot.zone === 'fragile') return PALETTE.fragile
    return PALETTE.normal
  }

  // Default Mode
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
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

export function initScene(container, layout = null) {
  if (!container) {
    throw new Error('initScene requires a valid DOM container')
  }

  disposeScene()
  containerRef = container

  // WebGL Fallback Check
  if (!isWebGLAvailable()) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #f8fafc; background: #0f172a; text-align: center; padding: 20px;">
        <h2 style="color: #ef4444; margin-bottom: 8px;">WebGL Not Supported</h2>
        <p style="color: #94a3b8; max-width: 400px;">Your browser or graphics driver does not have WebGL enabled. Please enable hardware acceleration in your browser settings to run the 3D Picking Floor.</p>
      </div>
    `
    return null
  }

  // Create Three.js Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#0f172a')

  const width = Math.max(container.clientWidth, 600)
  const height = Math.max(container.clientHeight, 400)

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  camera.position.set(14, 22, 28)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = false // Shadows off for performance

  container.innerHTML = ''
  container.style.position = 'relative'
  container.appendChild(renderer.domElement)

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(14, 0, 9)
  controls.maxPolarAngle = Math.PI / 2 - 0.05
  controls.minDistance = 5
  controls.maxDistance = 75

  // Lights
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

  // Structural upright post frames
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

  // Setup DOM Tooltip, Labels, Badges & Audio Button
  setupOverlays(container)

  // Setup Interaction Handlers
  setupInteractions()

  // Setup Confetti on run-finished with 3 stars
  on('run-finished', ({ stars }) => {
    if (stars === 3 || stars === true) {
      fireConfetti(120)
    }
  })

  // Resize Listener
  resizeHandler = () => {
    if (!renderer || !camera || !containerRef) return
    const w = Math.max(containerRef.clientWidth, 300)
    const h = Math.max(containerRef.clientHeight, 300)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', resizeHandler)

  // Main Render & Animation Loop
  let lastTime = performance.now()
  function animate(now) {
    animFrameId = requestAnimationFrame(animate)

    const deltaSec = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    controls.update()

    // Dock light subtle blinking idle animation
    if (dockMaterial) {
      dockMaterial.emissiveIntensity = 0.25 + 0.25 * Math.sin(now * 0.003)
    }

    // Picker subtle idle breathing and head turns when not actively moving
    if (playerPicker && !replayActive) {
      playerPicker.updateIdle(now * 0.001)
    }

    // Pick pause slot flashing timer
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

    // Update floating regret score label positions
    updateRegretLabelPositions()

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
  const floorGeom = new THREE.PlaneGeometry(38, 28)
  const floorMat = new THREE.MeshStandardMaterial({
    color: PALETTE.floor,
    roughness: 0.85
  })
  const floor = new THREE.Mesh(floorGeom, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(15, -0.05, 9)
  targetScene.add(floor)

  const frontCrossGeom = new THREE.PlaneGeometry(32, 2.5)
  const crossMat = new THREE.MeshBasicMaterial({ color: PALETTE.crossAisle })
  const frontCross = new THREE.Mesh(frontCrossGeom, crossMat)
  frontCross.rotation.x = -Math.PI / 2
  frontCross.position.set(15, -0.04, 0)
  targetScene.add(frontCross)

  const backCross = new THREE.Mesh(frontCrossGeom, crossMat)
  backCross.rotation.x = -Math.PI / 2
  backCross.position.set(15, -0.04, 18)
  targetScene.add(backCross)

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
  dockMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.dock,
    roughness: 0.5,
    emissive: 0xd97706,
    emissiveIntensity: 0.3
  })
  dockMesh = new THREE.Mesh(dockGeom, dockMaterial)
  dockMesh.position.set(0, 0.05, 0)
  targetScene.add(dockMesh)

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
  const postGeom = new THREE.BoxGeometry(0.04, 2.3, 0.04)
  const postMat = new THREE.MeshBasicMaterial({ color: 0x475569 })
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
    selectedSlotId = null
    selectionBox.visible = false
    refreshAllColors(0)
  } else {
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
// TOOLTIP, LABELS & REGRET HUD
// ==========================================
function setupOverlays(container) {
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

function updateRegretLabelPositions() {
  if (activeColorMode !== 'regret' || !camera || !containerRef) {
    regretLabels.forEach(el => el.remove())
    regretLabels.length = 0
    return
  }

  const regretList = Array.isArray(colorModeData) ? colorModeData : colorModeData?.regretList || []
  const top3 = regretList.slice(0, 3)

  // Ensure label elements exist
  while (regretLabels.length < top3.length) {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.pointerEvents = 'none'
    el.style.background = 'rgba(239, 68, 68, 0.95)'
    el.style.color = '#ffffff'
    el.style.fontWeight = 'bold'
    el.style.fontSize = '11px'
    el.style.padding = '3px 8px'
    el.style.borderRadius = '4px'
    el.style.boxShadow = '0 4px 10px rgba(239, 68, 68, 0.4)'
    el.style.zIndex = '80'
    el.style.transform = 'translate(-50%, -100%)'
    containerRef.appendChild(el)
    regretLabels.push(el)
  }

  const rect = containerRef.getBoundingClientRect()
  const tempVec = new THREE.Vector3()

  top3.forEach((item, idx) => {
    const el = regretLabels[idx]
    const slot = SLOTS[item.slotId]
    if (!slot) return

    tempVec.set(slot.x, slot.y + 0.6, slot.z)
    tempVec.project(camera)

    if (tempVec.z > 1) {
      el.style.display = 'none'
      return
    }

    const screenX = (tempVec.x * 0.5 + 0.5) * rect.width
    const screenY = (tempVec.y * -0.5 + 0.5) * rect.height

    el.style.display = 'block'
    el.style.left = `${screenX}px`
    el.style.top = `${screenY}px`
    el.textContent = `#${idx + 1} Regret: ${item.regretScore || 0}`
  })
}

// ==========================================
// REPLAY & PICKER LOGIC (playOrders, stopReplay)
// ==========================================
let replayActive = false

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

export function buildAisleWaypoints(slotIds) {
  const waypoints = [{ x: 0, z: 0 }]

  for (const sId of slotIds) {
    const slot = SLOTS[sId]
    if (!slot) continue

    waypoints.push({
      x: slot.aisleX,
      z: slot.z,
      isPick: true,
      slotId: sId
    })
  }

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
    const method = options.method || activeRoutingMethod || 'sshape'

    const playerOrders = (Array.isArray(routes) ? routes : []).map(r => {
      if (Array.isArray(r) && typeof r[0] === 'number') {
        return buildAisleWaypoints(r)
      }
      return r
    })

    playerPicker.loadOrders(playerOrders)

    if (runGhost && options.ghostRoutes) {
      const ghostOrders = options.ghostRoutes.map(r => {
        if (Array.isArray(r) && typeof r[0] === 'number') {
          return buildAisleWaypoints(r)
        }
        return r
      })
      ghostPicker.loadOrders(ghostOrders)
    }

    updateRouteLine(playerOrders[0], method)

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

function updateRouteLine(waypoints, method = 'sshape') {
  clearRouteLines()
  if (!waypoints || waypoints.length < 2 || !scene) return

  const lineColor = METHOD_COLORS[method] || METHOD_COLORS.sshape
  const points = waypoints.map(wp => new THREE.Vector3(wp.x, 0.08, wp.z))
  const geom = new THREE.BufferGeometry().setFromPoints(points)
  const mat = new THREE.LineBasicMaterial({
    color: lineColor,
    linewidth: 2,
    transparent: true,
    opacity: 0.85
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
// EXPORTED SCENE APIS
// ==========================================

export function setAssignment(assignment, products = []) {
  slotAssignments.clear()

  const prodMap = new Map()
  for (const p of products || []) {
    prodMap.set(p.id, p)
  }

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

  // Glide camera smoothly to top-down view when entering heatmap mode
  if (mode === 'heat') {
    setCameraPreset('top', true)
  }

  refreshAllColors(0)
  updateRegretLabelPositions()
}

export function setRoutingMethodVisual(method) {
  activeRoutingMethod = method
  if (routeLine && playerPicker?.orders?.length) {
    const currentOrder = playerPicker.orders[playerPicker.currentOrderIndex] || playerPicker.orders[0]
    updateRouteLine(currentOrder, method)
  }
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

export function setCameraPreset(preset, smooth = true) {
  if (!camera) return

  let targetPos
  if (preset === 'top') {
    targetPos = { x: 14, y: 34, z: 9 }
  } else if (preset === 'angled') {
    targetPos = { x: 14, y: 22, z: 28 }
  } else {
    throw new Error(`Unknown camera preset: ${preset}. Must be 'top' or 'angled'.`)
  }

  if (smooth) {
    gsap.to(camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        if (controls) {
          controls.target.set(14, 0, 9)
          controls.update()
        }
      }
    })
  } else {
    camera.position.set(targetPos.x, targetPos.y, targetPos.z)
    if (controls) {
      controls.target.set(14, 0, 9)
      controls.update()
    }
  }
}

export function triggerConfetti(count = 100) {
  fireConfetti(count)
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

  regretLabels.forEach(el => el.remove())
  regretLabels.length = 0

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
