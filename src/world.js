// Infinite world: terrain streams in around the player in seeded chunks.
// Each chunk belongs to a biome (farmland / forest / highlands / desert) that
// decides its ground texture and which props spawn. Biomes form contiguous
// regions larger than a chunk, so the world visibly changes as you explore.
import * as THREE from 'three';
import {
  grassTexture, forestGrassTexture, sandTexture, rockGroundTexture,
  trunkTexture, leafTexture, pineTexture, stoneTexture, boulderTexture,
  cactusTexture, barnTexture, roofTexture, adobeTexture,
  skyTexture, cloudTexture,
} from './textures.js';

const CHUNK = 40;        // chunk side length in world units
const RADIUS = 3;        // chunks kept loaded around the player (Chebyshev)
const GRASS_TILE = 4;    // world units per ground texture tile
const BIOME_SCALE = 5;   // coarse cells per biome noise sample (bigger = larger biomes)

// Solid axis-aligned boxes the player collides with / can stand on.
// Each: { min: Vector3, max: Vector3 }
export const solids = [];

// Meshes the grapple raycast can hit (terrain, platforms, trees, barns).
export const grappleTargets = [];

let scene = null;
const chunks = new Map(); // "cx,cz" -> { group, solids, targets }

let cloudGroup = null;

// shared materials/geometries so chunk churn doesn't allocate per-mesh
let trunkMat, leafMat, pineMat, stoneMat, boulderMat, cactusMat,
    barnMat, roofMat, adobeMat, hillMat;
let groundGeo;                 // shared per-chunk ground plane
const groundMats = {};         // biome id -> ground material
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// deterministic per-chunk RNG
function chunkSeed(cx, cz) {
  let h = (cx * 374761393 + cz * 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- biome selection --------------------------------------------------------
// Two low-frequency value-noise fields (a rough "temperature" and "moisture")
// give smooth, contiguous regions. A 2x2 matrix maps them to the four biomes,
// keeping the distribution roughly balanced. Deterministic in (cx, cz).
function hashUnit(ix, iz, salt) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)
           + Math.imul(salt, 2246822519)) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, salt) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);   // smoothstep
  const uz = fz * fz * (3 - 2 * fz);
  const v00 = hashUnit(x0, z0, salt);
  const v10 = hashUnit(x0 + 1, z0, salt);
  const v01 = hashUnit(x0, z0 + 1, salt);
  const v11 = hashUnit(x0 + 1, z0 + 1, salt);
  const a = v00 + (v10 - v00) * ux;
  const b = v01 + (v11 - v01) * ux;
  return a + (b - a) * uz;
}

function biomeAt(cx, cz) {
  const temp = valueNoise(cx / BIOME_SCALE, cz / BIOME_SCALE, 1);
  const moist = valueNoise(cx / BIOME_SCALE, cz / BIOME_SCALE, 7);
  if (temp < 0.5) return moist < 0.5 ? 'highlands' : 'forest';
  return moist < 0.5 ? 'desert' : 'farmland';
}

// ---- mesh helpers -----------------------------------------------------------
function addBox(group, w, h, d, x, y, z, mat, out) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  group.add(mesh);
  out.targets.push(mesh);
  return mesh;
}

function addSolid(mesh, out) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const s = { min: box.min.clone(), max: box.max.clone() };
  out.solids.push(s);
  solids.push(s);
}

// ---- props ------------------------------------------------------------------
function addLeafyTree(group, out, x, z, rand) {
  const h = 4 + rand() * 2;
  const trunk = addBox(group, 1.2, h, 1.2, x, h / 2, z, trunkMat, out);
  addSolid(trunk, out);
  addBox(group, 4.5, 3.5, 4.5, x, h + 1.5, z, leafMat, out);
}

// Conifer: slim trunk topped with three tapering tiers of needles.
function addPineTree(group, out, x, z, rand) {
  const h = 5 + rand() * 3;
  const trunk = addBox(group, 1, h, 1, x, h / 2, z, trunkMat, out);
  addSolid(trunk, out);
  addBox(group, 4.5, 2, 4.5, x, h + 0.5, z, pineMat, out);
  addBox(group, 3.2, 2, 3.2, x, h + 2, z, pineMat, out);
  addBox(group, 1.8, 2.2, 1.8, x, h + 3.4, z, pineMat, out);
}

