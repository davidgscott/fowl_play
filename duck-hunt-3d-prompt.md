# Claude Code Prompt — "FOWL PLAY" (Duck Hunt 3D FPS)

Copy everything below this line into Claude Code, run from a fresh empty folder.

---

Build a complete, playable browser game from start to finish: set up the project, write all the code, generate every asset procedurally in code, playtest it, fix bugs, and finish with a working game plus a README. Do not stop at a partial implementation — the definition of done is at the bottom.

## Concept
A first-person shooter inspired by classic 8-bit duck-hunting arcade games — except you're on the ground in a 3D world, the ducks are armed, and they hunt you back. Working title: **FOWL PLAY** (feel free to keep or improve it).

## Tech stack
- Three.js + vanilla JavaScript, Vite for dev server and build
- Pointer Lock API for mouse look
- Every texture and sprite generated at runtime on small `<canvas>` elements (pixel art) — **no downloaded assets, no external files**
- Web Audio API for all sound effects (synthesized, no audio files)
- Original art only — inspired by the 8-bit era, not copied from any existing game

## Player
- WASD to move, mouse look, Space to jump, simple gravity
- 100 HP; duck projectiles deal 10 damage; brief red screen flash when hit
- **Blaster (left click):** hitscan raycast with muzzle flash and a short cooldown; takes 2 hits to kill a duck
- Death at 0 HP → retro game-over screen with final score, high score (localStorage), "PRESS R TO RESTART"

## Grappling hook (right click) — the signature mechanic
- Raycast from the camera, max range ~60 units, visible rope line while active
- **Hits terrain or a platform:** rapidly pulls the player to the anchor point (zip with a slight arc); auto-release on arrival, or right click again mid-flight to release early
- **Hits a duck: instant kill.** The duck bursts into pixel feathers and the hook snaps back
- Short cooldown (~2s) with a visible HUD indicator
- **Backward lunge (Q):** a fast backward dash to dodge incoming fire, ~2s cooldown, small camera kick for feel

## Ducks
- Voxel-style, built from a handful of Three.js boxes: body, head, beak, and wings that flap (animated rotation)
- NES-limited colors: dark body, white belly, green- and red-headed variants, orange beak
- AI: fly between random waypoints with sine-wave bobbing; every 2–4 seconds a duck pauses, faces the player, and fires a slow glowing pixel-orb projectile the player can strafe or lunge away from
- On death: feather particle burst, score popup, descending death-quack bleep

## Waves and scoring
- Wave N spawns 3 + N ducks; each wave they fly slightly faster and shoot slightly more often
- +100 per blaster kill, +250 per grapple kill, wave-clear bonus
- 3-second "WAVE N" pixel banner between waves

## Map — keep it simple
- Bounded arena, roughly 120×120: flat ground with a tiled pixel-grass texture
- Grapple targets: 4–6 floating platforms at varying heights, several blocky trees (trunk + cube canopy), and one barn or tower
- Invisible walls at the edges; simple retro sky (flat gradient plus blocky cloud sprites)
- Everything is grapple-able except the sky

## 8-bit aesthetic — this matters
- All textures on 16×16 or 32×32 canvases, `THREE.NearestFilter`, no smoothing
- Restrict everything to an NES-like palette of ~12 colors
- Render at a low internal resolution (e.g., 480×270) and upscale with `image-rendering: pixelated` for chunky pixels
- HUD in blocky pixel-style text: health bar, score, wave counter, grapple cooldown, crosshair
- Title screen with the game name in big pixel letters and "CLICK TO START" (click also engages pointer lock)

## Audio (Web Audio, synthesized)
- Blaster: short square-wave blast · Grapple: rising zip · Lunge: whoosh
- Duck quack: two-tone honk · Player hit: harsh buzz · Wave start: tiny fanfare

## Definition of done
- `npm install && npm run dev` launches the game; `npm run build` also succeeds
- Playtest it yourself: verify pointer lock, all controls, both grapple modes (terrain pull + duck instant kill), backward lunge, duck AI firing, damage, death/restart, and wave progression — with zero console errors
- Tune movement, grapple speed, and lunge distance until it feels snappy
- README.md with the controls and how to run it
- Single-player, desktop browser, no backend

Show this controls summary on the title screen:
`WASD move · Mouse look · L-click shoot · R-click grapple · Q lunge back · Space jump · R restart`
