// ---------------------------------------------------------------------------
// Formation generators. Every function returns `n` points in world space:
// roughly a unit-ish cube centered on the origin, y pointing up.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

function gauss() {
  // Box–Muller, cheap approximation is fine for jitter
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v)
}

function rotX(p, a) {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}
function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
}

// --- Globe: latitude rings, the classic drone-show earth -------------------
export function globe(n) {
  const pts = []
  const rings = 16
  const R = 0.92
  // weight ring populations by circumference
  const lats = []
  let totalW = 0
  for (let i = 0; i < rings; i++) {
    const lat = (-80 + (160 * i) / (rings - 1)) * (Math.PI / 180)
    const w = Math.cos(lat)
    lats.push({ lat, w })
    totalW += w
  }
  for (const { lat, w } of lats) {
    const count = Math.max(3, Math.round((n * w) / totalW))
    const r = Math.cos(lat) * R
    const y = Math.sin(lat) * R
    const phase = Math.random() * TAU
    for (let j = 0; j < count && pts.length < n; j++) {
      const a = phase + (TAU * j) / count
      pts.push({
        x: Math.cos(a) * r + gauss() * 0.008,
        y: y + gauss() * 0.008,
        z: Math.sin(a) * r + gauss() * 0.008,
      })
    }
  }
  while (pts.length < n) {
    const a = Math.random() * TAU
    const lat = (Math.random() - 0.5) * Math.PI * 0.9
    pts.push({
      x: Math.cos(a) * Math.cos(lat) * R,
      y: Math.sin(lat) * R,
      z: Math.sin(a) * Math.cos(lat) * R,
    })
  }
  return pts
}

// --- Galaxy: three-armed spiral, tilted toward the viewer ------------------
export function galaxy(n) {
  const pts = []
  const arms = 3
  const bulge = Math.floor(n * 0.16)
  for (let i = 0; i < bulge; i++) {
    const r = Math.abs(gauss()) * 0.13
    const a = Math.random() * TAU
    pts.push(rotX({
      x: Math.cos(a) * r,
      y: gauss() * 0.05,
      z: Math.sin(a) * r,
    }, 1.05))
  }
  for (let i = bulge; i < n; i++) {
    const arm = i % arms
    const t = Math.pow(Math.random(), 0.62)
    const r = 0.14 + 1.0 * t
    const spread = 0.16 * (1 - t * 0.55)
    const theta = (arm * TAU) / arms + t * 3.9 + gauss() * spread
    pts.push(rotX({
      x: Math.cos(theta) * r,
      y: gauss() * 0.045 * (1 - t * 0.6),
      z: Math.sin(theta) * r,
    }, 1.05))
  }
  return pts
}

// --- Halo: nested orbital rings around a small core -------------------------
export function rings(n) {
  const pts = []
  const coreN = Math.floor(n * 0.26)
  for (let i = 0; i < coreN; i++) {
    // small fibonacci-ish sphere core
    const y = 1 - (2 * (i + 0.5)) / coreN
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = i * 2.39996
    pts.push({ x: Math.cos(a) * r * 0.3, y: y * 0.3, z: Math.sin(a) * r * 0.3 })
  }
  const ringDefs = [
    { r: 0.58, tilt: 0.5, yaw: 0.0 },
    { r: 0.8, tilt: -0.38, yaw: 1.1 },
    { r: 1.02, tilt: 0.12, yaw: 2.3 },
  ]
  const rest = n - coreN
  const totalR = ringDefs.reduce((s, d) => s + d.r, 0)
  let placed = 0
  for (let k = 0; k < ringDefs.length; k++) {
    const d = ringDefs[k]
    const count = k === ringDefs.length - 1
      ? rest - placed
      : Math.round((rest * d.r) / totalR)
    for (let j = 0; j < count; j++) {
      const a = (TAU * j) / count + Math.random() * 0.02
      let p = { x: Math.cos(a) * d.r, y: gauss() * 0.008, z: Math.sin(a) * d.r }
      p = rotX(p, d.tilt)
      p = rotY(p, d.yaw)
      pts.push(p)
    }
    placed += count
  }
  return pts.slice(0, n)
}

// --- Star: five-pointed star, two concentric outlines -----------------------
function starOutline(scale) {
  const verts = []
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0 ? 1.0 : 0.42) * scale
    const a = -Math.PI / 2 + (Math.PI * i) / 5
    verts.push({ x: Math.cos(a) * r, y: -Math.sin(a) * r })
  }
  return verts
}