// Rounded stone lump, sometimes with a smaller companion. Standable/collidable.
function addBoulder(group, out, x, z, rand) {
  const s = 2 + rand() * 2.5;
  const b = addBox(group, s, s * 0.8, s, x, s * 0.4, z, boulderMat, out);
  addSolid(b, out);
  if (rand() < 0.5) {
    const s2 = 1 + rand() * 1.5;
    const b2 = addBox(group, s2, s2 * 0.8, s2, x + s * 0.6, s2 * 0.4, z - s * 0.4, boulderMat, out);
    addSolid(b2, out);
  }
}

// Blocky hill: 1-3 flat-topped terraces, each smaller and higher, so the player
// can climb up. Reuses the stand-on-box collision (no terrain heightmap needed).
function addHill(group, out, x, z, rand) {
  const tiers = 1 + Math.floor(rand() * 3);
  let w = 10 + rand() * 8;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const th = 2 + rand() * 2;
    const box = addBox(group, w, th, w, x, y + th / 2, z, hillMat, out);
    addSolid(box, out);
    y += th;
    w *= 0.6 + rand() * 0.15;
    if (w < 3) break;
  }
}

// Saguaro-ish cactus: a tall ribbed column, often with an arm.
function addCactus(group, out, x, z, rand) {
  const h = 3 + rand() * 3;
  const body = addBox(group, 1, h, 1, x, h / 2, z, cactusMat, out);
  addSolid(body, out);
  if (rand() < 0.7) {
    const ay = h * 0.45 + rand() * h * 0.2;
    addBox(group, 1.6, 0.8, 0.8, x + 0.6, ay, z, cactusMat, out);
    addBox(group, 0.8, 1.6, 0.8, x + 1.2, ay + 0.8, z, cactusMat, out);
  }
}

function addBarn(group, out, x, z) {
  const barn = addBox(group, 12, 8, 9, x, 4, z, barnMat, out);
  addSolid(barn, out);
  const roof = addBox(group, 13, 1.6, 10, x, 8.8, z, roofMat, out);
  addSolid(roof, out);
}

// Squat adobe hut with a flat overhanging roof — the desert's "building".
function addHut(group, out, x, z, rand) {
  const w = 8 + rand() * 3;
  const h = 5;
  const wall = addBox(group, w, h, w, x, h / 2, z, adobeMat, out);
  addSolid(wall, out);
  const roof = addBox(group, w + 1, 1, w + 1, x, h + 0.5, z, adobeMat, out);
  addSolid(roof, out);
}

function addPlatform(group, out, x, z, rand) {
  const size = 5 + rand() * 3;
  const y = 6 + rand() * 10;
  const plat = addBox(group, size, 1.2, size, x, y, z, stoneMat, out);
  addSolid(plat, out);
}

// ---- chunk assembly ---------------------------------------------------------
function buildChunk(cx, cz) {
  const rand = mulberry32(chunkSeed(cx, cz));
  const biome = biomeAt(cx, cz);
  const group = new THREE.Group();
  const out = { group, solids: [], targets: [] };
  const ox = cx * CHUNK - CHUNK / 2;
  const oz = cz * CHUNK - CHUNK / 2;

  // this chunk's biome ground tile (world-fixed, so no snap-scrolling needed)
  const gm = new THREE.Mesh(groundGeo, groundMats[biome]);
  gm.rotation.x = -Math.PI / 2;
  gm.position.set(cx * CHUNK, 0, cz * CHUNK);
  group.add(gm);
  out.targets.push(gm);

  // random point comfortably inside the chunk
  const rx = () => ox + 4 + rand() * (CHUNK - 8);
  const rz = () => oz + 4 + rand() * (CHUNK - 8);
  const bx = (m) => ox + m + rand() * (CHUNK - 2 * m);
  const bz = (m) => oz + m + rand() * (CHUNK - 2 * m);

  if (biome === 'farmland') {
    const treeCount = Math.floor(rand() * 3);           // 0-2
    for (let i = 0; i < treeCount; i++) addLeafyTree(group, out, rx(), rz(), rand);
    if (rand() < 0.35) addPlatform(group, out, bx(6), bz(6), rand);
    if (rand() < 0.08) addBarn(group, out, bx(10), bz(10));
  } else if (biome === 'forest') {
    const treeCount = 2 + Math.floor(rand() * 3);       // 2-4, mostly pines
    for (let i = 0; i < treeCount; i++) {
      if (rand() < 0.6) addPineTree(group, out, rx(), rz(), rand);
      else addLeafyTree(group, out, rx(), rz(), rand);
    }
    if (rand() < 0.2) addPlatform(group, out, bx(6), bz(6), rand);
  } else if (biome === 'highlands') {
    if (rand() < 0.55) addHill(group, out, bx(8), bz(8), rand);
    const boulders = Math.floor(rand() * 3);            // 0-2
    for (let i = 0; i < boulders; i++) addBoulder(group, out, rx(), rz(), rand);
    if (rand() < 0.3) addLeafyTree(group, out, rx(), rz(), rand);
    if (rand() < 0.3) addPlatform(group, out, bx(6), bz(6), rand);
  } else { // desert
    const cacti = Math.floor(rand() * 3);               // 0-2
    for (let i = 0; i < cacti; i++) addCactus(group, out, rx(), rz(), rand);
    if (rand() < 0.06) addHut(group, out, bx(10), bz(10), rand);
    if (rand() < 0.15) addBoulder(group, out, rx(), rz(), rand);
  }

  scene.add(group);
  for (const t of out.targets) grappleTargets.push(t);
  chunks.set(`${cx},${cz}`, out);
}

