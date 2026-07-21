import * as THREE from 'three';
import { buildWorld, updateWorld, solids, grappleTargets } from './world.js';
import {
  Duck, ProjectileManager, BombManager, KnifeManager, BreadManager,
  AllyEggManager, FeatherManager, FlakManager, FlameManager, SharkManager,
} from './ducks.js';
import { initAudio, sfx } from './audio.js';
import { pixelTextCanvas, muzzleTexture, flakGunCanvas, aaSightCanvas, PAL } from './textures.js';
import { isTouchDevice, initMobileControls } from './mobile.js';
import { renderWhatsNew } from './whatsnew.js';

// ---------- renderer at low internal resolution, upscaled with CSS ----------
const INTERNAL_H = 270;

// Some machines can't create a WebGL context (hardware acceleration disabled,
// a blocked/sandboxed GPU, an old browser). Without this guard the very first
// line throws, main.js never finishes loading, and the player is stuck on a
// dark title screen where "click to start" does nothing. Catch it and show a
// helpful message instead.
function showWebGLError() {
  document.getElementById('title')?.classList.add('hidden');
  document.getElementById('webgl-error')?.classList.remove('hidden');
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false });
} catch (err) {
  showWebGLError();
  throw err; // stop the rest of the game from initializing
}
renderer.setPixelRatio(1);
document.getElementById('game').appendChild(renderer.domElement);

// A context can also be lost after creation (GPU reset/crash) — surface that too
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showWebGLError();
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 400);
scene.add(camera);

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(Math.round(INTERNAL_H * aspect), INTERNAL_H, false);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

buildWorld(scene);

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'), flash: $('flash'), popups: $('popups'), banner: $('banner'),
  title: $('title'), titleArt: $('title-art'), gameover: $('gameover'),
  gameoverArt: $('gameover-art'), finalScore: $('final-score'), highScore: $('high-score'),
  paused: $('paused'), healthFill: $('health-fill'), grappleFill: $('grapple-fill'),
  lungeFill: $('lunge-fill'), score: $('score'), wave: $('wave'), ducksLeft: $('ducks-left'),
  weapon: $('weapon'), money: $('money'), allies: $('allies'),
  shop: $('shop'), shopArt: $('shop-art'), shopMoney: $('shop-money'),
  shopList: $('shop-list'),
  confirm: $('confirm'), confirmYes: $('confirm-yes'), confirmNo: $('confirm-no'),
  crosshair: $('crosshair'), aaReticle: $('aa-reticle'), flakGun: $('flak-gun'),
  bossBar: $('boss-bar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
  scope: $('scope'), whatsNew: $('whatsnew'), hitmarker: $('hitmarker'),
};

// WHAT'S NEW popup. Copy lives in whatsnew.js; the build stamp injected by
// vite.config.js only supplies the version chip.
renderWhatsNew(el.whatsNew, typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null);

el.flakGun.appendChild(flakGunCanvas());
el.aaReticle.appendChild(aaSightCanvas());
el.titleArt.appendChild(pixelTextCanvas('FOWL PLAY', 10, PAL.yellow));
el.gameoverArt.appendChild(pixelTextCanvas('GAME OVER', 8, PAL.red));
el.shopArt.appendChild(pixelTextCanvas('SHOP', 8, PAL.green));

// ---------- game state ----------
const EYE = 1.7;
const PLAYER_RADIUS = 0.5;
const GRAVITY = 30;
const MOVE_SPEED = 12;
const JUMP_SPEED = 10.5;
const GRAPPLE_RANGE = 60;
const GRAPPLE_SPEED = 34;
const GRAPPLE_COOLDOWN = 2;
const LUNGE_COOLDOWN = 2;

const HS_KEY = 'fowlplay-highscore';

let state = 'title'; // title | playing | shop | paused | gameover
let yaw = 0, pitch = 0;
let pos = new THREE.Vector3(0, EYE, 20);
let vy = 0;
let impulse = new THREE.Vector3(); // lunge / grapple-release momentum
let grounded = true;
let maxHp = 100;
let hp = maxHp;
let score = 0;
let money = 0; // earned per kill, spent in the shop between waves
let wave = 0;
let kickPitch = 0; // camera kick from lunge / firing recoil

// ---- game-feel ("juice") state + tunables ----
let shake = 0;                 // positional screen-shake amount, decays each frame
let comboCount = 0, comboTimer = 0; // rapid-kill streak
let frameCount = 0, audioFrame = -1; // throttle the hit "thock" to <=1 per frame

// recoil kick per weapon (radians of upward pitch)
const KICK_GUN = 0.035, KICK_MG = 0.02, KICK_SHOTGUN = 0.06, KICK_FLAK = 0.05;
// screen-shake magnitudes (world units) and recovery
const SHAKE_HIT = 0.04, SHAKE_KILL = 0.12, SHAKE_EXPLODE = 0.18, SHAKE_MAX = 0.4, SHAKE_DECAY = 6;
const COMBO_WINDOW = 2.0;      // seconds to keep a streak alive
const TRACER_LIFE = 0.06;      // seconds a bullet tracer stays visible

// Reduce-Motion accessibility toggle (scales shake + recoil only; SFX unaffected)
let reduceMotion = localStorage.getItem('fowlplay-reduce-motion') === '1';
function motionScale() { return reduceMotion ? 0.3 : 1; }

let grappleCd = 0, lungeCd = 0;
let grappling = false;
let grappleAnchor = new THREE.Vector3();
let grappleStuck = 0; // seconds without progress toward the anchor

let ducks = [];
let waveState = 'banner'; // banner | active
let waveTimer = 0;

// Waves trickle in rather than landing all at once: `waveQueue` is the roster
// still waiting to fly in, and one bird peels off every SPAWN_MIN..SPAWN_MAX
// seconds from a ring all the way around the player. You can't outrun a flock
// that keeps appearing behind you.
const SPAWN_MIN = 2, SPAWN_MAX = 5;
const SPAWN_RING_MIN = 45, SPAWN_RING_MAX = 70;
let waveQueue = [];
let spawnTimer = 0;

// flying V: with 3+ allies the squad occasionally forms up Mighty-Ducks style
// and strafes clean through the flock
const V_SPEED = 40;
const V_KILL_RADIUS = 7;
const V_DURATION = 2.8;
const V_MIN_ALLIES = 3;
let vCooldown = 14;
let vActive = false;
let vTimer = 0;
let vSquad = [];
const vHitSet = new Set(); // birds already struck by the current run
const vPos = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vRight = new THREE.Vector3();

const keys = {};
let mouseDown = false; // held for the full-auto weapons
let scoping = false;   // SHIFT held with the sniper equipped: zoomed in
const projectiles = new ProjectileManager(scene);
const bombs = new BombManager(scene);
const knives = new KnifeManager(scene);
const bread = new BreadManager(scene);
const allyEggs = new AllyEggManager(scene);
const feathers = new FeatherManager(scene);
const flak = new FlakManager(scene);
const flames = new FlameManager(scene);
const sharks = new SharkManager(scene);
const raycaster = new THREE.Raycaster();

// ---------- weapons ----------
const weapons = {
  gun: { name: 'GUN', unlocked: true, rate: 0.25, cd: 0 },
  // Wide, brutal, and short-ranged - the arc is deliberately the widest in the
  // game, and dmg one-shots an armored duck (6hp) but not a goose (10hp).
  shotgun: { name: 'SHOTGUN', unlocked: false, rate: 0.7, cd: 0, range: 28, arc: 0.55, dmg: 7,
             mag: 5, ammo: 5, reloadTime: 1.6, reload: 0 },
  knife: { name: 'KNIVES', unlocked: false, rate: 0.55, cd: 0 },
  bread: { name: 'BREAD', unlocked: true, rate: 0.4, cd: 0, pieces: 8 },
  // full auto: hold to fire. Low damage per round, but it never stops coming.
  mg: { name: 'MACHINE GUN', unlocked: false, rate: 0.075, cd: 0, auto: true,
        mag: 50, ammo: 50, reloadTime: 2.2, reload: 0, spread: 0.02 },
  // continuous short-range cone. Fuel drains while held and refills when idle.
  flame: { name: 'FLAMETHROWER', unlocked: false, cd: 0, rate: 0, stream: true,
           range: 14, dps: 22, arc: 0.32, fuel: 100, maxFuel: 100, burn: 26, regen: 12 },
  // quad AA cannon: each pull fires a 4-shell volley that airbursts. Level 10+.
  // Semi-auto until the shop full-auto upgrade flips `auto` on.
  flak: { name: 'FLAK', unlocked: false, rate: 1.15, cd: 0, auto: false, mag: 4, ammo: 4, reloadTime: 2.8, reload: 0, shells: 4, spread: 0.06, dmg: 5, radius: 4 },
  // Rifle. Hold SHIFT to scope in (zoom + steady aim); fire from the hip and it
  // still hits hard but sprays, so a no-scope is a real shot you can pull off.
  sniper: { name: 'SNIPER', unlocked: false, rate: 1.3, cd: 0, mag: 5, ammo: 5, reloadTime: 2.4, reload: 0,
            dmg: 14, fov: 26, hipSpread: 0.045 },
  // launches an actual shark. It latches, thrashes the bird, bites it in half.
  shark: { name: 'SHARK LAUNCHER', unlocked: false, rate: 1.6, cd: 0, mag: 3, ammo: 3, reloadTime: 4.0, reload: 0 },
};
const WEAPON_KEYS = {
  Digit1: 'gun', Digit2: 'shotgun', Digit3: 'knife', Digit4: 'bread',
  Digit5: 'mg', Digit6: 'flame', Digit7: 'flak', Digit8: 'sniper', Digit9: 'shark',
};
const BASE_FOV = 75;
let weaponId = 'gun';