function samplePolyline(verts, count, closed = true) {
  const pts = []
  const m = verts.length
  const segs = []
  let total = 0
  const lim = closed ? m : m - 1
  for (let i = 0; i < lim; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % m]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    segs.push({ a, b, len })
    total += len
  }
  for (let i = 0; i < count; i++) {
    let d = ((i + 0.5) / count) * total
    for (const s of segs) {
      if (d <= s.len) {
        const t = d / s.len
        pts.push({
          x: s.a.x + (s.b.x - s.a.x) * t,
          y: s.a.y + (s.b.y - s.a.y) * t,
          z: 0,
        })
        break
      }
      d -= s.len
    }
  }
  return pts
}

export function star(n) {
  const outer = samplePolyline(starOutline(1.02), Math.floor(n * 0.62))
  const inner = samplePolyline(starOutline(0.58), n - outer.length)
  const pts = outer.concat(inner)
  return pts.map((p) => ({
    x: p.x + gauss() * 0.006,
    y: -p.y + gauss() * 0.006, // flip: canvas-space to world-up
    z: gauss() * 0.05,
  }))
}

// --- Tide: flowing sine ribbons ---------------------------------------------
export function wave(n) {
  const strands = 5
  const pts = []
  for (let i = 0; i < n; i++) {
    const s = i % strands
    const t = Math.floor(i / strands) / Math.max(1, Math.ceil(n / strands) - 1)
    const x = -1.25 + 2.5 * t
    const phase = s * 0.85
    const amp = 0.34 - Math.abs(s - 2) * 0.03
    pts.push({
      x: x + gauss() * 0.006,
      y: amp * Math.sin(x * 2.6 + phase) + (s - 2) * 0.055 + gauss() * 0.006,
      z: (s - 2) * 0.12 + gauss() * 0.02,
    })
  }
  return pts
}

// --- Wordmark: rasterize text and sample lit pixels --------------------------
let wordmarkCache = null
let wordmarkText = 'LUMEN'

export function setWordmarkText(t) {
  const next = String(t || '').toUpperCase().trim() || 'LUMEN'
  if (next === wordmarkText) return
  wordmarkText = next
  wordmarkCache = null // force re-rasterize with the new text
}

function rasterizeWordmark() {
  if (wordmarkCache) return wordmarkCache
  const W = 1400
  const H = 360
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '500 218px Inter, "Helvetica Neue", sans-serif'
  try { ctx.letterSpacing = '26px' } catch (_) { /* older engines */ }
  ctx.fillText(wordmarkText, W / 2, H / 2 + 8)
  const img = ctx.getImageData(0, 0, W, H).data
  const found = []
  const step = 5
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (img[(y * W + x) * 4 + 3] > 120) found.push({ x, y })
    }
  }
  if (found.length === 0) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of found) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const targetW = 2.55
  const scale = targetW / w
  wordmarkCache = found.map((p) => ({
    x: (p.x - minX - w / 2) * scale,
    y: -(p.y - minY - h / 2) * scale,
  }))
  return wordmarkCache
}

export function wordmark(n) {
  const src = rasterizeWordmark()
  if (!src) return star(n) // extremely defensive fallback
  const pts = []
  for (let i = 0; i < n; i++) {
    const p = src[Math.floor(Math.random() * src.length)]
    pts.push({
      x: p.x + gauss() * 0.007,
      y: p.y + gauss() * 0.007,
      z: gauss() * 0.03,
    })
  }
  return pts
}

// ---------------------------------------------------------------------------

export const FORMATIONS = {
  Globe:    { gen: globe,    rotate: 0.22,  caption: 'Terra — the globe' },
  Galaxy:   { gen: galaxy,   rotate: 0.34,  caption: 'Helix — spiral galaxy' },
  Rings:    { gen: rings,    rotate: 0.28,  caption: 'Halo — orbital rings' },
  Star:     { gen: star,     rotate: 0,     caption: 'Polaris — the star' },
  Wave:     { gen: wave,     rotate: 0,     caption: 'Tide — standing wave' },
  Wordmark: { gen: wordmark, rotate: 0,     caption: 'Lumen — wordmark' },
}

export const FORMATION_ORDER = ['Globe', 'Galaxy', 'Rings', 'Star', 'Wave', 'Wordmark']
