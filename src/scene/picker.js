import * as THREE from 'three'

/**
 * Creates a low-poly stylized picker avatar with a hi-vis safety vest and picking trolley.
 * @param {Object} options
 * @param {boolean} options.isGhost - If true, renders a translucent ghost for baseline replay.
 * @returns {THREE.Group}
 */
export function createPickerMesh({ isGhost = false } = {}) {
  const group = new THREE.Group()

  const opacity = isGhost ? 0.45 : 1.0
  const transparent = isGhost

  // Materials
  const vestColor = isGhost ? 0x81e6d9 : 0xf6ad55 // Ghost = translucent cyan, Player = vibrant safety orange/yellow
  const bodyColor = isGhost ? 0x718096 : 0x2b6cb0 // Darker jumpsuit for player
  const skinColor = isGhost ? 0xa0aec0 : 0xfbd38d
  const hatColor = isGhost ? 0xe2e8f0 : 0xffffff

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.8,
    transparent,
    opacity
  })

  const vestMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.5,
    emissive: isGhost ? 0x319795 : 0xdd6b20,
    emissiveIntensity: isGhost ? 0.3 : 0.6,
    transparent,
    opacity
  })

  const hatMat = new THREE.MeshStandardMaterial({
    color: hatColor,
    roughness: 0.4,
    transparent,
    opacity
  })

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.9,
    transparent,
    opacity
  })

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x4a5568,
    metalness: 0.6,
    roughness: 0.4,
    transparent,
    opacity
  })

  // Torso & legs
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.24), vestMat)
  torso.position.y = 0.55
  group.add(torso)

  // Reflective stripe across vest
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
    transparent,
    opacity: isGhost ? 0.4 : 0.9
  })
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.08, 0.25), stripeMat)
  stripe.position.y = 0.55
  group.add(stripe)

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.22), bodyMat)
  legs.position.y = 0.2
  group.add(legs)

  // Head and Safety Helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skinMat)
  head.position.y = 0.9
  group.add(head)

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hatMat)
  helmet.position.y = 0.93
  group.add(helmet)

  // Small Picking Trolley / Cart behind picker
  const cartGroup = new THREE.Group()
  cartGroup.position.set(0, 0, -0.42)

  const cartBed = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.5), metalMat)
  cartBed.position.y = 0.12
  cartGroup.add(cartBed)

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), metalMat)
  handle.rotation.x = Math.PI / 6
  handle.position.set(0, 0.35, 0.22)
  cartGroup.add(handle)

  // Wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.9, transparent, opacity })
  const wheelGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10)
  wheelGeom.rotateZ(Math.PI / 2)

  for (const [wx, wz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat)
    wheel.position.set(wx, 0.06, wz)
    cartGroup.add(wheel)
  }

  // Totes / boxes in the cart
  const boxMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0xa0aec0 : 0x3182ce,
    roughness: 0.7,
    transparent,
    opacity
  })
  const tote = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.4), boxMat)
  tote.position.y = 0.24
  cartGroup.add(tote)

  group.add(cartGroup)

  return group
}

/**
 * Calculates distance between two 2D points (x, z)
 */
