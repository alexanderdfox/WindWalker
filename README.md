# Windwalker — Strandbeest Workshop

A browser-based 3D workshop where you build Theo Jansen–style Strandbeests on a digital beach, summon the wind, and watch your linkage geometry succeed or stumble.

## Quick start

**Option A — open directly:** double-click `index.html` (Three.js is bundled locally under `js/lib/three/`).

**Option B — local server** (recommended in Safari, or if modules fail on `file://`):

```bash
cd /Users/alexanderfox/Documents/Projects/Strandbeest
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## How to play

1. **Enter the Workshop** — Read the parable, then begin.
2. **Drag parts** from the left palette onto the sand (femur, tibia, cranks, joints, frame, etc.).
3. **Leg kits** — Drop *Complete Jansen leg*, *Dual crank*, or *4-leg walker frame* for accurate 13-link legs.
4. **Connect** — Choose Connect tool, click joint sphere A, then joint B on another bar.
5. **Analysis** — Toggle *Analysis* to see foot-path quality and deviation from Jansen’s holy numbers.
6. **Summon Wind** — When you have legs or enough connected structure, start the walk. Good geometry → graceful stride and footprints; poor geometry → wobble and collapse.
7. **Challenges** — Progress from first pivot to museum preservation.
8. **Museum of Life** — After a successful walk, name and save your creation (localStorage).
9. **Export** — **STL** for 3D printing (full mesh, mm). **DXF** for laser/CNC: beach top view (`TOP_*` layers) plus spaced 2D Jansen leg plans (`LEGn_PLAN`) and foot paths.

## Tech stack

| Layer | Choice |
|--------|--------|
| 3D | [Three.js](https://threejs.org/) r160 (ES modules in `js/lib/three/`) |
| Physics / walk | Custom kinematic Jansen solver + stability-based locomotion |
| Storage | `localStorage` (museum + challenges) |

## Project structure

```
index.html          — Shell UI, intro parable
css/style.css       — Minimal beach aesthetic
js/main.js          — Game loop, input, UI wiring
js/scene.js         — Beach, sky, wind particles, footprints
js/jansen.js        — Holy numbers, linkage solver, foot-path analysis
js/parts.js         — Part definitions and kits
js/builder.js       — Place, snap, connect, serialize builds
js/simulation.js    — Wind walk / stability / stumble
js/challenges.js    — Progression quests
js/museum.js        — Save / load designs
```

## Jansen holy numbers

The leg uses Theo Jansen’s proportional constants (mm, relative):

`a=38, b=41.5, c=39.3, d=40.1, e=55.8, f=39.4, g=36.7, h=65.7, i=49, j=50, k=61.9, l=7.8, m=15`

Scale all lengths uniformly to resize the walker; keep ratios within ~3% for a flat stance phase.

## Educational notes

- **Single DOF** — A correct Jansen leg has one driven crank; the rest of the joints are determined by geometry.
- **Foot path** — The “foot” joint traces a closed curve; the bottom should be nearly flat for efficient beach walking.
- **Failure is instructive** — Deliberately wrong bar lengths in Analysis show high deviation % and low foot-path score.

## Extending the game

- Add **cannon-es** rigid bodies for full ragdoll collapse.
- Export **STL** / **DXF** from the palette (already built in).
- Multiplayer museum sync via a small backend API.

---

*With understanding of physics and patience, even a child can breathe life into machines.*
