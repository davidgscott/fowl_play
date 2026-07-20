import * as THREE from 'three';
import { buildWorld, updateWorld, solids, grappleTargets } from './world.js';
import {
  Duck, ProjectileManager, BombManager, KnifeManager, BreadManager,
  AllyEggManager, FeatherManager,
} from './ducks.js';
import { initAudio, sfx } from './audio.js';
import { pixelTextCanvas, muzzleTexture, PAL } from './textures.js';

// ---------- renderer at low internal resolution, upscaled with CSS ----------
const INTERNAL_H = 270;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
document.getElementById('game').appendChild(renderer.domElement);

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
};

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
let kickPitch = 0; // camera kick from lunge

let grappleCd = 0, lungeCd = 0;
let grappling = false;
let grappleAnchor = new THREE.Vector3();
let grappleStuck = 0; // seconds without progress toward the anchor

let ducks = [];
let waveState = 'banner'; // banner | active
let waveTimer = 0;

const keys = {};
const projectiles = new ProjectileManager(scene);
const bombs = new BombManager(scene);
const knives = new KnifeManager(scene);
const bread = new BreadManager(scene);
const allyEggs = new AllyEggManager(scene);
const feathers = new FeatherManager(scene);
const raycaster = new THREE.Raycaster();

// ---------- weapons ----------
const weapons = {
  gun: { name: 'GUN', unlocked: true, rate: 0.25, cd: 0 },
  shotgun: { name: 'SHOTGUN', unlocked: false, rate: 0.7, cd: 0, range: 20, mag: 5, ammo: 5, reloadTime: 1.6, reload: 0 },
  knife: { name: 'KNIVES', unlocked: false, rate: 0.55, cd: 0 },
  bread: { name: 'BREAD', unlocked: true, rate: 0.4, cd: 0, pieces: 6 }, // 2 loaves x 3 pieces
};
const WEAPON_KEYS = { Digit1: 'gun', Digit2: 'shotgun', Digit3: 'knife', Digit4: 'bread' };
let weaponId = 'gun';

function resetWeapons() {
  Object.assign(weapons.gun, { unlocked: true, rate: 0.25, cd: 0 });
  Object.assign(weapons.shotgun, { unlocked: false, rate: 0.7, cd: 0, range: 20, mag: 5, ammo: 5, reload: 0 });
  Object.assign(weapons.knife, { unlocked: false, rate: 0.55, cd: 0 });
  Object.assign(weapons.bread, { rate: 0.4, cd: 0, pieces: 6 });
  weaponId = 'gun';
}

// ---------- shop (opens after each cleared wave; kills earn money) ----------
const MONEY_PER_KILL = 20;

const SHOP_ITEMS = [
  { id: 'bread', label: 'BREAD LOAF', desc: '3 PIECES - 3 HITS RECRUITS A DUCK', price: 40,
    avail: () => true,
    apply: () => { weapons.bread.pieces += 3; } },
  { id: 'unlock-knife', label: 'THROWING KNIVES', desc: 'PIERCES EVERYTHING IN ITS PATH - 2X CASH PER KILL', price: 80,
    avail: () => !weapons.knife.unlocked,
    apply: () => { weapons.knife.unlocked = true; } },
  { id: 'unlock-shotgun', label: 'SHOTGUN', desc: 'ONE-SHOT BLAST - SHORT RANGE - 5 ROUNDS', price: 120,
    avail: () => !weapons.shotgun.unlocked,
    apply: () => { weapons.shotgun.unlocked = true; } },
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
  { id: 'max-hp', label: 'MAX HP +25', desc: 'AND FULL HEAL', price: 60,
    avail: () => true,
    apply: () => { maxHp += 25; hp = maxHp; } },
];
let shopChoices = [];

