# LUMEN — an interactive drone show

A night sky. A fleet of glowing drones flickers awake on the ground, lifts
off, and paints formations overhead — a rotating globe, a spiral galaxy,
orbital rings, a star, a standing wave, the LUMEN wordmark — dissolving from
one into the next in slow sweeping waves.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173).

## Conduct it

The floating DialKit panel (top right) is your console:

- **formation** — jump straight to any shape
- **autoCycle** — let the show run itself, or take the wheel (shortcut: A)
- **speed** — dreamlike slow to brisk (hold S + scroll)
- **drones** — 120 to 900 lights in the sky (hold D + scroll)
- **mood** — Moonlight, Ember, Aurora, Ultraviolet
- **glow** — how hard the lights bloom (hold G + scroll)
- **next / scatter** — advance the show, or blow the fleet apart and watch it reform

And the sky itself is alive: drift your cursor through the swarm and the
drones part around it like wind; click anywhere to scatter them.

## How it works

Every drone is an independent agent — a damped spring chasing a slot in the
current formation. The slots themselves slowly rotate and "breathe," and the
drones lag behind them slightly, which is what makes the motion feel flown
rather than tweened. Formation changes sweep a dissolve wave across the fleet
(left-to-right, bottom-up, or radial, chosen at random): as the wave reaches
each drone it gets a small scatter kick, then flows to its new slot.

Rendering is a single 2D canvas with additive blending, pre-rendered glow
sprites, per-drone flicker and twinkle, and a soft trail buffer. The wordmark
formation is sampled live from rasterized text, so swapping in your own logo
is a one-line change in `src/engine/shapes.js`.

Built with Vite + React, [DialKit](https://joshpuckett.me/dialkit), and Motion.
