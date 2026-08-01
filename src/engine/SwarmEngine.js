import { FORMATIONS, FORMATION_ORDER, setWordmarkText } from './shapes.js'

// ---------------------------------------------------------------------------
// SwarmEngine — a fleet of individual agents. Each drone is a damped spring
// chasing its (slowly rotating, gently breathing) formation slot. Formation
// changes sweep a "dissolve wave" across the fleet: as the wave reaches each
// drone it gets a small scatter kick, then flows toward its new slot.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

export const PALETTES = {
  Moonlight: [
    { c: '#eaf4ff', w: 0.55 },
    { c: '#8fd8ff', w: 0.28 },
    { c: '#ffc27a', w: 0.17 },
  ],
  Ember: [
    { c: '#ffd9a0', w: 0.46 },
    { c: '#ff9d4d', w: 0.3 },
    { c: '#fff3e0', w: 0.24 },
  ],
  Aurora: [
    { c: '#a5ffe0', w: 0.34 },
    { c: '#6fe3ff', w: 0.36 },
    { c: '#eaf6ff', w: 0.3 },
  ],
  Ultraviolet: [
    { c: '#cfc4ff', w: 0.4 },
    { c: '#8fa8ff', w: 0.3 },
    { c: '#f0ecff', w: 0.3 },
  ],
}

function pickColor(palette) {
  let r = Math.random()
  for (const { c, w } of palette) {
    if ((r -= w) <= 0) return c
  }
  return palette[0].c
}

function rand(a, b) {
  return a + Math.random() * (b - a)
}

export class SwarmEngine {
  constructor(canvas, { onFormation } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onFormation = onFormation || (() => {})

    // tunables (driven by the DialKit panel)
    this.speed = 1
    this.glow = 1
    this.autoCycle = true
    this.paletteName = 'Moonlight'
    this.scene = 'Treeline'
    this.customImage = null

    this.particles = []
    this.formation = null
    this.formationSetAt = 0
    this.holdBase = 7.0 // seconds a formation is held before auto-advance
    this.waveSpanBase = 1.7

    this.yaw = 0
    this.time = 0
    this.started = false // liftoff happened
    this.introAt = null

    this.spriteCache = new Map()
    this.pointer = { x: 0, y: 0, active: false }

    this._raf = null
    this._last = null
    this._destroyed = false

    this._resize = this._resize.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerLeave = this._onPointerLeave.bind(this)
    this._onPointerDown = this._onPointerDown.bind(this)

    window.addEventListener('resize', this._resize)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerleave', this._onPointerLeave)
    canvas.addEventListener('pointerdown', this._onPointerDown)

    // warm the wordmark font so the formation samples the real glyphs
    if (document.fonts && document.fonts.load) {
      document.fonts.load('500 218px Inter').catch(() => {})
    }

    this._resize()
  }

  // -- lifecycle -------------------------------------------------------------

  start(count) {
    this._spawn(count)
    this.introAt = null // set on first frame
    this._last = null
    const loop = (ts) => {
      if (this._destroyed) return
      this._frame(ts / 1000)
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  destroy() {
    this._destroyed = true
    if (this._raf) cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._resize)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave)
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
  }

  // -- public controls ---------------------------------------------------------

  setSpeed(v) { this.speed = v }
  setGlow(v) { this.glow = v }
  setAutoCycle(v) { this.autoCycle = v }

  setScene(name) {
    if (name === this.scene) return
    this.scene = name
    this._buildBackground()
  }

  setCustomImage(img) {
    this.customImage = img
    this.scene = 'Custom'
    this._buildBackground()
  }

  // Grab the live composite (sky + drone formation) as a PNG data URL.
  // The visible canvas already holds both layers, so this captures exactly
  // what's on screen at the moment of the call.
  capture() {
    try {
      return this.canvas.toDataURL('image/png')
    } catch (_) {
      return null // tainted canvas (cross-origin image) — cannot export
    }
  }