function renderShop() {
  shopChoices = SHOP_ITEMS.filter((u) => u.avail());
  el.shopMoney.textContent = `$${money}`;
  el.shopList.innerHTML = '';
  shopChoices.forEach((u, i) => {
    const div = document.createElement('div');
    div.className = 'shop-option' + (money < u.price ? ' too-poor' : '');
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

// rope line for the grapple
const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xf8b800 }));
rope.visible = false;
rope.frustumCulled = false;
scene.add(rope);

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
  if (state === 'shop') {
    if (/^Digit[1-9]$/.test(e.code)) buyItem(Number(e.code.slice(-1)) - 1);
    if (e.code === 'Enter' || e.code === 'Space') closeShop();
    if (e.code === 'Space') e.preventDefault();
    return;
  }
  if (state === 'playing' && WEAPON_KEYS[e.code]) {
    const id = WEAPON_KEYS[e.code];
    if (weapons[id].unlocked && weaponId !== id) {
      weaponId = id;
      sfx.reload();
    }
  }
  if (e.code === 'KeyR' && (state === 'gameover' || state === 'playing')) restart();
  if (e.code === 'KeyQ' && state === 'playing') lunge();
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0024;
  pitch -= e.movementY * 0.0024;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});

document.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (document.pointerLockElement !== renderer.domElement) {
    lockPointer();
    return;
  }
  if (e.button === 0) shoot();
  else if (e.button === 2) grapple();
});

el.title.addEventListener('click', () => {
  initAudio();
  startGame();
});
el.paused.addEventListener('click', () => {
  initAudio();
  lockPointer();
});

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
  lockPointer();
  startWave(1);
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

function startWave(n) {
  wave = n;
  waveState = 'banner';
  waveTimer = 3;
  ducks = ducks.filter((d) => d.alive); // prune dead ducks, keep allies
  showBanner(`WAVE ${n}`, PAL.yellow);
}

function spawnWave() {
  const count = 3 + wave;
  const speedScale = 1 + (wave - 1) * 0.08;
  const fireScale = 1 + (wave - 1) * 0.12;
  for (let i = 0; i < count; i++) {
    const d = new Duck(scene, speedScale, fireScale, pos);
    d.group.userData.duck = d;
    ducks.push(d);
  }
}

