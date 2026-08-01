import { useEffect, useRef, useState } from 'react'
import { useDialKit } from 'dialkit'
import { motion, AnimatePresence } from 'motion/react'
import { SwarmEngine } from './engine/SwarmEngine.js'
import sceneBw from './assets/scenes/bw.jpg'
import sceneShiny from './assets/scenes/shiny.jpg'
import sceneEvening from './assets/scenes/evening.jpg'
import sceneBlueCity from './assets/scenes/blue-city.jpg'
import sceneRedCity from './assets/scenes/red-city.avif'

// Bundled preset backdrops. Local assets are same-origin, so the composite
// canvas stays exportable (no cross-origin taint) for the download button.
const PRESETS = [
  { id: 'bw', src: sceneBw },
  { id: 'shiny', src: sceneShiny },
  { id: 'evening', src: sceneEvening },
  { id: 'blue-city', src: sceneBlueCity },
  { id: 'red-city', src: sceneRedCity },
]

export default function App() {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const fileRef = useRef(null)
  const [caption, setCaption] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  const applyPhoto = (src, onReady) => {
    const img = new Image()
    img.onload = () => {
      engineRef.current?.setCustomImage(img)
      onReady?.()
    }
    img.src = src
  }

  const onPreset = (preset) => {
    setSelectedPhoto(preset.id)
    applyPhoto(preset.src)
  }

  const onPhotoPicked = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    applyPhoto(url, () => URL.revokeObjectURL(url))
    setSelectedPhoto('custom')
    e.target.value = '' // allow re-picking the same file
  }

  const onDownload = () => {
    const dataUrl = engineRef.current?.capture()
    if (!dataUrl) return
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `lumen_${stamp}.png`
    a.click()
  }

  const params = useDialKit(
    'Conductor',
    {
      formation: {
        type: 'select',
        options: ['Globe', 'Galaxy', 'Rings', 'Star', 'Wave', 'Wordmark'],
        default: 'Globe',
      },
      wordmarkText: { type: 'text', default: 'LUMEN', placeholder: 'LUMEN' },
      autoCycle: true,
      speed: [1, 0.25, 2.5, 0.05],
      drones: [450, 120, 900, 10],
      mood: {
        type: 'select',
        options: ['Moonlight', 'Ember', 'Aurora', 'Ultraviolet'],
        default: 'Moonlight',
      },
      glow: [1, 0.4, 2, 0.05],
      scene: {
        type: 'select',
        options: ['Treeline', 'Lakeside', 'Skyline', 'Open Sky', 'Custom'],
        default: 'Treeline',
      },
      uploadPhoto: { type: 'action' },
      next: { type: 'action' },
      scatter: { type: 'action' },
    },
    {
      onAction: (action) => {
        const e = engineRef.current
        if (!e) return
        if (action === 'next') e.next()
        if (action === 'scatter') e.scatter()
        if (action === 'uploadPhoto') fileRef.current?.click()
      },
      shortcuts: {
        speed: { key: 's', mode: 'fine' },
        drones: { key: 'd', mode: 'coarse' },
        glow: { key: 'g', mode: 'fine' },
        autoCycle: { key: 'a' },
      },
    }
  )

  // boot the engine once
  useEffect(() => {
    const engine = new SwarmEngine(canvasRef.current, {
      onFormation: (name, text) => setCaption({ name, text, at: Date.now() }),
    })
    engineRef.current = engine
    engine.start(450)
    return () => engine.destroy()
  }, [])

  // push dial values into the engine
  useEffect(() => { engineRef.current?.setSpeed(params.speed) }, [params.speed])
  useEffect(() => { engineRef.current?.setGlow(params.glow) }, [params.glow])
  useEffect(() => { engineRef.current?.setAutoCycle(params.autoCycle) }, [params.autoCycle])
  useEffect(() => { engineRef.current?.setPalette(params.mood) }, [params.mood])
  useEffect(() => { engineRef.current?.setCount(params.drones) }, [params.drones])
  useEffect(() => { engineRef.current?.setScene(params.scene) }, [params.scene])
  useEffect(() => { engineRef.current?.setWordmarkText(params.wordmarkText) }, [params.wordmarkText])

  const firstFormation = useRef(true)
  useEffect(() => {
    const e = engineRef.current
    if (!e) return
    if (firstFormation.current) {
      // the intro liftoff already flies to the first formation
      firstFormation.current = false
      return
    }
    if (e.started && e.formation !== params.formation) {
      e.setFormation(params.formation)
    }
  }, [params.formation])

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="sky" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPhotoPicked}
      />

      <div className="overlay">
        <motion.header
          className="brand"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 1.6, ease: 'easeOut' }}
        >
          <div className="brand-mark">{(params.wordmarkText || 'LUMEN').toUpperCase()}</div>
          <div className="brand-sub">drone light shows</div>
        </motion.header>

        <motion.p
          className="tagline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.2, duration: 2.2 }}
        >
          A thousand quiet machines, painting the night.
        </motion.p>

        <div className="caption-slot">
          <AnimatePresence mode="wait">
            {caption && (
              <motion.div
                key={caption.at}
                className="caption"
                initial={{ opacity: 0, y: 10, letterSpacing: '0.55em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.42em' }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              >
                {caption.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="photo-dock">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={
                'photo-thumb' + (selectedPhoto === p.id ? ' is-active' : '')
              }
              style={{ backgroundImage: `url(${p.src})` }}
              onClick={() => onPreset(p)}
              aria-label={`Backdrop ${p.id}`}
            />
          ))}
          <button
            type="button"
            className={
              'photo-thumb photo-add' +
              (selectedPhoto === 'custom' ? ' is-active' : '')
            }
            onClick={() => fileRef.current?.click()}
            aria-label="Upload your own photo"
          >
            +
          </button>
          <button
            type="button"
            className="photo-download"
            onClick={onDownload}
            aria-label="Download this moment"
          >
            ↓ Save
          </button>
        </div>

        <motion.footer
          className="hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ delay: 5, duration: 2 }}
        >
          drift your cursor through the swarm &nbsp;·&nbsp; click to scatter
          &nbsp;·&nbsp; the dials are yours, conductor
        </motion.footer>
      </div>
    </div>
  )
}