function resetWeapons() {
  Object.assign(weapons.gun, { unlocked: true, rate: 0.25, cd: 0 });
  Object.assign(weapons.shotgun, { unlocked: false, rate: 0.7, cd: 0, range: 28, arc: 0.55, dmg: 7, mag: 5, ammo: 5, reload: 0 });
  Object.assign(weapons.knife, { unlocked: false, rate: 0.55, cd: 0 });
  Object.assign(weapons.bread, { rate: 0.4, cd: 0, pieces: 8 });
  Object.assign(weapons.mg, { unlocked: false, rate: 0.075, cd: 0, mag: 50, ammo: 50, reload: 0 });
  Object.assign(weapons.flame, { unlocked: false, cd: 0, range: 14, dps: 22, fuel: 100, maxFuel: 100, regen: 12 });
  Object.assign(weapons.flak, { unlocked: false, rate: 1.15, cd: 0, auto: false, mag: 4, ammo: 4, reload: 0, shells: 4, spread: 0.06, dmg: 5, radius: 4 });
  Object.assign(weapons.sniper, { unlocked: false, rate: 1.3, cd: 0, mag: 5, ammo: 5, reload: 0, dmg: 14 });
  Object.assign(weapons.shark, { unlocked: false, rate: 1.6, cd: 0, mag: 3, ammo: 3, reload: 0 });
  weaponId = 'gun';
}

// weapons that show "ammo/mag" in the HUD and auto-reload when emptied
const MAG_WEAPONS = ['shotgun', 'flak', 'mg', 'sniper', 'shark'];

// ---------- shop (opens after each cleared wave; kills earn money) ----------
const MONEY_PER_KILL = 20;

// the shop opens between waves, so the wave you're shopping *for* is wave + 1
const nextWave = () => wave + 1;

// Unlocks are listed first: they gate on level, so they surface as they become
// legal and claim the low digit keys when they do.
const SHOP_ITEMS = [
  { id: 'unlock-knife', label: 'THROWING KNIVES', desc: 'PIERCES EVERYTHING IN ITS PATH - 2X CASH PER KILL', price: 80,
    avail: () => !weapons.knife.unlocked,
    apply: () => { weapons.knife.unlocked = true; } },
  { id: 'unlock-shotgun', label: 'SHOTGUN', desc: 'WIDE CONE BLAST - SHORT RANGE - HITS A WHOLE CLUSTER', price: 120,
    avail: () => !weapons.shotgun.unlocked,
    apply: () => { weapons.shotgun.unlocked = true; } },
  { id: 'unlock-mg', label: 'MACHINE GUN', desc: 'FULL AUTO - HOLD TO FIRE - 50 ROUND MAG', price: 220,
    avail: () => !weapons.mg.unlocked && nextWave() >= 5,
    apply: () => { weapons.mg.unlocked = true; } },
  { id: 'unlock-flame', label: 'FLAMETHROWER', desc: 'CONTINUOUS CONE - ROASTS WHOLE FLOCKS UP CLOSE', price: 340,
    avail: () => !weapons.flame.unlocked && nextWave() >= 8,
    apply: () => { weapons.flame.unlocked = true; } },
  { id: 'unlock-sniper', label: 'SNIPER RIFLE', desc: 'SCOPED - HEADSHOT KILLS ANYTHING - 2X CASH', price: 300,
    avail: () => !weapons.sniper.unlocked && nextWave() >= 7,
    apply: () => { weapons.sniper.unlocked = true; } },
  { id: 'unlock-flak', label: 'A.A. FLAK CANNON', desc: 'QUAD BARREL AIRBURST - LEVEL 10 CLEARANCE', price: 800,
    avail: () => !weapons.flak.unlocked && nextWave() >= 10,
    apply: () => { weapons.flak.unlocked = true; } },
  { id: 'unlock-shark', label: 'SHARK LAUNCHER', desc: 'LAUNCHES A SHARK - IT BITES BIRDS CLEAN IN HALF', price: 900,
    avail: () => !weapons.shark.unlocked && nextWave() >= 12,
    apply: () => { weapons.shark.unlocked = true; } },
  { id: 'bread', label: 'BREAD LOAF', desc: '5 PIECES - DUCK 3, GOOSE 5, ALBATROSS 7 HITS', price: 40,
    avail: () => true,
    apply: () => { weapons.bread.pieces += 5; } },
  { id: 'max-hp', label: 'MAX HP +25', desc: 'AND FULL HEAL', price: 60,
    avail: () => true,
    apply: () => { maxHp += 25; hp = maxHp; } },
  { id: 'flak-radius', label: 'FLAK BLAST +', desc: 'WIDER AIRBURST RADIUS', price: 150,
    avail: () => weapons.flak.unlocked,
    apply: () => { weapons.flak.radius += 1; } },
  { id: 'flak-mag', label: 'FLAK AMMO +2', desc: 'MORE VOLLEYS PER RELOAD', price: 150,
    avail: () => weapons.flak.unlocked,
    apply: () => { weapons.flak.mag += 2; weapons.flak.ammo = weapons.flak.mag; } },
  { id: 'flak-auto', label: 'FLAK FULL-AUTO', desc: 'HOLD TO FIRE - 2 VOLLEYS/SEC (UPGRADE TO GO FASTER)', price: 600,
    avail: () => weapons.flak.unlocked && !weapons.flak.auto,
    apply: () => { weapons.flak.auto = true; weapons.flak.rate = 0.5; weapons.flak.mag = Math.max(weapons.flak.mag, 10); weapons.flak.ammo = weapons.flak.mag; } },
  { id: 'flak-rate', label: 'FLAK FIRE RATE +', desc: 'CRANK THE FULL-AUTO FIRE SPEED', price: 300,
    avail: () => weapons.flak.auto && weapons.flak.rate > 0.2,
    apply: () => { weapons.flak.rate = Math.max(0.2, +(weapons.flak.rate * 0.78).toFixed(3)); } },
  { id: 'shark-mag', label: 'SHARK TANK +2', desc: 'CARRY MORE SHARKS', price: 250,
    avail: () => weapons.shark.unlocked,
    apply: () => { weapons.shark.mag += 2; weapons.shark.ammo = weapons.shark.mag; } },
  { id: 'sniper-mag', label: 'SNIPER MAG +3', desc: 'MORE ROUNDS PER RELOAD', price: 100,
    avail: () => weapons.sniper.unlocked,
    apply: () => { weapons.sniper.mag += 3; weapons.sniper.ammo = weapons.sniper.mag; } },
  { id: 'mg-mag', label: 'MG MAG +25', desc: 'LONGER BURSTS BEFORE RELOAD', price: 90,
    avail: () => weapons.mg.unlocked,
    apply: () => { weapons.mg.mag += 25; weapons.mg.ammo = weapons.mg.mag; } },
  { id: 'flame-tank', label: 'FUEL TANK UP', desc: '+50 FUEL AND FASTER REFILL', price: 120,
    avail: () => weapons.flame.unlocked,
    apply: () => { weapons.flame.maxFuel += 50; weapons.flame.fuel = weapons.flame.maxFuel; weapons.flame.regen += 4; } },
  { id: 'gun-rate', label: 'GUN FIRE RATE UP', desc: 'SHOOT 20% FASTER', price: 50,
    avail: () => weapons.gun.rate > 0.1,
    apply: () => { weapons.gun.rate = Math.max(0.1, weapons.gun.rate * 0.8); } },
  { id: 'shotgun-mag', label: 'SHOTGUN MAG +2', desc: 'MORE ROUNDS PER RELOAD', price: 40,
    avail: () => weapons.shotgun.unlocked,
    apply: () => { weapons.shotgun.mag += 2; weapons.shotgun.ammo = weapons.shotgun.mag; } },
  { id: 'shotgun-range', label: 'SHOTGUN RANGE UP', desc: '+6 RANGE', price: 40,
    avail: () => weapons.shotgun.unlocked,
    apply: () => { weapons.shotgun.range += 6; } },
  { id: 'knife-rate', label: 'QUICK THROW', desc: 'KNIVES 25% FASTER', price: 40,
    avail: () => weapons.knife.unlocked && weapons.knife.rate > 0.2,
    apply: () => { weapons.knife.rate = Math.max(0.2, weapons.knife.rate * 0.75); } },
];
let shopChoices = [];