  setWordmarkText(text) {
    setWordmarkText(text)
    // if the fleet is currently spelling the wordmark, re-fly into the new text
    if (this.formation === 'Wordmark' && this.started) {
      this.setFormation('Wordmark', { quick: true, announce: false })
    }
  }

  setPalette(name) {
    if (!PALETTES[name] || name === this.paletteName) return
    this.paletteName = name
    const palette = PALETTES[name]
    for (const p of this.particles) p.color = pickColor(palette)
  }

  setFormation(name, { wave = null, quick = false, announce = true } = {}) {
    if (!FORMATIONS[name]) return
    this.formation = name
    this.formationSetAt = this.time
    const def = FORMATIONS[name]
    const targets = def.gen(this.particles.length)

    // Coherent matching: sort slots and drones along the same axis so the
    // fleet flows rather than criss-crosses. A pinch of shuffle keeps it organic.
    const key = (p) => p.x + p.y * 0.35
    targets.sort((a, b) => key(a) - key(b))
    const order = this.particles
      .map((p, i) => ({ i, k: key(p.pos) }))
      .sort((a, b) => a.k - b.k)
    for (let i = 0; i < order.length; i++) {
      const j = Math.min(
        targets.length - 1,
        Math.max(0, i + (Math.random() < 0.12 ? Math.floor(rand(-6, 7)) : 0))
      )
      order[i].t = targets[j]
    }

    const dir = wave || ['lr', 'rl', 'up', 'radial'][Math.floor(Math.random() * 4)]
    const span = (quick ? 0.55 : this.waveSpanBase) / this.speed

    for (const { i, t } of order) {
      const p = this.particles[i]
      let w
      const c = p.pos
      if (dir === 'lr') w = (c.x + 1.4) / 2.8
      else if (dir === 'rl') w = 1 - (c.x + 1.4) / 2.8
      else if (dir === 'up') w = (c.y + 1.5) / 3.0
      else w = Math.min(1, Math.hypot(c.x, c.y, c.z) / 1.4)
      w = Math.min(1, Math.max(0, w))
      p.nextBase = t
      p.waveAt = this.time + w * span + Math.random() * 0.12
      p.pending = true
    }

    if (announce) this.onFormation(name, def.caption)
  }

  next() {
    const idx = FORMATION_ORDER.indexOf(this.formation)
    const name = FORMATION_ORDER[(idx + 1) % FORMATION_ORDER.length]
    this.setFormation(name)
  }

  scatter() {
    for (const p of this.particles) {
      const a = Math.random() * TAU
      const b = Math.random() * TAU
      const s = rand(0.7, 1.6)
      p.vel.x += Math.cos(a) * Math.cos(b) * s
      p.vel.y += Math.abs(Math.sin(b)) * s * 0.8 + 0.2
      p.vel.z += Math.sin(a) * Math.cos(b) * s
    }
  }

  setCount(n) {
    n = Math.round(n)
    const cur = this.particles.length
    if (n === cur) return
    if (n < cur) {
      this.particles.length = n
    } else {
      for (let i = cur; i < n; i++) this.particles.push(this._makeParticle(true))
    }
    if (this.formation) {
      this.setFormation(this.formation, { quick: true, announce: false })
    }
  }

  // -- internals ---------------------------------------------------------------

  _makeParticle(lateJoin = false) {
    const palette = PALETTES[this.paletteName]
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.82
    const pos = {
      x: g() * 0.55,
      y: -1.18 + g() * 0.07,
      z: g() * 0.12,
    }
    return {
      pos,
      vel: { x: 0, y: 0, z: 0 },
      base: { ...pos }, // formation slot (pre-rotation)
      nextBase: null,
      pending: false,
      waveAt: 0,
      grounded: !this.started || lateJoin,
      wake: lateJoin ? 0 : rand(0, 1.9),
      color: pickColor(palette),
      size: rand(2.4, 3.0), // real fleets are uniform hardware

      fFreq: rand(1.4, 3.4),
      fPh: rand(0, TAU),
      b1: rand(0, TAU),
      b2: rand(0, TAU),
      b3: rand(0, TAU),
      bf: rand(0.4, 0.9),
      sparkle: 0,
    }
  }

