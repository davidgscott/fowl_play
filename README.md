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
| 1 / 2 / 3 / 4 / 5 | Switch weapon: Gun / Shotgun / Knives / Bread / A.A. Flak Cannon |
| Q | Backward lunge — fast dodge dash (~2s cooldown) |
| Space | Jump |
| R | Restart — during a run it asks to confirm first (Y restart / N resume); on the game-over screen it restarts instantly |
| Esc | Pause (click to resume) |

### On a phone or tablet (iOS / Android)

Open the same page in a mobile browser — touch controls appear automatically (and
are never shown on desktop):

| Touch input | Action |
|---|---|
| Left thumb (drag) | Virtual joystick — move |
| Right side (drag) | Look / aim |
| **FIRE** button | Fire current weapon (hold to keep firing) |
| **GRPL** button | Grappling hook |
| **LUNGE** button | Backward dodge dash |
| **JUMP** button | Jump (hold to bunny-hop) |
| GUN / SHOT / KNIFE / BREAD | Tap to switch weapon |
| **II** (top-right) | Pause / resume |

In the shop, tap an item to buy it and **NEXT WAVE** to continue. On the game-over
screen, tap anywhere to restart. Add the page to your home screen for a
fullscreen, address-bar-free experience.

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

### Tougher foes

The skies get meaner as you go:

- **Armored ducks** (from **wave 5**) — steel-plated. Headshots no longer instakill;
  they soak several hits. Their share of the flock grows each wave. Worth more points and cash.
- **Geese** (from **wave 10**, +1 more every 10 waves) — big, fast, tanky heavies that
  **honk**, fire more often, and take a beating. Killing one pays out handsomely.
- **"Tummy Troubles"** the albatross (**wave 20**, and every 20th wave after) — a
  boss-sized foe with its own health bar. It **carpet-bombs poop**: it lines up over you
  and drops a rapid string of explosions you have to sprint out of. Extremely tanky —
  one-shot weapons only chip it (they're capped), and it can't be recruited with bread —
  so you'll be leaning on the flak cannon. Worth a small fortune when it finally drops.

Knives and the grappling hook still one-shot the regular foes (they're precise and risky),
but against a swarm of armor, geese, and the albatross you'll want the flak cannon.

## Weapons

| Weapon | To kill | Notes |
|---|---|---|
| **Gun** | Headshot: 1 shot (+150). Body: 2 shots (+100) | Reliable hitscan. Starts unlocked. |
| **Shotgun** | 1 shot, cone blast (+120) | Short range only. 5 shells, then auto-reload. Buy in shop. |
| **Throwing knives** | 1 hit (+300, **double cash**) | A projectile you must lead — but it **pierces every duck in its path**, so one throw can wipe a whole line. Buy in shop. |
| **Grappling hook** | Always 1 hit | Also your mobility tool. 2s cooldown. Instant-kills any variant. |
| **A.A. Flak Cannon** | Airburst area damage | Quad-barrel WWII-style AA gun. Each pull fires a **4-shell volley** that detonates near a duck (or on a fuse) and **kills/damages every enemy in the blast radius** — the way to shred formations, armor, and geese. 6 volleys, then auto-reload. Buy in shop ($200). |
| **Bread** | Doesn't kill — **recruits** | See below. |

Points and cash **scale with the enemy**: armored ducks and geese are worth far more than a
plain duck, so the harder the target, the bigger the payout.

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
| **A.A. flak cannon** | **$200** |
| Flak blast radius + | $60 |
| Flak ammo +2 | $50 |
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
- Single-player, no backend; plays on desktop (keyboard + mouse) and touch
  devices (on-screen joystick + buttons, added only when a coarse pointer is detected)

## Deployment

Pushes to `main` build and deploy to GitHub Pages automatically via
`.github/workflows/deploy.yml`. In the repo settings, set
**Pages → Source → GitHub Actions**.