function dist2D(p1, p2) {
  const dx = p1.x - p2.x
  const dz = p1.z - p2.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * PickerRunner manages replay execution for a sequence of orders and waypoints.
 */
export class PickerRunner {
  constructor({ scene, isGhost = false, onPickStart, onPickEnd }) {
    this.scene = scene
    this.isGhost = isGhost
    this.onPickStart = onPickStart
    this.onPickEnd = onPickEnd

    this.mesh = createPickerMesh({ isGhost })
    this.mesh.visible = false
    this.scene.add(this.mesh)

    this.reset()
  }

  reset() {
    this.active = false
    this.mesh.visible = false
    this.mesh.position.set(0, 0, 0)
    this.mesh.rotation.y = 0

    this.orders = []
    this.currentOrderIndex = 0
    this.segments = [] // array of { start, end, dist, isPickStop, slotId }
    this.currentSegmentIndex = 0
    this.segmentProgress = 0 // 0 to 1 along current segment

    this.metersWalked = 0
    this.elapsedSimSec = 0
    this.pauseRemainingSimSec = 0
  }

  /**
   * Prepares routes for a list of orders.
   * Each order contains waypoints: [{ x, z, isPick?: boolean, slotId?: number }]
   */
  loadOrders(orders) {
    this.reset()
    this.orders = orders
    if (orders && orders.length > 0) {
      this.currentOrderIndex = 0
      this._setupOrderSegments(0)
      this.mesh.visible = true
      if (this.segments.length > 0) {
        const start = this.segments[0].start
        this.mesh.position.set(start.x, 0, start.z)
      }
    }
  }

  _setupOrderSegments(orderIndex) {
    if (orderIndex >= this.orders.length) {
      this.segments = []
      return
    }

    const waypoints = this.orders[orderIndex] || []
    this.segments = []
    this.currentSegmentIndex = 0
    this.segmentProgress = 0

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i]
      const p2 = waypoints[i + 1]
      const len = dist2D(p1, p2)
      this.segments.push({
        start: { x: p1.x, z: p1.z },
        end: { x: p2.x, z: p2.z },
        dist: len,
        isPickStop: Boolean(p2.isPick),
        slotId: p2.slotId ?? null
      })
    }
  }

  /**
   * Advances simulation by real deltaTime seconds.
   * @param {number} deltaSec - Real wall clock seconds passed
   * @param {number} speedMultiplier - 1x, 5x, 20x
   * @returns {boolean} True if all orders completed
   */
  update(deltaSec, speedMultiplier = 1) {
    if (!this.mesh.visible || this.currentOrderIndex >= this.orders.length) {
      return true
    }

    const simDelta = deltaSec * speedMultiplier
    this.elapsedSimSec += simDelta

    // Handle 12-second simulated pick pause
    if (this.pauseRemainingSimSec > 0) {
      this.pauseRemainingSimSec -= simDelta
      if (this.pauseRemainingSimSec <= 0) {
        this.pauseRemainingSimSec = 0
        if (this.onPickEnd) {
          this.onPickEnd(this.currentPauseSlotId, this.isGhost)
        }
      }
      return false
    }

    if (this.currentSegmentIndex >= this.segments.length) {
      // Advance to next order
      this.currentOrderIndex++
      if (this.currentOrderIndex >= this.orders.length) {
        return true
      }
      this._setupOrderSegments(this.currentOrderIndex)
      if (this.segments.length === 0) return true
    }

    const seg = this.segments[this.currentSegmentIndex]
    const walkSpeed = 1.2 // m/s walking speed as defined in contract
    const distanceToMove = walkSpeed * simDelta

    if (seg.dist <= 0.0001) {
      this._advanceSegment()
      return false
    }

    const stepFraction = distanceToMove / seg.dist
    this.segmentProgress += stepFraction

    if (this.segmentProgress >= 1) {
      // Completed current segment
      this.metersWalked += seg.dist * (1 - (this.segmentProgress - stepFraction))
      this.mesh.position.set(seg.end.x, 0, seg.end.z)

      if (seg.isPickStop) {
        this.pauseRemainingSimSec = 12 // 12 seconds pick time per item (contract fixed rule)
        this.currentPauseSlotId = seg.slotId
        if (this.onPickStart) {
          this.onPickStart(seg.slotId, this.isGhost)
        }
      }

      this._advanceSegment()
    } else {
      // Moving along segment
      this.metersWalked += distanceToMove
      const currX = THREE.MathUtils.lerp(seg.start.x, seg.end.x, this.segmentProgress)
      const currZ = THREE.MathUtils.lerp(seg.start.z, seg.end.z, this.segmentProgress)
      this.mesh.position.set(currX, 0, currZ)

      // Rotate towards heading
      const dx = seg.end.x - seg.start.x
      const dz = seg.end.z - seg.start.z
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        const targetAngle = Math.atan2(dx, dz)
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, targetAngle, 0.25)
      }
    }

    return false
  }

  _advanceSegment() {
    this.currentSegmentIndex++
    this.segmentProgress = 0
  }

  dispose() {
    this.reset()
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
    }
  }
}