  _spawn(count) {
    this.particles = []
    for (let i = 0; i < count; i++) this.particles.push(this._makeParticle(false))
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.dpr = dpr
    this.w = w
    this.h = h
    this.cx = w / 2
    this.cy = h * 0.46
    this.scale = Math.min(w, h) * 0.36
    this._buildBackground()
  }

  _buildBackground() {
    const cv = document.createElement('canvas')
    cv.width = this.canvas.width
    cv.height = this.canvas.height
    const c = cv.getContext('2d')
    const dpr = this.dpr
    c.scale(dpr, dpr)
    const w = this.w
    const h = this.h

    if (this.scene === 'Custom' && this.customImage) {
      this._drawCustomScene(c, w, h)
    } else {
      this._drawSky(c, w, h)
      if (this.scene === 'Treeline') this._drawTreeline(c, w, h)
      else if (this.scene === 'Lakeside') this._drawLakeside(c, w, h)
      else if (this.scene === 'Skyline') this._drawSkyline(c, w, h)
    }

    // vignette
    const vig = c.createRadialGradient(
      this.cx, h * 0.45, Math.min(w, h) * 0.35,
      this.cx, h * 0.45, Math.max(w, h) * 0.75
    )
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.42)')
    c.fillStyle = vig
    c.fillRect(0, 0, w, h)