function renderShop() {
  // only 9 fit on the digit keys, and SHOP_ITEMS is ordered so unlocks win them
  shopChoices = SHOP_ITEMS.filter((u) => u.avail()).slice(0, 9);
  el.shopMoney.textContent = `$${money}`;
  el.shopList.innerHTML = '';
  shopChoices.forEach((u, i) => {
    const div = document.createElement('div');
    div.className = 'shop-option' + (money < u.price ? ' too-poor' : '');
    div.dataset.index = i;
    div.innerHTML =
      `<span class="shop-key">${i + 1}</span> ${u.label}` +
      `<span class="shop-price">$${u.price}</span>` +
      `<div class="shop-desc">${u.desc}</div>`;
    el.shopList.appendChild(div);
  });
}

function openShop() {
  renderShop();
  el.shop.classList.remove('hidden');
  state = 'shop';
}

function buyItem(i) {
  const u = shopChoices[i];
  if (!u || money < u.price) {
    sfx.deny();
    return;
  }
  money -= u.price;
  u.apply();
  sfx.buy();
  renderShop();
}

function closeShop() {
  el.shop.classList.add('hidden');
  state = 'playing';
  startWave(wave + 1);
}

// ---------- test cheats (backtick ` opens a tiny console) ----------
// Type a wave number to warp straight there, or "guns" to unlock every weapon.
// Handy for testing the late game without grinding up to it.
function cheatConsole() {
  const ans = window.prompt(
    'CHEAT — type a wave number to warp there, or "guns" to unlock all weapons:',
    '',
  );
  if (ans == null) return;
  const t = ans.trim().toLowerCase();
  // start a run first if we're on the title / game-over screen
  if (state === 'title' || state === 'gameover') startGame();
  if (t === 'guns' || t === 'weapons' || t === 'all') {
    cheatUnlockAll();
    return;
  }
  const n = parseInt(t, 10);
  if (Number.isFinite(n) && n >= 1) cheatWarp(n);
}

function cheatUnlockAll() {
  for (const w of Object.values(weapons)) w.unlocked = true;
  money += 100000; // enough to also try every shop upgrade
  showBanner('CHEAT: ALL WEAPONS', PAL.yellow);
  sfx.buy();
}

function cheatWarp(n) {
  n = Math.max(1, Math.floor(n));
  // clear the current field (drop live enemies, keep any allies) and reset the
  // wave pipeline, then start the target wave through the normal flow
  for (const d of ducks) if (d.alive && !d.ally) d.die(true);
  ducks = ducks.filter((d) => d.alive);
  waveQueue = [];
  el.shop.classList.add('hidden');
  state = 'playing';
  startWave(n);
}

// rope line for the grapple
const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xf8b800 }));
rope.visible = false;
rope.frustumCulled = false;
scene.add(rope);

// ---- bullet tracers: a fixed pool of lines so hitscan shots read as bullets ----
const tracers = [];
for (let i = 0; i < 16; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, depthTest: false }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, geo, life: 0, ttl: TRACER_LIFE });
}
function muzzleWorld() {
  return camera.localToWorld(new THREE.Vector3(0.35, -0.3, -0.6));
}
function rayEnd(ray, range) {
  return ray.ray.origin.clone().addScaledVector(ray.ray.direction, range);
}
function spawnTracer(from, to, ttl = TRACER_LIFE) {
  let t = tracers.find((x) => x.life <= 0);
  if (!t) t = tracers.reduce((a, b) => (a.life < b.life ? a : b)); // reuse the oldest
  t.geo.setFromPoints([from, to]);
  t.line.visible = true;
  t.line.material.opacity = 1;
  t.life = ttl;
  t.ttl = ttl;
}
function updateTracers(dt) {
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) { t.line.visible = false; continue; }
    t.line.material.opacity = Math.max(0, t.life / t.ttl);
  }
}

// muzzle flash sprite attached to the camera
const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleTexture(), transparent: true, depthTest: false }));
muzzle.position.set(0.4, -0.3, -1);
muzzle.scale.set(0.45, 0.45, 1);
muzzle.visible = false;
camera.add(muzzle);
let muzzleTimer = 0;

// ---------- input ----------
document.addEventListener('contextmenu', (e) => e.preventDefault());

// pointer lock can reject (no user gesture, iframe) - don't let it become
// an unhandled rejection
function lockPointer() {
  const p = renderer.domElement.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // cheat console — works from any screen (see cheatConsole)
  if (e.code === 'Backquote') { e.preventDefault(); cheatConsole(); return; }
  if (state === 'shop') {
    if (/^Digit[1-9]$/.test(e.code)) buyItem(Number(e.code.slice(-1)) - 1);
    if (e.code === 'Enter' || e.code === 'Space') closeShop();
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  if (state === 'confirm') {
    if (e.code === 'KeyY' || e.code === 'Enter') performRestart();
    else if (e.code === 'KeyN') cancelRestart();
    return;
  }
  if (state === 'playing' && WEAPON_KEYS[e.code]) {
    const id = WEAPON_KEYS[e.code];
    if (weapons[id].unlocked && weaponId !== id) {
      weaponId = id;
      sfx.reload();
    }
  }
  // R restarts instantly on the game-over screen, but during a run it asks
  // first so an accidental key press doesn't wipe your progress.
  if (e.code === 'KeyR') {
    if (state === 'gameover') restart();
    else if (state === 'playing') confirmRestart();
  }
  if (e.code === 'KeyQ' && state === 'playing') lunge();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setScope(true);
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setScope(false);
});

// scoping in/out. Held, not toggled - let go and you're back to hip fire.
function setScope(on) {
  if (scoping === on) return;
  scoping = on;
  if (state === 'playing' && weaponId === 'sniper') sfx.scope();
}

document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== renderer.domElement) return;
  // scale with the zoom so scoped aiming isn't twitchy
  const sens = 0.0024 * (camera.fov / BASE_FOV);
  yaw -= e.movementX * sens;
  pitch -= e.movementY * sens;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});

document.addEventListener('mousedown', (e) => {
  if (isTouchDevice) return; // touch UI handles firing; ignore synthetic mouse events
  if (state !== 'playing') return;
  if (document.pointerLockElement !== renderer.domElement) {
    lockPointer();
    return;
  }
  if (e.button === 0) {
    mouseDown = true; // held: full-auto weapons keep firing from the main loop
    shoot();
  } else if (e.button === 2) grapple();
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});
// losing focus (alt-tab) must not stick the trigger or the scope down
window.addEventListener('blur', () => { mouseDown = false; scoping = false; });

el.title.addEventListener('click', () => {
  initAudio();
  startGame();
});
el.paused.addEventListener('click', () => {
  initAudio();
  if (isTouchDevice) togglePause(); // resume without pointer lock on touch
  else lockPointer();
});

// confirm-restart buttons (used on touch, or on desktop after Esc frees the cursor)
el.confirmYes.addEventListener('click', performRestart);
el.confirmNo.addEventListener('click', cancelRestart);

// Reduce-Motion toggle (title + pause screens) — scales shake/recoil, not SFX
function syncRmToggles() {
  for (const b of document.querySelectorAll('.rm-toggle')) {
    b.textContent = reduceMotion ? 'MOTION: REDUCED' : 'MOTION: FULL';
    b.classList.toggle('reduced', reduceMotion);
  }
}
for (const b of document.querySelectorAll('.rm-toggle')) {
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // don't start/resume the game underneath
    reduceMotion = !reduceMotion;
    localStorage.setItem('fowlplay-reduce-motion', reduceMotion ? '1' : '0');
    syncRmToggles();
  });
}
syncRmToggles();

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && state === 'paused') {
    state = 'playing';
    el.paused.classList.add('hidden');
  } else if (!locked && state === 'playing') {
    state = 'paused';
    el.paused.classList.remove('hidden');
  }
});

// ---------- game flow ----------
function startGame() {
  resetRun();
  state = 'playing';
  el.title.classList.add('hidden');
  el.gameover.classList.add('hidden');
  el.paused.classList.add('hidden');
  el.hud.classList.remove('hidden');
  if (!isTouchDevice) lockPointer();
  startWave(1);
}

// On touch devices there's no pointer lock to auto-pause on focus loss, so the
// on-screen Pause button drives pause/resume directly.
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    el.paused.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    el.paused.classList.add('hidden');
  }
}

function resetRun() {
  for (const d of ducks) if (d.alive) d.die(true);
  ducks = [];
  projectiles.clear();
  bombs.clear();
  knives.clear();
  bread.clear();
  allyEggs.clear();
  feathers.clear();
  flak.clear();
  flames.clear();
  sharks.clear();
  waveQueue = [];
  spawnTimer = 0;
  vActive = false;
  vSquad = [];
  vHitSet.clear();
  vCooldown = 14;
  mouseDown = false;
  scoping = false;
  pos.set(0, EYE, 20);
  yaw = 0;
  pitch = 0;
  vy = 0;
  impulse.set(0, 0, 0);
  maxHp = 100;
  hp = maxHp;
  score = 0;
  money = 0;
  wave = 0;
  grappleCd = lungeCd = 0;
  grappling = false;
  rope.visible = false;
  resetWeapons();
  el.shop.classList.add('hidden');
  el.popups.innerHTML = '';
}

