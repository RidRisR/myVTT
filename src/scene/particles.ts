// src/scene/particles.ts
// Lightweight canvas-based particle engine with configurable presets.

export interface ParticlePresetConfig {
  count: number
  colors: string[]
  sizeRange: [number, number]
  speedRange: [number, number]
  direction: { x: [number, number]; y: [number, number] }
  opacityRange: [number, number]
  glow?: boolean
  shape?: 'circle' | 'streak'
}

export const PRESETS: Record<string, ParticlePresetConfig> = {
  embers: {
    count: 80,
    colors: ['#ff6600', '#ff4400', '#ff8800', '#ffaa00', '#cc3300'],
    sizeRange: [1.5, 4],
    speedRange: [0.3, 1.2],
    direction: { x: [-0.3, 0.3], y: [-1, -0.2] },
    opacityRange: [0.3, 0.9],
    glow: true,
    shape: 'circle',
  },
  snow: {
    count: 120,
    colors: ['#ffffff', '#e8f0ff', '#d0e4ff', '#c8deff'],
    sizeRange: [1.5, 4],
    speedRange: [0.5, 1.5],
    direction: { x: [-0.4, 0.4], y: [0.3, 1] },
    opacityRange: [0.4, 0.9],
    glow: false,
    shape: 'circle',
  },
  dust: {
    count: 90,
    colors: ['#b0a890', '#c8b898', '#a09880', '#d0c8b0', '#908878'],
    sizeRange: [1.2, 3.5],
    speedRange: [0.1, 0.4],
    direction: { x: [-0.5, 0.5], y: [-0.3, 0.3] },
    opacityRange: [0.25, 0.65],
    glow: true,
    shape: 'circle',
  },
  rain: {
    count: 200,
    colors: ['#8899bb', '#99aaccdd', '#7788aacc', '#6677aa'],
    sizeRange: [1, 2],
    speedRange: [4, 8],
    direction: { x: [0.1, 0.3], y: [0.8, 1] },
    opacityRange: [0.2, 0.5],
    glow: false,
    shape: 'streak',
  },
  fireflies: {
    count: 50,
    colors: ['#ccff44', '#aaee22', '#ddff66', '#88dd00', '#eeff88'],
    sizeRange: [2, 4],
    speedRange: [0.2, 0.6],
    direction: { x: [-0.5, 0.5], y: [-0.5, 0.5] },
    opacityRange: [0.1, 0.8],
    glow: true,
    shape: 'circle',
  },
}

// ── Internal types ──

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  opacity: number
  baseOpacity: number
  // For fireflies pulsing
  pulsePhase: number
  pulseSpeed: number
  // For wandering (fireflies)
  wanderAngle: number
  wanderSpeed: number
}

// ── Helpers ──

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function createParticle(config: ParticlePresetConfig, w: number, h: number): Particle {
  const speed = rand(config.speedRange[0], config.speedRange[1])
  const dx = rand(config.direction.x[0], config.direction.x[1])
  const dy = rand(config.direction.y[0], config.direction.y[1])
  const mag = Math.sqrt(dx * dx + dy * dy) || 1
  const baseOpacity = rand(config.opacityRange[0], config.opacityRange[1])

  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (dx / mag) * speed,
    vy: (dy / mag) * speed,
    size: rand(config.sizeRange[0], config.sizeRange[1]),
    color: pick(config.colors),
    opacity: baseOpacity,
    baseOpacity,
    pulsePhase: Math.random() * Math.PI * 2,
    pulseSpeed: rand(0.02, 0.06),
    wanderAngle: Math.random() * Math.PI * 2,
    wanderSpeed: rand(0.01, 0.04),
  }
}