function disposeChunk(key) {
  const c = chunks.get(key);
  scene.remove(c.group);
  for (const s of c.solids) {
    const i = solids.indexOf(s);
    if (i !== -1) solids.splice(i, 1);
  }
  for (const t of c.targets) {
    const i = grappleTargets.indexOf(t);
    if (i !== -1) grappleTargets.splice(i, 1);
  }
  chunks.delete(key);
}

export function buildWorld(s) {
  scene = s;
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#a8d8fc', 70, 135);

  // lights
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x506030, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  trunkMat = new THREE.MeshLambertMaterial({ map: trunkTexture() });
  leafMat = new THREE.MeshLambertMaterial({ map: leafTexture() });
  pineMat = new THREE.MeshLambertMaterial({ map: pineTexture() });
  stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  boulderMat = new THREE.MeshLambertMaterial({ map: boulderTexture() });
  cactusMat = new THREE.MeshLambertMaterial({ map: cactusTexture() });
  barnMat = new THREE.MeshLambertMaterial({ map: barnTexture() });
  roofMat = new THREE.MeshLambertMaterial({ map: roofTexture() });
  adobeMat = new THREE.MeshLambertMaterial({ map: adobeTexture() });
  hillMat = new THREE.MeshLambertMaterial({ map: rockGroundTexture(2) });

  // one shared ground plane geometry; each chunk instances it with a biome map
  const rep = CHUNK / GRASS_TILE;
  groundGeo = new THREE.PlaneGeometry(CHUNK, CHUNK);
  groundMats.farmland = new THREE.MeshLambertMaterial({ map: grassTexture(rep) });
  groundMats.forest = new THREE.MeshLambertMaterial({ map: forestGrassTexture(rep) });
  groundMats.highlands = new THREE.MeshLambertMaterial({ map: rockGroundTexture(rep) });
  groundMats.desert = new THREE.MeshLambertMaterial({ map: sandTexture(rep) });

  // blocky cloud sprites, parented so they drift along with the player
  cloudGroup = new THREE.Group();
  const cloudTex = cloudTexture();
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false });
    const cloud = new THREE.Sprite(mat);
    const angle = (i / 10) * Math.PI * 2;
    const r = 90 + Math.random() * 40;
    cloud.position.set(Math.cos(angle) * r, 35 + Math.random() * 25, Math.sin(angle) * r);
    cloud.scale.set(24, 12, 1);
    cloudGroup.add(cloud);
  }
  scene.add(cloudGroup);

  updateWorld(new THREE.Vector3());
}

// Call every frame: streams chunks in/out around the player.
export function updateWorld(playerPos) {
  const pcx = Math.round(playerPos.x / CHUNK);
  const pcz = Math.round(playerPos.z / CHUNK);

  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      if (!chunks.has(`${pcx + dx},${pcz + dz}`)) buildChunk(pcx + dx, pcz + dz);
    }
  }

  for (const key of [...chunks.keys()]) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > RADIUS + 1) disposeChunk(key);
  }

  cloudGroup.position.set(playerPos.x, 0, playerPos.z);
}