function restart() {
  if (state === 'gameover') {
    startGame();
  } else {
    resetRun();
    state = 'playing';
    startWave(1);
  }
}

// ---------- restart confirmation (during a run) ----------
// Pressing R mid-run freezes the game and asks before wiping progress. Pointer
// lock is left as-is: on desktop it stays engaged so Y/N work from the keyboard
// with no re-lock cooldown; if the player hits Esc the cursor reappears and the
// on-screen buttons become clickable.
function confirmRestart() {
  state = 'confirm';
  el.confirm.classList.remove('hidden');
}

function relockIfNeeded() {
  if (!isTouchDevice && document.pointerLockElement !== renderer.domElement) lockPointer();
}

function performRestart() {
  el.confirm.classList.add('hidden');
  resetRun();
  state = 'playing';
  startWave(1);
  relockIfNeeded();
}

function cancelRestart() {
  el.confirm.classList.add('hidden');
  state = 'playing';
  relockIfNeeded();
}

function startWave(n) {
  wave = n;
  waveState = 'banner';
  waveTimer = 3;
  ducks = ducks.filter((d) => d.alive); // prune dead ducks, keep allies
  showBanner(`WAVE ${n}`, PAL.yellow);
}

// Compose the wave's roster. Plain ducks until wave 5, when armored ducks start
// mixing in. Geese arrive at wave 3 and steadily take over the flock; albatross
// join the rank and file from wave 21 and climb from there.
function waveRoster(n) {
  // boss fight every 5th wave from 20 (20, 25, 30, ...). Tummy Troubles brings
  // friends: one boss at 20, then another every 5 waves (capped), each with the
  // same attributes. Escort scales with depth too.
  if (n >= 20 && n % 5 === 0) {
    const bossCount = Math.min(4, Math.max(1, Math.floor((n - 15) / 5))); // 20:1 25:2 30:3 35:4
    const roster = [];
    for (let i = 0; i < bossCount; i++) roster.push('bossAlbatross');
    const alba = Math.floor((n - 20) / 10);   // rank-and-file albatrosses join at 30+
    const geese = 2 + Math.floor(n / 25);
    const armored = 3 + Math.floor(n / 12);
    for (let i = 0; i < alba; i++) roster.push('albatross');
    for (let i = 0; i < geese; i++) roster.push('goose');
    for (let i = 0; i < armored; i++) roster.push('armored');
    roster.push('duck', 'duck');
    return roster;
  }
  const count = 4 + Math.floor(n * 1.5);
  // albatross from 21, climbing roughly one per two waves
  const alba = n >= 21 ? Math.min(Math.round(count * 0.3), 1 + Math.floor((n - 21) / 2)) : 0;
  // geese from wave 3, taking a bigger share of the flock every wave
  const gooseFrac = n >= 3 ? Math.min(0.55, 0.12 + (n - 3) * 0.035) : 0;
  const geese = Math.min(count - alba, Math.round(count * gooseFrac));
  // armored ducks from wave 5
  let armored = 0;
  if (n >= 5) {
    const frac = Math.min(0.45, 0.2 + (n - 5) * 0.03);
    armored = Math.min(count - alba - geese, Math.round(count * frac));
  }
  const plain = Math.max(0, count - alba - geese - armored);
  const roster = [];
  for (let i = 0; i < alba; i++) roster.push('albatross');
  for (let i = 0; i < geese; i++) roster.push('goose');
  for (let i = 0; i < armored; i++) roster.push('armored');
  for (let i = 0; i < plain; i++) roster.push('duck');
  return roster;
}

// Shuffle so the trickle mixes types instead of sending all the heavies first.
function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A wave no longer lands in one lump: a few birds open the fight and the rest
// queue up to fly in from all around the player over the next minute or two.
function spawnWave() {
  const roster = waveRoster(wave);
  const boss = roster.filter((v) => v === 'bossAlbatross');
  const rest = shuffled(roster.filter((v) => v !== 'bossAlbatross'));

  // opening group: enough to fight immediately, the rest trickles in
  const opening = Math.min(rest.length, 2 + Math.floor(wave * 0.4));
  waveQueue = rest.slice(opening);
  spawnTimer = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);

  for (const variant of boss) spawnEnemy(variant, 30, 45);
  for (const variant of rest.slice(0, opening)) spawnEnemy(variant, 28, 48);

  announceWave(roster);
}

function spawnEnemy(variant, minR = SPAWN_RING_MIN, maxR = SPAWN_RING_MAX) {
  // Speed is capped: birds should be impossible to simply outrun, but past the
  // cap the escalation comes from numbers and tougher variants, not from geese
  // that move at twice the player's sprint.
  const speedScale = Math.min(1.5, 1 + (wave - 1) * 0.05);
  const fireScale = 1 + (wave - 1) * 0.12;
  const d = new Duck(scene, speedScale, fireScale, pos, variant, minR, maxR);
  // the boss gets much tankier the deeper you are, so a maxed loadout + big
  // bankroll still has to work for the kill instead of melting it instantly
  if (variant === 'bossAlbatross') {
    const mult = 1 + Math.max(0, wave - 20) * 0.15; // 20:x1 25:x1.75 30:x2.5 35:x3.25
    d.hp = Math.round(d.maxHp * mult);
    d.maxHp = d.hp;
  }
  d.group.userData.duck = d;
  ducks.push(d);
  return d;
}

// Call out whatever is new or headlining this wave, so every level lands with
// its own identity rather than blurring into the last one.
function announceWave(roster) {
  if (roster.includes('bossAlbatross')) {
    showBanner('TUMMY TROUBLES', PAL.red, 6);
    sfx.honk();
  } else if (wave === 21) {
    showBanner('ALBATROSS', PAL.red);
    sfx.screech();
  } else if (wave === 3) {
    showBanner('GEESE INCOMING', PAL.red);
    sfx.honk();
  } else if (wave === 5) {
    showBanner('ARMORED DUCKS', PAL.orange);
  } else if (NEW_WEAPON_WAVES[wave]) {
    showBanner(NEW_WEAPON_WAVES[wave], PAL.green, 6);
  }
}

// levels where the shop opens up a new toy - worth shouting about
const NEW_WEAPON_WAVES = {
  4: 'SHOP MACHINE GUN',
  6: 'SHOP SNIPER RIFLE',
  7: 'SHOP FLAMETHROWER',
  9: 'SHOP FLAK CANNON',
  11: 'SHOP SHARK LAUNCHER',
};

// One bird peels off the queue at a time, from a random bearing on a wide ring
// centred on wherever the player is standing right now.
function updateSpawning(dt) {
  if (!waveQueue.length) return;
  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  spawnEnemy(waveQueue.shift());
  // later waves send them in faster, and sometimes two at once
  const squeeze = Math.max(0.45, 1 - (wave - 1) * 0.03);
  spawnTimer = (SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)) * squeeze;
  if (wave >= 8 && waveQueue.length && Math.random() < 0.35) spawnEnemy(waveQueue.shift());
}

let bannerTimeout = null;
function showBanner(text, color, scale = 8) {
  el.banner.innerHTML = '';
  el.banner.appendChild(pixelTextCanvas(text, scale, color));
  el.banner.classList.remove('hidden');
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.banner.classList.add('hidden'), 2600);
}

function gameOver() {
  state = 'gameover';
  grappling = false;
  rope.visible = false;
  sfx.gameOver();
  const hs = Math.max(score, Number(localStorage.getItem(HS_KEY) || 0));
  localStorage.setItem(HS_KEY, String(hs));
  el.finalScore.textContent = `FINAL SCORE ${score}`;
  el.highScore.textContent = `HIGH SCORE ${hs}`;
  el.hud.classList.add('hidden');
  el.shop.classList.add('hidden');
  el.gameover.classList.remove('hidden');
  document.exitPointerLock();
}

// ---------- combat ----------
function duckFromObject(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.duck) return o.userData.duck;
    o = o.parent;
  }
  return null;
}

function aimRaycaster(range) {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = range;
  return raycaster;
}

function aliveEnemies() {
  return ducks.filter((d) => d.alive && !d.ally);
}

// scoped in = sniper equipped, SHIFT held, and actually in play
function isScoped() {
  return state === 'playing' && weaponId === 'sniper' && scoping;
}

// points/cash default to the duck's own values so tougher variants pay more
function killDuck(duck, points = duck.cfg.points.body, cash = duck.cfg.bounty) {
  feathers.burst(duck.group.position, duck.cfg.feathers);
  addScore(points, duck.group.position);
  money += cash;
}

// ---- game feel: the single hook every landed player shot flows through ----
function addShake(a) { shake = Math.min(SHAKE_MAX, shake + a * motionScale()); }