function respawnParticle(p: Particle, config: ParticlePresetConfig, w: number, h: number): void {
  const speed = rand(config.speedRange[0], config.speedRange[1])
  const dx = rand(config.direction.x[0], config.direction.x[1])
  const dy = rand(config.direction.y[0], config.direction.y[1])
  const mag = Math.sqrt(dx * dx + dy * dy) || 1

  p.vx = (dx / mag) * speed
  p.vy = (dy / mag) * speed
  p.size = rand(config.sizeRange[0], config.sizeRange[1])
  p.color = pick(config.colors)
  p.baseOpacity = rand(config.opacityRange[0], config.opacityRange[1])
  p.opacity = p.baseOpacity
  p.pulsePhase = Math.random() * Math.PI * 2

  // Respawn at edges based on direction
  const netDy = config.direction.y[0] + config.direction.y[1]
  if (netDy < -0.2) {
    // Particles move upward -> respawn at bottom
    p.x = Math.random() * w
    p.y = h + rand(10, 40)
  } else if (netDy > 0.2) {
    // Particles move downward -> respawn at top
    p.x = Math.random() * w
    p.y = -rand(10, 40)
  } else {
    // Random drift -> respawn at random edge
    const edge = Math.floor(Math.random() * 4)
    if (edge === 0) {
      p.x = -rand(5, 20)
      p.y = Math.random() * h
    } else if (edge === 1) {
      p.x = w + rand(5, 20)
      p.y = Math.random() * h
    } else if (edge === 2) {
      p.x = Math.random() * w
      p.y = -rand(5, 20)
    } else {
      p.x = Math.random() * w
      p.y = h + rand(5, 20)
    }
  }
}

// ── Engine ──

export interface ParticleEngine {
  start: () => void
  stop: () => void
  setPreset: (presetName: string) => void
  resize: (w: number, h: number) => void
}

export function createParticleEngine(
  canvas: HTMLCanvasElement,
  presetName: string,
): ParticleEngine {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) throw new Error('Cannot get 2d context')
  const ctx: CanvasRenderingContext2D = maybeCtx
  let particles: Particle[] = []
  let currentConfig: ParticlePresetConfig | null = null
  let animId = 0
  let running = false
  let w = canvas.width
  let h = canvas.height

  // Respect prefers-reduced-motion
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function initParticles(config: ParticlePresetConfig) {
    const count = reducedMotion ? Math.max(10, Math.floor(config.count * 0.3)) : config.count
    particles = []
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(config, w, h))
    }
  }

  function update() {
    if (!currentConfig) return
    const speedMul = reducedMotion ? 0.3 : 1
    const isFireflies = currentConfig.glow && currentConfig.shape === 'circle'

    for (const p of particles) {
      if (isFireflies) {
        // Fireflies wander randomly
        p.wanderAngle += (Math.random() - 0.5) * p.wanderSpeed * 2
        p.vx += Math.cos(p.wanderAngle) * p.wanderSpeed
        p.vy += Math.sin(p.wanderAngle) * p.wanderSpeed
        // Dampen velocity for smooth wandering
        p.vx *= 0.98
        p.vy *= 0.98
        // Pulse opacity
        p.pulsePhase += p.pulseSpeed
        p.opacity = p.baseOpacity * (0.3 + 0.7 * ((Math.sin(p.pulsePhase) + 1) / 2))
      }

      p.x += p.vx * speedMul
      p.y += p.vy * speedMul

      // Check if out of bounds with margin
      const margin = 50
      if (p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin) {
        respawnParticle(p, currentConfig, w, h)
      }
    }
  }

  function draw() {
    if (!currentConfig) return
    ctx.clearRect(0, 0, w, h)

    const isStreak = currentConfig.shape === 'streak'
    const hasGlow = currentConfig.glow

    for (const p of particles) {
      ctx.globalAlpha = p.opacity

      if (hasGlow) {
        ctx.shadowColor = p.color
        ctx.shadowBlur = p.size * 3
      } else {
        ctx.shadowBlur = 0
      }

      if (isStreak) {
        // Draw as a short line (rain streaks)
        const len = p.size * 8
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size * 0.5
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len)
        ctx.stroke()
      } else {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Reset
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  function loop() {
    if (!running) return
    update()
    draw()
    animId = requestAnimationFrame(loop)
  }

  function start() {
    if (running) return
    running = true
    const config = PRESETS[presetName]
    if (!config) return
    currentConfig = config
    initParticles(config)
    loop()
  }

  function stop() {
    running = false
    if (animId) {
      cancelAnimationFrame(animId)
      animId = 0
    }
    ctx.clearRect(0, 0, w, h)
    particles = []
  }

  function setPreset(newPreset: string) {
    presetName = newPreset
    const config = PRESETS[newPreset]
    if (!config) {
      stop()
      return
    }
    currentConfig = config
    initParticles(config)
    if (!running) {
      running = true
      loop()
    }
  }

  function resize(newW: number, newH: number) {
    w = newW
    h = newH
    canvas.width = newW
    canvas.height = newH
    // Re-scatter existing particles within new bounds
    for (const p of particles) {
      if (p.x > w) p.x = Math.random() * w
      if (p.y > h) p.y = Math.random() * h
    }
  }

  return { start, stop, setPreset, resize }
}
