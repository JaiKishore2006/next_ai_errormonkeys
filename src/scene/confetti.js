/**
 * Lightweight Canvas Confetti generator (Zero dependencies)
 * Emits vibrant celebratory confetti across the viewport.
 */

let confettiCanvas = null
let confettiCtx = null
let particles = []
let animId = null

function initConfettiCanvas() {
  if (confettiCanvas) return
  confettiCanvas = document.createElement('canvas')
  confettiCanvas.style.position = 'fixed'
  confettiCanvas.style.top = '0'
  confettiCanvas.style.left = '0'
  confettiCanvas.style.width = '100vw'
  confettiCanvas.style.height = '100vh'
  confettiCanvas.style.pointerEvents = 'none'
  confettiCanvas.style.zIndex = '9999'
  document.body.appendChild(confettiCanvas)
  confettiCtx = confettiCanvas.getContext('2d')

  function resize() {
    if (!confettiCanvas) return
    confettiCanvas.width = window.innerWidth * window.devicePixelRatio
    confettiCanvas.height = window.innerHeight * window.devicePixelRatio
    confettiCtx.scale(window.devicePixelRatio, window.devicePixelRatio)
  }

  window.addEventListener('resize', resize)
  resize()
}

const COLORS = ['#f59e0b', '#10b981', '#38bdf8', '#a855f7', '#ec4899', '#ef4444', '#fbbf24']

export function fireConfetti(particleCount = 100) {
  initConfettiCanvas()

  const w = window.innerWidth
  const h = window.innerHeight

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: w * (0.3 + Math.random() * 0.4),
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 16,
      vy: -(Math.random() * 12 + 6),
      size: Math.random() * 8 + 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tilt: Math.random() * 10,
      tiltAngle: Math.random() * Math.PI * 2,
      tiltSpeed: Math.random() * 0.1 + 0.05,
      opacity: 1
    })
  }

  if (!animId) {
    animateConfetti()
  }
}

function animateConfetti() {
  if (particles.length === 0) {
    if (confettiCtx && confettiCanvas) {
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
    animId = null
    return
  }

  confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight)

  const gravity = 0.35
  const drag = 0.98

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vx *= drag
    p.vy = p.vy * drag + gravity
    p.tiltAngle += p.tiltSpeed
    p.tilt = Math.sin(p.tiltAngle) * 12

    if (p.y > window.innerHeight * 0.7) {
      p.opacity -= 0.02
    }

    if (p.opacity <= 0 || p.y > window.innerHeight + 20) {
      particles.splice(i, 1)
      continue
    }

    confettiCtx.save()
    confettiCtx.fillStyle = p.color
    confettiCtx.globalAlpha = Math.max(0, p.opacity)
    confettiCtx.beginPath()
    confettiCtx.rect(p.x, p.y, p.size, p.size * 0.6)
    confettiCtx.fill()
    confettiCtx.restore()
  }

  animId = requestAnimationFrame(animateConfetti)
}