const COMBO_LABELS = { 2: 'DOUBLE!', 3: 'TRIPLE!', 4: 'QUAD!', 5: 'PENTA!' };
function bumpCombo(duck) {
  comboCount++;
  comboTimer = COMBO_WINDOW;
  sfx.combo(comboCount);
  if (comboCount >= 2) {
    const label = comboCount >= 6 ? 'RAMPAGE!' : COMBO_LABELS[comboCount];
    showComboPopup(label);
  }
}

// registerHit is called for EVERY connecting player shot. It plays the right
// confirm sound, pops the hitmarker, flashes the duck, shakes the camera, and
// drops a contact-point particle puff. killDuck still handles score/cash/the big
// death burst, so kills don't double-spawn feathers here.
function registerHit(duck, { point = null, headshot = false, killed = false } = {}) {
  if (headshot) sfx.headshot();
  else if (!killed && audioFrame !== frameCount) { sfx.hitConfirm(); audioFrame = frameCount; }
  if (killed) {
    sfx.kill();
    bumpCombo(duck);
    addShake(SHAKE_KILL);
  } else {
    feathers.burst(point || duck.group.position, headshot ? 8 : 5);
    addShake(SHAKE_HIT);
  }
  if (duck.flash) duck.flash(headshot);
  spawnHitmarker(headshot, killed);
}

function shoot() {
  const w = weapons[weaponId];
  if (w.stream) return; // the flamethrower burns from the held-fire path instead
  if (w.cd > 0) return;
  if (MAG_WEAPONS.includes(weaponId) && (w.reload > 0 || w.ammo <= 0)) return;
  if (weaponId === 'bread' && w.pieces <= 0) { sfx.deny(); return; }
  w.cd = w.rate;
  if (weaponId === 'gun') fireGun();
  else if (weaponId === 'shotgun') fireShotgun();
  else if (weaponId === 'knife') fireKnife();
  else if (weaponId === 'flak') fireFlak();
  else if (weaponId === 'mg') fireMG();
  else if (weaponId === 'sniper') fireSniper();
  else if (weaponId === 'shark') fireShark();
  else fireBread();
}

// Scoped rifle. Hits hard enough to drop most things in one shot and always
// instakills on a headshot, but the fire rate and tiny magazine keep it honest.
function fireSniper() {
  const w = weapons.sniper;
  w.ammo--;
  sfx.sniper();
  muzzle.visible = true;
  muzzleTimer = 0.08;
  kickPitch = (scoping ? 0.09 : 0.14) * motionScale(); // hip fire kicks harder

  // Scoped shots go exactly where you point. From the hip the barrel wanders,
  // so a no-scope is a genuine gamble rather than a free headshot.
  let ray;
  if (scoping) {
    ray = aimRaycaster(400);
  } else {
    const s = w.hipSpread;
    raycaster.setFromCamera(
      new THREE.Vector2((Math.random() - 0.5) * s, (Math.random() - 0.5) * s),
      camera
    );
    raycaster.far = 400;
    ray = raycaster;
  }
  const hits = ray.intersectObjects(aliveEnemies().map((d) => d.group), true);
  const worldHits = ray.intersectObjects(grappleTargets, false);
  const wallDist = worldHits.length ? worldHits[0].distance : Infinity;
  const blocked = hits.length && hits[0].distance >= wallDist;
  if (hits.length && !blocked) {
    const duck = duckFromObject(hits[0].object);
    if (duck && duck.alive) {
      const headshot = hits[0].object.userData.part === 'head';
      const at = duck.group.position.clone();
      const dead = duck.hit(headshot ? 999 : w.dmg);
      if (dead) {
        // landing a headshot from the hip is the hardest shot in the game
        const noScope = headshot && !scoping;
        const points = headshot ? duck.cfg.points.head * (noScope ? 3 : 2) : duck.cfg.points.body;
        killDuck(duck, points, duck.cfg.bounty * (noScope ? 3 : 2));
        if (noScope) {
          showPopup('NO SCOPE!', at);
          sfx.flyingV();
        }
      }
      registerHit(duck, { point: hits[0].point, headshot, killed: dead });
    }
  }
  // bright, longer-lived tracer for the rifle
  const sEnd = hits.length && !blocked ? hits[0].point
    : worldHits.length ? worldHits[0].point : rayEnd(ray, 400);
  spawnTracer(muzzleWorld(), sEnd, TRACER_LIFE * 1.8);
  if (w.ammo <= 0) {
    w.reload = w.reloadTime;
    sfx.reload();
  }
}

// Lobs a shark. Everything interesting happens in SharkManager once it lands
// on something: latch, thrash, bisect.
function fireShark() {
  const w = weapons.shark;
  w.ammo--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y += 0.16; // launch it *up* into the flock
  dir.normalize();
  const origin = pos.clone().addScaledVector(dir, 1.4);
  origin.y -= 0.2;
  sharks.launch(origin, dir);
  kickPitch = 0.07;
  if (w.ammo <= 0) {
    w.reload = w.reloadTime;
    sfx.reload();
  }
}

// Held-fire tick: the full-auto weapons keep going as long as the button is
// down. Called every frame from the main loop.
function updateHeldFire(dt) {
  const w = weapons[weaponId];
  const firing = mouseDown && state === 'playing';
  if (weaponId === 'flame') {
    if (firing && w.fuel > 0) fireFlame(dt);
    else w.fuel = Math.min(w.maxFuel, w.fuel + w.regen * dt);
    return;
  }
  if (firing && w.auto) shoot();
}

function fireMG() {
  const w = weapons.mg;
  w.ammo--;
  sfx.machineGun();
  muzzle.visible = true;
  muzzleTimer = 0.05;
  kickPitch = Math.min(0.12, kickPitch + KICK_MG * motionScale()); // recoil climbs while held

  // sprayed shots: the aim ray wanders a little each round
  raycaster.setFromCamera(
    new THREE.Vector2((Math.random() - 0.5) * w.spread, (Math.random() - 0.5) * w.spread),
    camera
  );
  raycaster.far = 300;
  const hits = raycaster.intersectObjects(aliveEnemies().map((d) => d.group), true);
  const worldHits = raycaster.intersectObjects(grappleTargets, false);
  const wallDist = worldHits.length ? worldHits[0].distance : Infinity;
  const blocked = hits.length && hits[0].distance >= wallDist;
  if (hits.length && !blocked) {
    const duck = duckFromObject(hits[0].object);
    if (duck && duck.alive) {
      // headshots hurt but never instakill - that's the trade for full auto
      const headshot = hits[0].object.userData.part === 'head';
      const dead = duck.hit(headshot ? 2 : 1);
      if (dead) killDuck(duck, headshot ? duck.cfg.points.head : duck.cfg.points.body);
      registerHit(duck, { point: hits[0].point, headshot, killed: dead });
    }
  }
  const end = hits.length && !blocked ? hits[0].point
    : worldHits.length ? worldHits[0].point : rayEnd(raycaster, 300);
  spawnTracer(muzzleWorld(), end);
  if (w.ammo <= 0) {
    w.reload = w.reloadTime;
    sfx.reload();
  }
}

// Short-range cone that burns everything in front of you for as long as the
// fuel holds. Damage is continuous (dps * dt), so it melts clustered flocks.
function fireFlame(dt) {
  const w = weapons.flame;
  w.fuel = Math.max(0, w.fuel - w.burn * dt);

  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);
  const origin = pos.clone().addScaledVector(aim, 1.0);
  origin.y -= 0.25;

  if (Math.random() < dt * 60) sfx.flame();
  for (let i = 0; i < 2; i++) flames.puff(origin, aim, w.range);

  for (const d of aliveEnemies()) {
    const to = d.group.position.clone().sub(pos);
    const dist = to.length();
    if (dist > w.range) continue;
    to.normalize();
    if (to.dot(aim) < Math.cos(w.arc)) continue;
    raycaster.set(pos, to);
    raycaster.far = dist;
    if (raycaster.intersectObjects(grappleTargets, false).length) continue;
    const dead = d.hit(w.dps * dt);
    if (dead) { killDuck(d); registerHit(d, { point: d.group.position, killed: true }); }
    else if (audioFrame !== frameCount) registerHit(d, { point: d.group.position });
  }
}

function fireGun() {
  sfx.blaster();
  muzzle.visible = true;
  muzzleTimer = 0.06;
  kickPitch = KICK_GUN * motionScale();

  const ray = aimRaycaster(300);
  const hits = ray.intersectObjects(aliveEnemies().map((d) => d.group), true);
  // don't shoot through walls/platforms
  const worldHits = ray.intersectObjects(grappleTargets, false);
  const wallDist = worldHits.length ? worldHits[0].distance : Infinity;
  const blocked = hits.length && hits[0].distance >= wallDist;
  if (hits.length && !blocked) {
    const duck = duckFromObject(hits[0].object);
    if (duck && duck.alive) {
      // headshot instakills a plain duck; armored heads (headDmg 3) just take
      // extra damage, so the heavies soak several shots. Body always deals 1.
      const headshot = hits[0].object.userData.part === 'head';
      const dead = duck.hit(headshot ? duck.cfg.headDmg : 1);
      if (dead) killDuck(duck, headshot ? duck.cfg.points.head : duck.cfg.points.body);
      registerHit(duck, { point: hits[0].point, headshot, killed: dead });
    }
  }
  // tracer: to the enemy/wall we hit, else out to max range
  const end = hits.length && !blocked ? hits[0].point
    : worldHits.length ? worldHits[0].point : rayEnd(ray, 300);
  spawnTracer(muzzleWorld(), end);
}

