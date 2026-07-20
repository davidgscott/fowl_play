// Infinite world: terrain streams in around the player in seeded chunks.
// Each chunk randomly gets trees, floating platforms, and the odd barn.
import * as THREE from 'three';
import {
  grassTexture, trunkTexture, leafTexture, stoneTexture,
  barnTexture, roofTexture, skyTexture, cloudTexture,
} from './textures.js';

const CHUNK = 40;        // chunk side length in world units
const RADIUS = 3;        // chunks kept loaded around the player (Chebyshev)
const GRASS_TILE = 4;    // world units per grass texture tile (for snap-scrolling)

// Solid axis-aligned boxes the player collides with / can stand on.
// Each: { min: Vector3, max: Vector3 }
export const solids = [];

// Meshes the grapple raycast can hit (terrain, platforms, trees, barns).
export const grappleTargets = [];

let scene = null;
const chunks = new Map(); // "cx,cz" -> { group, solids, targets }

let ground = null;
let cloudGroup = null;

// shared materials/geometries so chunk churn doesn't allocate per-mesh
let trunkMat, leafMat, stoneMat, barnMat, roofMat;
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

function buildChunk(cx, cz) {
  const rand = mulberry32(chunkSeed(cx, cz));
  const group = new THREE.Group();
  const out = { group, solids: [], targets: [] };
  const ox = cx * CHUNK - CHUNK / 2;
  const oz = cz * CHUNK - CHUNK / 2;

  // trees: 0-2 per chunk
  const treeCount = Math.floor(rand() * 3);
  for (let i = 0; i < treeCount; i++) {
    const x = ox + 4 + rand() * (CHUNK - 8);
    const z = oz + 4 + rand() * (CHUNK - 8);
    const h = 4 + rand() * 2;
    const trunk = addBox(group, 1.2, h, 1.2, x, h / 2, z, trunkMat, out);
    addSolid(trunk, out);
    addBox(group, 4.5, 3.5, 4.5, x, h + 1.5, z, leafMat, out);
  }

  // floating platform: ~35% of chunks
  if (rand() < 0.35) {
    const size = 5 + rand() * 3;
    const x = ox + 6 + rand() * (CHUNK - 12);
    const z = oz + 6 + rand() * (CHUNK - 12);
    const y = 6 + rand() * 10;
    const plat = addBox(group, size, 1.2, size, x, y, z, stoneMat, out);
    addSolid(plat, out);
  }

  // barn: ~8% of chunks
  if (rand() < 0.08) {
    const x = ox + 10 + rand() * (CHUNK - 20);
    const z = oz + 10 + rand() * (CHUNK - 20);
    const barn = addBox(group, 12, 8, 9, x, 4, z, barnMat, out);
    addSolid(barn, out);
    const roof = addBox(group, 13, 1.6, 10, x, 8.8, z, roofMat, out);
    addSolid(roof, out);
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
  stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  barnMat = new THREE.MeshLambertMaterial({ map: barnTexture() });
  roofMat = new THREE.MeshLambertMaterial({ map: roofTexture() });

  // ground: one big plane that follows the player, snapped to the texture
  // tile size so the pattern never appears to slide
  const groundSize = (RADIUS * 2 + 2) * CHUNK;
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshLambertMaterial({ map: grassTexture(groundSize / GRASS_TILE) })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  grappleTargets.push(ground);

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

  ground.position.x = Math.round(playerPos.x / GRASS_TILE) * GRASS_TILE;
  ground.position.z = Math.round(playerPos.z / GRASS_TILE) * GRASS_TILE;
  cloudGroup.position.set(playerPos.x, 0, playerPos.z);
}
