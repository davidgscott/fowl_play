# FOWL PLAY

A first-person shooter inspired by classic 8-bit duck-hunting arcade games — except
you're on the ground in an infinite 3D world, the ducks are armed, and they hunt you back.

Every texture, sprite, and sound is generated at runtime (canvas pixel art + Web Audio
synthesis). No downloaded assets, no external files.

**Play it:** https://davidgscott.github.io/fowl_play/

## How to run locally

```
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173) in a desktop browser and
click to start. `npm run build` produces a production build in `dist/`
(serve it with `npm run preview`).

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (pointer lock) |
| Left click | Fire current weapon |
| Right click | Grappling hook — zip to terrain/platforms, or instant-kill a duck. Right click again mid-zip to release early |
| 1 / 2 / 3 / 4 | Switch weapon: Gun / Shotgun / Knives / Bread |
| Q | Backward lunge — fast dodge dash (~2s cooldown) |
| Space | Jump |
| R | Restart |
| Esc | Pause (click to resume) |

## The world

The map is **infinite** — terrain streams in around you as you move, with randomly
placed trees, floating stone platforms, and barns. There is no border. Grapple onto
anything to get around fast.

## The ducks

Ducks fly in waves and fight back two ways:

- **Eggs** — aimed shots that deal 10 damage. Strafe or lunge out of the way.
- **Explosive poop** — dropped like a bomb when a duck passes overhead. Listen for
  the falling whistle and move: 20 damage in a blast radius.

Wave N spawns 3 + N ducks; each wave they fly faster and shoot more often.

## Weapons

| Weapon | To kill | Notes |
|---|---|---|
| **Gun** | Headshot: 1 shot (+150). Body: 2 shots (+100) | Reliable hitscan. Starts unlocked. |
| **Shotgun** | 1 shot, cone blast (+120) | Short range only. 5 shells, then auto-reload. Buy in shop. |
| **Throwing knives** | 1 hit (+300, **double cash**) | A projectile you must lead — but it **pierces every duck in its path**, so one throw can wipe a whole line. Buy in shop. |
| **Grappling hook** | Always 1 hit (+150) | Also your mobility tool. 2s cooldown. |
| **Bread** | Doesn't kill — **recruits** | See below. |

## Bread & duck allies

You start with **2 loaves of bread = 6 pieces**. With bread equipped, left click lobs
a piece. Land **3 pieces on the same duck** and it joins your side:

- Its head turns bread-yellow
- It follows you and fires eggs at enemy ducks
- Its kills earn you money
- It survives between waves and can't be hurt by your weapons

## Money & the shop

Every duck killed earns **$20** (knife kills: **$40**). Clearing a wave awards +500
points and opens the **shop**:

| Item | Price |
|---|---|
| Bread loaf (3 pieces) | $40 |
| Throwing knives | $80 |
| Shotgun | $120 |
| Gun fire rate +20% | $50 |
| Shotgun mag +2 | $40 |
| Shotgun range +6 | $40 |
| Faster knife throws | $40 |
| Max HP +25 (and full heal) | $60 |

Press **1–9** to buy, **Enter** to start the next wave. Your high score is saved in
localStorage.

## Tech

- Three.js + vanilla JavaScript, bundled with Vite
- Rendered at 480×270 internally and upscaled with `image-rendering: pixelated`
- All textures drawn on 16×16/32×32 canvases with `THREE.NearestFilter`, restricted
  to an NES-like ~12-color palette
- All sound effects synthesized with the Web Audio API
- Infinite terrain via seeded chunk streaming (40-unit chunks around the player)
- Single-player, desktop browser, no backend

## Deployment

Pushes to `main` build and deploy to GitHub Pages automatically via
`.github/workflows/deploy.yml`. In the repo settings, set
**Pages → Source → GitHub Actions**.