function fireFlak() {
  const w = weapons.flak;
  w.ammo--;
  sfx.flak();
  kickPitch = KICK_FLAK * motionScale();
  addShake(SHAKE_HIT);
  el.flakGun.classList.add('firing');
  clearTimeout(flakFireTimer);
  flakFireTimer = setTimeout(() => el.flakGun.classList.remove('firing'), 90);

  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);
  const origin = pos.clone().addScaledVector(aim, 1.0);
  origin.y -= 0.2;
  for (let i = 0; i < w.shells; i++) {
    const dir = aim.clone();
    dir.x += (Math.random() - 0.5) * w.spread;
    dir.y += (Math.random() - 0.5) * w.spread;
    dir.z += (Math.random() - 0.5) * w.spread;
    dir.normalize();
    flak.fire(origin, dir, w.dmg, w.radius);
  }
  if (w.ammo <= 0) {
    w.reload = w.reloadTime;
    sfx.reload();
  }
}
let flakFireTimer = null;

function fireShotgun() {
  const w = weapons.shotgun;
  w.ammo--;
  sfx.shotgun();
  muzzle.visible = true;
  muzzleTimer = 0.09;
  kickPitch = KICK_SHOTGUN * motionScale();

  // Cone blast: hits everything within range and w.arc radians of the aim.
  // The wide arc is the whole point - it's what makes this a shotgun rather
  // than a slow rifle, so it should catch several birds out of a packed flock.
  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);
  const cosArc = Math.cos(w.arc);
  for (const d of aliveEnemies()) {
    const to = d.group.position.clone().sub(pos);
    const dist = to.length();
    if (dist > w.range) continue;
    to.normalize();
    if (to.dot(aim) < cosArc) continue;
    // blocked by world geometry?
    raycaster.set(pos, to);
    raycaster.far = dist;
    if (raycaster.intersectObjects(grappleTargets, false).length) continue;
    // flat damage inside the cone - the short range is the balancing constraint,
    // and falloff just meant the typical ~19m engagement couldn't drop an
    // armored duck, which is exactly the case the shotgun exists for
    const dead = d.hit(w.dmg);
    if (dead) killDuck(d);
    registerHit(d, { point: d.group.position, killed: dead });
  }
  if (w.ammo <= 0) {
    w.reload = w.reloadTime;
    sfx.reload();
  }
}

function fireKnife() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = pos.clone().addScaledVector(dir, 0.9);
  origin.y -= 0.15;
  knives.throw(origin, dir);
}

function fireBread() {
  const w = weapons.bread;
  w.pieces--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y += 0.08; // slight loft to counter the arc
  dir.normalize();
  const origin = pos.clone().addScaledVector(dir, 0.9);
  origin.y -= 0.15;
  bread.throw(origin, dir);
}

function grapple() {
  if (grappling) { releaseGrapple(); return; }
  if (grappleCd > 0) return;

  const ray = aimRaycaster(GRAPPLE_RANGE);
  const duckHits = ray.intersectObjects(aliveEnemies().map((d) => d.group), true);
  const worldHits = ray.intersectObjects(grappleTargets, false);
  const duckDist = duckHits.length ? duckHits[0].distance : Infinity;
  const worldDist = worldHits.length ? worldHits[0].distance : Infinity;

  if (duckDist === Infinity && worldDist === Infinity) {
    grappleCd = 0.5; // whiffed
    sfx.grapple();
    return;
  }

  sfx.grapple();
  if (duckDist < worldDist) {
    // hook a duck: instant kill, hook snaps back
    const duck = duckFromObject(duckHits[0].object);
    if (duck && duck.alive) {
      sfx.grappleHit();
      // instant-kills normal foes; the boss caps it and just takes a chunk
      const dead = duck.hit(999);
      if (dead) killDuck(duck, duck.cfg.points.head);
      registerHit(duck, { point: duck.group.position, killed: dead });
    }
    grappleCd = GRAPPLE_COOLDOWN;
  } else {
    grappling = true;
    const hit = worldHits[0];
    grappleAnchor.copy(hit.point);
    // hooked near the top edge of a platform/tree/barn: snap the anchor
    // onto the lip so the zip lands you on top instead of against the face
    const hitBox = new THREE.Box3().setFromObject(hit.object);
    if (hitBox.max.y - hit.point.y < 3 && hitBox.max.y > pos.y - 1 && hitBox.max.y > 1) {
      const center = hitBox.getCenter(new THREE.Vector3());
      grappleAnchor.y = hitBox.max.y + 1.5; // eye height above the lip so you land on top
      const toCenter = new THREE.Vector3(center.x - grappleAnchor.x, 0, center.z - grappleAnchor.z);
      const len = toCenter.length();
      if (len > 0) grappleAnchor.addScaledVector(toCenter.normalize(), Math.min(1.4, len));
    }
    rope.visible = true;
    vy = Math.max(vy, 4); // slight arc: initial upward pop
  }
}

function releaseGrapple() {
  if (!grappling) return;
  grappling = false;
  grappleStuck = 0;
  rope.visible = false;
  grappleCd = GRAPPLE_COOLDOWN;
  // keep some momentum on release
  const dir = grappleAnchor.clone().sub(pos).normalize();
  impulse.set(dir.x, 0, dir.z).multiplyScalar(GRAPPLE_SPEED * 0.35);
  vy = Math.max(vy, dir.y * GRAPPLE_SPEED * 0.3);
}

function lunge() {
  if (lungeCd > 0 || grappling) return;
  lungeCd = LUNGE_COOLDOWN;
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // camera backward on XZ
  impulse.add(back.multiplyScalar(22));
  vy = Math.max(vy, 3);
  kickPitch = 0.12; // small camera kick
  sfx.lunge();
}

// ---------- the flying V ----------
// With three or more recruited ducks the squad occasionally forms up into a V
// and strafes straight through the flock, obliterating everything in its path.
// Triggered on a cooldown plus a dice roll, so it stays a moment rather than a
// rotation you can plan around.
function updateFlyingV(dt, enemies) {
  if (vActive) {
    vTimer -= dt;
    vPos.addScaledVector(vDir, V_SPEED * dt);

    // hold the formation: point of the V leads, the rest trail back and out
    vSquad = vSquad.filter((d) => d.alive);
    vSquad.forEach((d, i) => {
      const rank = Math.floor((i + 1) / 2);
      const side = i % 2 === 0 ? 1 : -1;
      d.vTarget = vPos.clone()
        .addScaledVector(vDir, -rank * 2.6)
        .addScaledVector(vRight, side * rank * 2.2);
      d.vDir = vDir;
    });

    // everything caught in the wake is obliterated. Each bird is struck only
    // once per run, so the damage-capped boss takes a chunk instead of being
    // shredded by a hit every frame it sits inside the radius.
    for (const e of enemies) {
      if (!e.alive || vHitSet.has(e)) continue;
      if (e.group.position.distanceTo(vPos) < V_KILL_RADIUS) {
        vHitSet.add(e);
        if (e.hit(9999)) {
          killDuck(e, e.cfg.points.head, e.cfg.bounty);
          bumpCombo(e); addShake(SHAKE_HIT); // the V mows a streak through the flock
        } else { feathers.burst(e.group.position, 10); if (e.flash) e.flash(false); }
      }
    }

    if (vTimer <= 0 || !vSquad.length) endFlyingV();
    return;
  }

  vCooldown -= dt;
  if (vCooldown > 0) return;
  const allies = ducks.filter((d) => d.alive && d.ally);
  if (allies.length < V_MIN_ALLIES || enemies.length < 2) {
    vCooldown = 1.5; // squad or targets not ready; check again shortly
    return;
  }
  if (Math.random() > 0.35) { // "occasionally"
    vCooldown = 4;
    return;
  }
  startFlyingV(allies, enemies);
}

function startFlyingV(allies, enemies) {
  // aim the run through the middle of the flock
  const centroid = new THREE.Vector3();
  for (const e of enemies) centroid.add(e.group.position);
  centroid.divideScalar(enemies.length);

  vDir.copy(centroid).sub(pos);
  vDir.y *= 0.35; // keep the run fairly flat so it reads well from the ground
  if (vDir.lengthSq() < 0.001) vDir.set(0, 0, -1);
  vDir.normalize();
  vRight.crossVectors(vDir, new THREE.Vector3(0, 1, 0)).normalize();

  // start the point of the V behind the player and sweep it forward
  vPos.copy(pos).addScaledVector(vDir, -18);
  vPos.y = Math.max(pos.y + 4, centroid.y);

  vSquad = allies.slice(0, 7);
  for (const d of vSquad) d.state = 'vform';

  vHitSet.clear();
  vActive = true;
  vTimer = V_DURATION;
  sfx.flyingV();
  showBanner('FLYING V', PAL.yellow, 6);
}