    this.bgLayer = cv
  }

  _drawSky(c, w, h) {
    const grad = c.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#03040a')
    grad.addColorStop(0.55, '#05070f')
    grad.addColorStop(1, '#0a0e18')
    c.fillStyle = grad
    c.fillRect(0, 0, w, h)

    for (let i = 0; i < 170; i++) {
      const x = Math.random() * w
      const y = Math.random() * h * 0.8
      c.globalAlpha = rand(0.04, 0.22)
      c.fillStyle = Math.random() < 0.85 ? '#cfe4ff' : '#ffe0b8'
      c.beginPath()
      c.arc(x, y, rand(0.4, 1.1), 0, TAU)
      c.fill()
    }
    c.globalAlpha = 1
  }

  _horizonGlow(c, w, h, y, color, height, alpha) {
    const g = c.createLinearGradient(0, y - height, 0, y)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, color.replace('A)', alpha + ')'))
    c.fillStyle = g
    c.fillRect(0, y - height, w, height)
  }

  _warmLight(c, x, y, r, color = '255,190,120', a = 0.5) {
    const g = c.createRadialGradient(x, y, 0, x, y, r * 6)
    g.addColorStop(0, `rgba(${color},${a})`)
    g.addColorStop(0.25, `rgba(${color},${a * 0.25})`)
    g.addColorStop(1, `rgba(${color},0)`)
    c.fillStyle = g
    c.beginPath()
    c.arc(x, y, r * 6, 0, TAU)
    c.fill()
  }

  _drawTreeline(c, w, h) {
    const horizon = h * 0.87
    this._horizonGlow(c, w, h, horizon, 'rgba(140,100,60,A)', h * 0.12, 0.09)

    // canopy silhouette: overlapping dark blobs on a random-walk ridge
    c.fillStyle = '#04060a'
    c.beginPath()
    c.moveTo(0, h)
    let y = horizon - rand(0, h * 0.03)
    for (let x = 0; x <= w; x += 14) {
      y += rand(-1, 1) * h * 0.012
      const min = horizon - h * 0.075
      if (y < min) y = min
      if (y > horizon) y = horizon
      c.lineTo(x, y)
    }
    c.lineTo(w, h)
    c.closePath()
    c.fill()
    // a few taller trees
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * w
      const r = rand(h * 0.02, h * 0.05)
      c.beginPath()
      c.arc(x, horizon - r * rand(0.9, 1.6), r, 0, TAU)
      c.fill()
    }
    // ground band
    c.fillStyle = '#030408'
    c.fillRect(0, horizon, w, h - horizon)
    // scattered warm event lights at the treeline base
    for (let i = 0; i < 6; i++) {
      this._warmLight(c, rand(w * 0.1, w * 0.9), horizon + rand(2, 8), rand(0.8, 1.6), '255,185,110', rand(0.25, 0.5))
    }
  }

  _drawLakeside(c, w, h) {
    const shore = h * 0.84
    // soft moon
    this._warmLight(c, w * 0.82, h * 0.14, 5, '210,225,250', 0.5)
    c.fillStyle = 'rgba(225,235,252,0.85)'
    c.beginPath()
    c.arc(w * 0.82, h * 0.14, 9, 0, TAU)
    c.fill()

    // far and near mountain ranges
    const ranges = [
      { base: h * 0.7, amp: h * 0.09, col: '#05070d', seed: 1.7 },
      { base: h * 0.78, amp: h * 0.11, col: '#03050a', seed: 4.2 },
    ]
    for (const r of ranges) {
      c.fillStyle = r.col
      c.beginPath()
      c.moveTo(0, shore)
      for (let x = 0; x <= w; x += 8) {
        const t = (x / w) * 6 + r.seed
        const yy = r.base - (Math.sin(t) * 0.5 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 5.3) * 0.2) * r.amp
        c.lineTo(x, yy)
      }
      c.lineTo(w, shore)
      c.closePath()
      c.fill()
    }

    // water
    const water = c.createLinearGradient(0, shore, 0, h)
    water.addColorStop(0, '#060910')
    water.addColorStop(1, '#04060c')
    c.fillStyle = water
    c.fillRect(0, shore, w, h - shore)

    // shoreline town lights + streak reflections
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w
      const warm = Math.random() < 0.75
      const col = warm ? '255,190,110' : '170,210,255'
      const a = rand(0.25, 0.7)
      c.fillStyle = `rgba(${col},${a})`
      c.fillRect(x, shore - rand(1, 4), rand(1, 2), rand(1, 2))
      const g = c.createLinearGradient(0, shore, 0, shore + rand(14, 40))
      g.addColorStop(0, `rgba(${col},${a * 0.22})`)
      g.addColorStop(1, `rgba(${col},0)`)
      c.fillStyle = g
      c.fillRect(x - 0.5, shore, 1.6, 44)
    }
  }

  _drawSkyline(c, w, h) {
    const ground = h * 0.88
    this._horizonGlow(c, w, h, ground, 'rgba(255,150,80,A)', h * 0.18, 0.1)

    let x = -10
    while (x < w) {
      const bw = rand(24, 72)
      const bh = rand(h * 0.05, h * 0.16)
      const top = ground - bh
      c.fillStyle = '#04060b'
      c.fillRect(x, top, bw, bh)
      // sparse lit windows
      const cols = Math.floor(bw / 9)
      const rows = Math.floor(bh / 11)
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (Math.random() < 0.16) {
            c.fillStyle = `rgba(255,195,130,${rand(0.15, 0.6)})`
            c.fillRect(x + 4 + i * 9, top + 5 + j * 11, 2.2, 3)
          }
        }
      }
      // antenna beacon on the tallest towers
      if (bh > h * 0.13 && Math.random() < 0.5) {
        c.fillStyle = 'rgba(255,70,70,0.8)'
        c.fillRect(x + bw / 2, top - 7, 1.6, 1.6)
        c.fillStyle = 'rgba(120,130,150,0.5)'
        c.fillRect(x + bw / 2 + 0.2, top - 6, 0.8, 6)
      }
      x += bw + rand(2, 14)
    }
    c.fillStyle = '#030409'
    c.fillRect(0, ground, w, h - ground)
  }

  _drawCustomScene(c, w, h) {
    const img = this.customImage
    const s = Math.max(w / img.width, h / img.height)
    const dw = img.width * s
    const dh = img.height * s
    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    // darken so the fleet still owns the sky
    c.fillStyle = 'rgba(2,3,8,0.45)'
    c.fillRect(0, 0, w, h)
    const g = c.createLinearGradient(0, 0, 0, h * 0.7)
    g.addColorStop(0, 'rgba(2,3,8,0.35)')
    g.addColorStop(1, 'rgba(2,3,8,0)')
    c.fillStyle = g
    c.fillRect(0, 0, w, h * 0.7)
  }

  _sprite(color) {
    let s = this.spriteCache.get(color)
    if (s) return s
    const size = 64
    const cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    const c = cv.getContext('2d')
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.1, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.22, this._rgba(color, 0.5))
    g.addColorStop(0.5, this._rgba(color, 0.1))
    g.addColorStop(1, this._rgba(color, 0))
    c.fillStyle = g
    c.fillRect(0, 0, size, size)
    this.spriteCache.set(color, cv)
    return cv
  }

  _rgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = (e.clientX - rect.left - this.cx) / this.scale
    this.pointer.y = (this.cy - (e.clientY - rect.top)) / this.scale
    this.pointer.active = true
  }

  _onPointerLeave() {
    this.pointer.active = false
  }

  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect()
    const wx = (e.clientX - rect.left - this.cx) / this.scale
    const wy = (this.cy - (e.clientY - rect.top)) / this.scale
    for (const p of this.particles) {
      const dx = p.pos.x - wx
      const dy = p.pos.y - wy
      const d = Math.hypot(dx, dy, p.pos.z * 0.5) + 1e-4
      const s = 1.15 * Math.exp(-d * 1.9)
      if (s > 0.01) {
        p.vel.x += (dx / d) * s
        p.vel.y += (dy / d) * s
        p.vel.z += (p.pos.z / d) * s * 0.6
        p.sparkle = Math.min(1, p.sparkle + s * 0.8)
      }
    }
  }

  // -- the frame ----------------------------------------------------------------

  _frame(now) {
    if (this.introAt === null) {
      this.introAt = now
      this._last = now
    }
    let dt = Math.min(0.033, now - this._last)
    this._last = now
    const t = now - this.introAt
    this.time = t

    const speed = this.speed

    // liftoff: after the fleet has flickered awake on the ground
    if (!this.started && t > 2.3) {
      this.started = true
      this.setFormation('Globe', { wave: 'up' })
    }

    // auto-advance the show
    if (this.started && this.autoCycle) {
      const elapsed = t - this.formationSetAt
      if (elapsed > (this.holdBase + this.waveSpanBase) / speed) this.next()
    }

    // formation rotation — targets rotate, drones chase: that lag is the life
    const def = this.formation ? FORMATIONS[this.formation] : null
    if (def && def.rotate) this.yaw += def.rotate * speed * dt
    const effYaw = def
      ? (def.rotate ? this.yaw : Math.sin(t * 0.24) * 0.09)
      : 0
    const cosY = Math.cos(effYaw)
    const sinY = Math.sin(effYaw)

    const k = 5.4 * speed
    const damp = 2 * Math.sqrt(k) * 0.86

    const ptr = this.pointer

    for (const p of this.particles) {
      // dissolve wave arrival: kick, then flow to the new slot
      if (p.pending && t >= p.waveAt) {
        p.pending = false
        p.grounded = false
        p.base = p.nextBase
        const a = Math.random() * TAU
        const kick = rand(0.25, 0.7)
        p.vel.x += Math.cos(a) * kick
        p.vel.y += rand(0.1, 0.5)
        p.vel.z += Math.sin(a) * kick
      }

      // desired position: rotated slot + breathing drift
      let tx, ty, tz
      if (p.grounded) {
        tx = p.base.x
        ty = p.base.y
        tz = p.base.z
      } else {
        const b = p.base
        tx = b.x * cosY + b.z * sinY
        ty = b.y
        tz = -b.x * sinY + b.z * cosY
      }
      const bt = t * p.bf
      tx += Math.sin(bt * 1.3 + p.b1) * 0.018 + Math.sin(bt * 0.31 + p.b3) * 0.012
      ty += Math.sin(bt * 1.7 + p.b2) * 0.018 + Math.cos(bt * 0.27 + p.b1) * 0.012
      tz += Math.sin(bt * 1.1 + p.b3) * 0.015

      let ax = (tx - p.pos.x) * k - p.vel.x * damp
      let ay = (ty - p.pos.y) * k - p.vel.y * damp
      let az = (tz - p.pos.z) * k - p.vel.z * damp

      // the cursor is a soft wind
      if (ptr.active) {
        const dx = p.pos.x - ptr.x
        const dy = p.pos.y - ptr.y
        const d2 = dx * dx + dy * dy
        if (d2 < 0.16) {
          const d = Math.sqrt(d2) + 1e-4
          const f = (1 - d / 0.4) * 2.6
          ax += (dx / d) * f
          ay += (dy / d) * f
        }
      }

      p.vel.x += ax * dt
      p.vel.y += ay * dt
      p.vel.z += az * dt
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
      p.pos.z += p.vel.z * dt

      // twinkle bookkeeping
      if (Math.random() < 0.0007) p.sparkle = 1
      if (p.sparkle > 0) p.sparkle *= Math.pow(0.14, dt)
    }

    this._render(t)
  }

  _render(t) {
    const ctx = this.ctx
    const { dpr } = this

    // fade toward the sky — leaves short luminous trails
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.72
    ctx.drawImage(this.bgLayer, 0, 0)
    ctx.globalAlpha = 1

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'

    const { cx, cy, scale } = this
    const glow = this.glow

    for (const p of this.particles) {
      // wake-up ramp (the fleet flickers on, one by one)
      let ramp = 1
      if (t < p.wake + 1.4) {
        ramp = Math.max(0, (t - p.wake) / 1.4)
        ramp *= ramp
        // nervous flicker while waking
        if (ramp < 1) ramp *= 0.6 + 0.4 * Math.sin(t * 23 + p.fPh) * Math.sin(t * 7.7 + p.b1)
        if (ramp <= 0.003) continue
      }

      const persp = 3.2 / (3.2 - p.pos.z)
      const sx = cx + p.pos.x * scale * persp
      const sy = cy - p.pos.y * scale * persp
      if (sx < -40 || sx > this.w + 40 || sy < -40 || sy > this.h + 40) continue

      const depth = Math.min(1, Math.max(0, (p.pos.z + 1.1) / 2.2))
      const breathe = 0.88 + 0.12 * Math.sin(t * p.fFreq + p.fPh)
      const alpha = Math.min(1, ramp * breathe * (0.55 + 0.45 * depth) * (0.85 + p.sparkle * 0.6))
      const sprite = this._sprite(p.color)

      // a drone is a hard point of light with a tight bloom — not a bokeh blob
      const core = p.size * persp * (1 + p.sparkle * 0.4)
      const coreW = core * 2.6
      const haloW = core * (3.2 + 3.6 * glow)

      ctx.globalAlpha = alpha * 0.34 * Math.min(1.4, glow)
      ctx.drawImage(sprite, sx - haloW / 2, sy - haloW / 2, haloW, haloW)
      ctx.globalAlpha = alpha
      ctx.drawImage(sprite, sx - coreW / 2, sy - coreW / 2, coreW, coreW)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}