let bannerTimeout = null;
function showBanner(text, color) {
  el.banner.innerHTML = '';
  el.banner.appendChild(pixelTextCanvas(text, 8, color));
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

function killDuck(duck, points, cash = MONEY_PER_KILL) {
  feathers.burst(duck.group.position);
  addScore(points, duck.group.position);
  money += cash;
}

function shoot() {
  const w = weapons[weaponId];
  if (w.cd > 0) return;
  if (weaponId === 'shotgun' && (w.reload > 0 || w.ammo <= 0)) return;
  if (weaponId === 'bread' && w.pieces <= 0) { sfx.deny(); return; }
  w.cd = w.rate;
  if (weaponId === 'gun') fireGun();
  else if (weaponId === 'shotgun') fireShotgun();
  else if (weaponId === 'knife') fireKnife();
  else fireBread();
}

function fireGun() {
  sfx.blaster();
  muzzle.visible = true;
  muzzleTimer = 0.06;

  const ray = aimRaycaster(300);
  const hits = ray.intersectObjects(aliveEnemies().map((d) => d.group), true);
  // don't shoot through walls/platforms
  const worldHits = ray.intersectObjects(grappleTargets, false);
  const wallDist = worldHits.length ? worldHits[0].distance : Infinity;
  if (hits.length && hits[0].distance < wallDist) {
    const duck = duckFromObject(hits[0].object);
    if (duck && duck.alive) {
      // headshot is an instant kill; body takes two hits
      const headshot = hits[0].object.userData.part === 'head';
      const dead = duck.hit(headshot ? 999 : 1);
      if (dead) killDuck(duck, headshot ? 150 : 100);
      else feathers.burst(duck.group.position);
    }
  }
}

function fireShotgun() {
  const w = weapons.shotgun;
  w.ammo--;
  sfx.shotgun();
  muzzle.visible = true;
  muzzleTimer = 0.09;

  // cone blast: kills every duck within range and ~8.5 degrees of the aim
  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);
  for (const d of aliveEnemies()) {
    const to = d.group.position.clone().sub(pos);
    const dist = to.length();
    if (dist > w.range) continue;
    to.normalize();
    if (to.dot(aim) < Math.cos(0.15)) continue;
    // blocked by world geometry?
    raycaster.set(pos, to);
    raycaster.far = dist;
    if (raycaster.intersectObjects(grappleTargets, false).length) continue;
    d.hit(999);
    killDuck(d, 120);
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
      duck.hit(999);
      killDuck(duck, 150);
      sfx.grappleHit();
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

function addScore(points, worldPos) {
  score += points;
  const v = worldPos.clone().project(camera);
  if (v.z < 1) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.textContent = `+${points}`;
    popup.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    popup.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    el.popups.appendChild(popup);
    requestAnimationFrame(() => {
      popup.style.transform = 'translateY(-50px)';
      popup.style.opacity = '0';
    });
    setTimeout(() => popup.remove(), 900);
  }
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
  el.ducksLeft.textContent = `DUCKS ${aliveEnemies().length}`;
  el.allies.textContent = `ALLIES ${ducks.filter((d) => d.alive && d.ally).length}`;

  const w = weapons[weaponId];
  let wText = w.name;
  if (weaponId === 'shotgun') wText += w.reload > 0 ? ' ...' : ` ${w.ammo}/${w.mag}`;
  if (weaponId === 'bread') wText += ` ${w.pieces}`;
  el.weapon.textContent = wText;
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
};

// ---------- main loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    grappleCd = Math.max(0, grappleCd - dt);
    lungeCd = Math.max(0, lungeCd - dt);
    for (const w of Object.values(weapons)) w.cd = Math.max(0, w.cd - dt);
    const sg = weapons.shotgun;
    if (sg.reload > 0) {
      sg.reload -= dt;
      if (sg.reload <= 0) {
        sg.reload = 0;
        sg.ammo = sg.mag;
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
    }

    const enemies = aliveEnemies();
    const duckCtx = {
      fireEgg: (p, dir) => projectiles.spawn(p, dir, 10 + wave * 0.5),
      dropBomb: (p) => bombs.drop(p),
      fireAllyEgg: (p, dir) => allyEggs.spawn(p, dir),
      enemies,
    };
    for (const d of ducks) if (d.alive) d.update(dt, pos, duckCtx);

    if (waveState === 'active' && enemies.length === 0) {
      addScore(500, pos.clone().add(new THREE.Vector3(0, 2, -4)));
      sfx.waveClear();
      openShop();
    }

    const hits = projectiles.update(dt, pos);
    for (let i = 0; i < hits; i++) damagePlayer(10);

    const bombDamage = bombs.update(dt, pos);
    if (bombDamage > 0) damagePlayer(bombDamage);

    knives.update(dt, enemies, (duck) => {
      duck.hit(999);
      killDuck(duck, 300, MONEY_PER_KILL * 2); // skill shot: double cash
    });

    bread.update(dt, enemies, (duck) => {
      duck.breadHits++;
      if (duck.breadHits >= 3) {
        duck.recruit();
        addScore(200, duck.group.position);
      }
    });

    allyEggs.update(dt, enemies, (duck) => killDuck(duck, 100));

    feathers.update(dt);

    if (muzzleTimer > 0) {
      muzzleTimer -= dt;
      if (muzzleTimer <= 0) muzzle.visible = false;
    }

    // camera kick recovery
    kickPitch = Math.max(0, kickPitch - dt * 0.6);

    updateHUD();
  } else if (state === 'paused' || state === 'gameover' || state === 'shop') {
    feathers.update(dt);
    bombs.update(dt, pos);
  }

  // camera + rope
  camera.position.copy(pos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw);
  camera.rotateX(pitch + kickPitch);

  if (rope.visible) {
    const start = new THREE.Vector3(0.35, -0.3, -0.6);
    camera.localToWorld(start);
    ropeGeo.setFromPoints([start, grappleAnchor]);
  }

  renderer.render(scene, camera);
}

tick();