function endFlyingV() {
  for (const d of vSquad) {
    if (!d.alive) continue;
    d.state = 'fly';
    d.stateTimer = 1 + Math.random();
    d.waypoint = pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 30, 6 + Math.random() * 10, (Math.random() - 0.5) * 30
    ));
    d.vTarget = null;
  }
  vSquad = [];
  vActive = false;
  vCooldown = 22 + Math.random() * 14;
}

// floating text at a world position (score, bread-recruit progress)
function showPopup(text, worldPos) {
  const v = worldPos.clone().project(camera);
  if (v.z >= 1) return;
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  popup.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
  popup.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  el.popups.appendChild(popup);
  requestAnimationFrame(() => {
    popup.style.transform = 'translateY(-50px)';
    popup.style.opacity = '0';
  });
  setTimeout(() => popup.remove(), 900);
}

// big center-screen streak text: DOUBLE! / TRIPLE! / RAMPAGE!
function showComboPopup(text) {
  const p = document.createElement('div');
  p.className = 'combo-popup';
  p.textContent = text;
  el.popups.appendChild(p);
  requestAnimationFrame(() => p.classList.add('show'));
  setTimeout(() => p.remove(), 850);
}

// flash the crosshair hitmarker; distinct colors for headshot / kill
function spawnHitmarker(headshot, killed) {
  const h = el.hitmarker;
  if (!h) return;
  h.className = headshot ? 'hs' : killed ? 'kill' : '';
  h.style.animation = 'none';
  void h.offsetWidth; // reflow so the keyframe restarts on rapid re-hits
  h.classList.add('show');
}

function addScore(points, worldPos) {
  score += points;
  showPopup(`+${points}`, worldPos);
}

function damagePlayer(amount) {
  hp = Math.min(maxHp, hp - amount);
  sfx.hit();
  el.flash.style.transition = 'none';
  el.flash.style.opacity = '0.5';
  requestAnimationFrame(() => {
    el.flash.style.transition = 'opacity 0.35s';
    el.flash.style.opacity = '0';
  });
  if (hp <= 0) {
    hp = 0;
    gameOver();
  }
}

// ---------- player physics ----------
function groundHeightAt(x, z, feetY) {
  let ground = 0;
  for (const s of solids) {
    if (
      x > s.min.x - PLAYER_RADIUS && x < s.max.x + PLAYER_RADIUS &&
      z > s.min.z - PLAYER_RADIUS && z < s.max.z + PLAYER_RADIUS &&
      s.max.y <= feetY + 0.4 && s.max.y > ground
    ) {
      ground = s.max.y;
    }
  }
  return ground;
}

function pushOutOfSolids() {
  const feet = pos.y - EYE;
  const head = pos.y + 0.2;
  for (const s of solids) {
    if (feet > s.max.y - 0.25 || head < s.min.y) continue; // above the top or below the bottom
    const minX = s.min.x - PLAYER_RADIUS, maxX = s.max.x + PLAYER_RADIUS;
    const minZ = s.min.z - PLAYER_RADIUS, maxZ = s.max.z + PLAYER_RADIUS;
    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
    const dxLeft = pos.x - minX, dxRight = maxX - pos.x;
    const dzNear = pos.z - minZ, dzFar = maxZ - pos.z;
    const minPen = Math.min(dxLeft, dxRight, dzNear, dzFar);
    if (minPen === dxLeft) pos.x = minX;
    else if (minPen === dxRight) pos.x = maxX;
    else if (minPen === dzNear) pos.z = minZ;
    else pos.z = maxZ;
  }
}

function updatePlayer(dt) {
  // grapple pull overrides normal movement
  if (grappling) {
    const distBefore = grappleAnchor.distanceTo(pos);
    if (distBefore < 1.8) {
      releaseGrapple();
    } else {
      const to = grappleAnchor.clone().sub(pos).normalize();
      pos.addScaledVector(to, GRAPPLE_SPEED * dt);
      pos.y += Math.min(1, distBefore / 25) * 3.5 * dt; // slight upward arc while zipping
      vy = 0;
    }
    pushOutOfSolids();
    clampVertical();
    if (grappling) {
      // release if geometry is blocking progress (e.g. snagged on a ledge)
      const progress = distBefore - grappleAnchor.distanceTo(pos);
      grappleStuck = progress < GRAPPLE_SPEED * dt * 0.3 ? grappleStuck + dt : 0;
      if (grappleStuck > 0.35) releaseGrapple();
    }
    return;
  }

  // WASD movement relative to yaw
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys['KeyW']) move.add(forward);
  if (keys['KeyS']) move.sub(forward);
  if (keys['KeyD']) move.add(right);
  if (keys['KeyA']) move.sub(right);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED);

  pos.addScaledVector(move, dt);
  pos.addScaledVector(impulse, dt);
  impulse.multiplyScalar(Math.max(0, 1 - 7 * dt));

  // gravity + jumping
  const feetBefore = pos.y - EYE;
  const groundY = groundHeightAt(pos.x, pos.z, feetBefore);
  vy -= GRAVITY * dt;
  pos.y += vy * dt;
  const feet = pos.y - EYE;
  if (feet <= groundY && vy <= 0) {
    pos.y = groundY + EYE;
    vy = 0;
    grounded = true;
  } else {
    grounded = false;
  }
  if (grounded && keys['Space']) {
    vy = JUMP_SPEED;
    grounded = false;
    sfx.jump();
  }

  pushOutOfSolids();
  clampVertical();
}

function clampVertical() {
  pos.y = Math.max(0.6, Math.min(pos.y, 80));
}

// ---------- HUD ----------
function updateHUD() {
  el.healthFill.style.width = `${(hp / maxHp) * 100}%`;
  const hpFrac = hp / maxHp;
  el.healthFill.style.background = hpFrac > 0.5 ? '#00a800' : hpFrac > 0.25 ? '#f8b800' : '#d82800';
  el.grappleFill.style.width = `${(1 - Math.min(1, grappleCd / GRAPPLE_COOLDOWN)) * 100}%`;
  el.lungeFill.style.width = `${(1 - Math.min(1, lungeCd / LUNGE_COOLDOWN)) * 100}%`;
  el.score.textContent = `SCORE ${score}`;
  el.money.textContent = `$${money}`;
  el.wave.textContent = `WAVE ${wave}`;
  // incoming birds still queued to fly in are counted alongside the live ones
  const left = aliveEnemies().length;
  el.ducksLeft.textContent = waveQueue.length ? `BIRDS ${left} (+${waveQueue.length})` : `BIRDS ${left}`;
  const allyCount = ducks.filter((d) => d.alive && d.ally).length;
  el.allies.textContent = allyCount >= V_MIN_ALLIES ? `ALLIES ${allyCount} V!` : `ALLIES ${allyCount}`;

  const w = weapons[weaponId];
  let wText = w.name;
  if (MAG_WEAPONS.includes(weaponId)) wText += w.reload > 0 ? ' ...' : ` ${w.ammo}/${w.mag}`;
  if (weaponId === 'bread') wText += ` ${w.pieces}`;
  if (weaponId === 'flame') wText += ` ${Math.round(w.fuel)}%`;
  // teach the scope control while it's un-used, then confirm it while held
  if (weaponId === 'sniper') wText += scoping ? ' [SCOPED]' : isTouchDevice ? '' : ' [SHIFT]';
  el.weapon.textContent = wText;

  // the AA cannon gets its four-barrel viewmodel and a ring reticle; the
  // sniper gets the scope overlay only while actually scoped in.
  const flakEquipped = weaponId === 'flak';
  const scoped = isScoped();
  el.flakGun.classList.toggle('hidden', !flakEquipped);
  el.aaReticle.classList.toggle('hidden', !flakEquipped);
  el.scope.classList.toggle('hidden', !scoped);
  el.crosshair.classList.toggle('hidden', flakEquipped || scoped);

  // boss health bar: track the nearest living boss, and show how many remain
  const bosses = ducks.filter((d) => d.alive && d.cfg.boss && !d.ally);
  if (bosses.length) {
    const boss = bosses[0];
    el.bossBar.classList.remove('hidden');
    el.bossName.textContent = bosses.length > 1 ? `${boss.cfg.name} x${bosses.length}` : boss.cfg.name;
    el.bossFill.style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
  } else {
    el.bossBar.classList.add('hidden');
  }
}

// ---------- debug / automated-playtest hook ----------
window.__fowl = {
  get state() { return state; },
  get hp() { return hp; },
  get score() { return score; },
  get wave() { return wave; },
  get pos() { return { x: pos.x, y: pos.y, z: pos.z }; },
  get ducks() {
    return aliveEnemies().map((d) => ({
      x: d.group.position.x, y: d.group.position.y, z: d.group.position.z,
    }));
  },
  get grappling() { return grappling; },
  get weapon() { return weaponId; },
  get money() { return money; },
  get allies() { return ducks.filter((d) => d.alive && d.ally).length; },
  weapons,
  aimAt(v) {
    const d = new THREE.Vector3(v.x, v.y, v.z).sub(pos);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.asin(d.y / d.length());
    camera.position.copy(pos);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(yaw);
    camera.rotateX(pitch);
    camera.updateMatrixWorld(true);
  },
  shoot, grapple, lunge,
  buy: buyItem,
  nextWave: closeShop,
  setWeapon(id) { if (weapons[id] && weapons[id].unlocked) weaponId = id; },
  damage: damagePlayer,
  start: startGame,
  // test helpers
  duckTypes() { return aliveEnemies().map((d) => d.variant); },
  roster: waveRoster,
  bombCount() { return bombs.list.length; },
  boss() {
    const b = ducks.find((d) => d.alive && d.cfg.boss && !d.ally);
    if (!b) return null;
    return { hp: b.hp / b.maxHp, x: b.group.position.x, y: b.group.position.y, z: b.group.position.z };
  },
  forceWave(n) {
    wave = n;
    waveState = 'active';
    ducks = ducks.filter((d) => d.alive);
    spawnWave();
  },
  unlockAll() { for (const w of Object.values(weapons)) w.unlocked = true; },
  // spawn/flying-V test helpers
  get queued() { return waveQueue.length; },
  get vActive() { return vActive; },
  drainQueue() { while (waveQueue.length) spawnEnemy(waveQueue.shift()); },
  forceV() {
    const allies = ducks.filter((d) => d.alive && d.ally);
    const enemies = aliveEnemies();
    if (allies.length < V_MIN_ALLIES || !enemies.length) return false;
    startFlyingV(allies, enemies);
    return true;
  },
  recruitNearest(n = 3) {
    for (const d of aliveEnemies().slice(0, n)) d.recruit();
  },
  setFire(down) { mouseDown = !!down; },
  setScope(on) { setScope(on); },
  get scoped() { return isScoped(); },
  sharkState() { return sharks.list.map((s) => s.state).join(',') || '-'; },
  grabbed() { return ducks.filter((d) => d.alive && d.state === 'grabbed').length; },
  get fov() { return camera.fov; },
};

// ---------- touch controls (no-op on desktop) ----------
const mobile = initMobileControls({
  keys,
  look(dx, dy) {
    yaw -= dx;
    pitch -= dy;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  },
  shoot,
  grapple,
  lunge,
  setFire(down) { mouseDown = !!down; }, // drives the full-auto / stream weapons
  setScope(on) { setScope(on); },        // touch equivalent of holding SHIFT
  setWeapon(id) {
    if (state === 'playing' && weapons[id] && weapons[id].unlocked && weaponId !== id) {
      weaponId = id;
      sfx.reload();
    }
  },
  togglePause,
});

if (isTouchDevice) {
  // Shop: tap an item to buy it, plus an explicit NEXT WAVE button.
  el.shopList.addEventListener('click', (e) => {
    const opt = e.target.closest('.shop-option');
    if (opt) buyItem(Number(opt.dataset.index));
  });
  const nextBtn = document.createElement('button');
  nextBtn.id = 'shop-next';
  nextBtn.textContent = 'NEXT WAVE';
  nextBtn.addEventListener('click', () => { if (state === 'shop') closeShop(); });
  el.shop.appendChild(nextBtn);

  // Game over: tap anywhere to restart.
  el.gameover.addEventListener('click', () => { if (state === 'gameover') startGame(); });
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  frameCount++; // used to throttle the hit "thock" to once per frame

  if (state === 'playing') {
    grappleCd = Math.max(0, grappleCd - dt);
    lungeCd = Math.max(0, lungeCd - dt);
    for (const w of Object.values(weapons)) w.cd = Math.max(0, w.cd - dt);
    for (const wid of MAG_WEAPONS) {
      const w = weapons[wid];
      if (w.reload > 0) {
        w.reload -= dt;
        if (w.reload <= 0) {
          w.reload = 0;
          w.ammo = w.mag;
        }
      }
    }

    updatePlayer(dt);
    updateWorld(pos);

    // wave logic
    if (waveState === 'banner') {
      waveTimer -= dt;
      if (waveTimer <= 0) {
        waveState = 'active';
        spawnWave();
        sfx.fanfare();
      }
    } else if (waveState === 'active') {
      updateSpawning(dt);
    }

    const enemies = aliveEnemies();
    updateHeldFire(dt);
    updateFlyingV(dt, enemies);
    const duckCtx = {
      fireEgg: (p, dir) => projectiles.spawn(p, dir, 10 + wave * 0.5),
      dropBomb: (p) => bombs.drop(p),
      fireAllyEgg: (p, dir) => allyEggs.spawn(p, dir),
      enemies,
    };
    for (const d of ducks) if (d.alive) d.update(dt, pos, duckCtx);

    // the wave is only over once the queue is empty AND the sky is clear
    if (waveState === 'active' && enemies.length === 0 && waveQueue.length === 0) {
      addScore(500, pos.clone().add(new THREE.Vector3(0, 2, -4)));
      sfx.waveClear();
      if (vActive) endFlyingV();
      openShop();
    }

    const hits = projectiles.update(dt, pos);
    for (let i = 0; i < hits; i++) damagePlayer(10);

    const bombDamage = bombs.update(dt, pos);
    if (bombDamage > 0) { damagePlayer(bombDamage); addShake(SHAKE_EXPLODE); }

    knives.update(dt, enemies, (duck) => {
      // one-shots normal foes; the boss caps it and just takes a chunk
      const dead = duck.hit(999);
      if (dead) killDuck(duck, duck.cfg.points.head, duck.cfg.bounty * 2); // skill shot: double cash
      registerHit(duck, { point: duck.group.position, killed: dead });
    });

    bread.update(dt, enemies, (duck) => {
      if (duck.cfg.boss) return; // the boss can't be bribed with bread
      duck.breadHits++;
      const need = duck.cfg.breadToRecruit;
      if (duck.breadHits >= need) {
        duck.recruit();
        addScore(duck.cfg.bounty * 10, duck.group.position);
      } else {
        // show how much more convincing this one needs
        showPopup(`${duck.breadHits}/${need}`, duck.group.position);
      }
    });

    allyEggs.update(dt, enemies, (duck) => killDuck(duck, duck.cfg.points.body));

    // flak/shark keep their own signature booms; add the streak + hitmarker + shake
    flak.update(dt, enemies, (duck) => {
      killDuck(duck, duck.cfg.flakPoints);
      bumpCombo(duck); addShake(SHAKE_KILL); spawnHitmarker(false, true);
    });

    // bitten clean in half: the most emphatic way to kill a bird, paid as such
    sharks.update(dt, enemies, (duck) => {
      killDuck(duck, duck.cfg.points.head * 2, duck.cfg.bounty * 2);
      bumpCombo(duck); addShake(SHAKE_KILL); spawnHitmarker(false, true);
    });

    feathers.update(dt);
    flames.update(dt);
    updateTracers(dt);

    if (muzzleTimer > 0) {
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) muzzle.visible = false;
    }

    // camera kick recovery
    kickPitch = Math.max(0, kickPitch - dt * 0.6);

    // combo streak expires if you don't keep the kills coming
    if (comboTimer > 0) {
      comboTimer = Math.max(0, comboTimer - dt);
      if (comboTimer === 0) comboCount = 0;
    }

    updateHUD();
  } else if (state === 'paused' || state === 'gameover' || state === 'shop' || state === 'confirm') {
    mouseDown = false; // don't hold the trigger through a pause or the shop
    feathers.update(dt);
    flames.update(dt);
    sharks.update(dt, [], () => {}); // let any airborne shark finish its arc
    bombs.update(dt, pos);
    flak.update(dt, [], () => {}); // let any lingering airbursts fizzle out
    el.flakGun.classList.add('hidden');
    el.aaReticle.classList.add('hidden');
    el.scope.classList.add('hidden');
    el.bossBar.classList.add('hidden');
  }

  // scope zoom: only while SHIFT is held with the sniper out
  const wantFov = isScoped() ? weapons.sniper.fov : BASE_FOV;
  if (camera.fov !== wantFov) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }

  // screen-shake decays every frame (runs even while paused so it settles)
  shake = Math.max(0, shake - dt * SHAKE_DECAY);

  // camera + rope
  camera.position.copy(pos);
  if (shake > 0.0001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.position.z += (Math.random() - 0.5) * shake;
  }
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw);
  camera.rotateX(pitch + kickPitch);

  if (rope.visible) {
    const start = new THREE.Vector3(0.35, -0.3, -0.6);
    camera.localToWorld(start);
    ropeGeo.setFromPoints([start, grappleAnchor]);
  }

  if (mobile) mobile.frame(state, weapons, weaponId);

  renderer.render(scene, camera);
}

tick();
