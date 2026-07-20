// Voxel ducks built from boxes, waypoint AI, egg projectiles, poop bombs,
// throwing knives, feather bursts.
import * as THREE from 'three';
import { eggTexture } from './textures.js';
import { sfx } from './audio.js';

const COLORS = {
  bodyDark: 0x503000,
  belly: 0xfcfcfc,
  headGreen: 0x00a800,
  headRed: 0xd82800,
  beak: 0xf87800,
  wing: 0x7c5000,
  eye: 0x000000,
};

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

// waypoints wander around the player so ducks follow you across the world
function randomWaypoint(center, minR = 10, maxR = 45) {
  const a = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * (maxR - minR);
  return new THREE.Vector3(
    center.x + Math.cos(a) * r,
    6 + Math.random() * 14,
    center.z + Math.sin(a) * r
  );
}

export class Duck {
  constructor(scene, speedScale = 1, fireRateScale = 1, spawnCenter = new THREE.Vector3()) {
    this.scene = scene;
    this.hp = 2;
    this.alive = true;
    this.ally = false;      // recruited with bread: fights for the player
    this.breadHits = 0;     // bread pieces landed; 3 recruits the duck
    this.speed = (5 + Math.random() * 2) * speedScale;
    this.fireRateScale = fireRateScale;

    this.group = new THREE.Group();
    const headColor = Math.random() < 0.5 ? COLORS.headGreen : COLORS.headRed;

    const body = box(1.4, 0.9, 0.9, COLORS.bodyDark);
    this.group.add(body);

    const belly = box(1.2, 0.4, 0.8, COLORS.belly);
    belly.position.set(0, -0.35, 0);
    this.group.add(belly);

    const head = box(0.55, 0.55, 0.55, headColor);
    head.position.set(0.85, 0.55, 0);
    head.userData.part = 'head';
    this.group.add(head);

    const beak = box(0.4, 0.16, 0.24, COLORS.beak);
    beak.position.set(1.3, 0.5, 0);
    beak.userData.part = 'head';
    this.group.add(beak);

    for (const side of [-1, 1]) {
      const eye = box(0.12, 0.12, 0.12, COLORS.eye);
      eye.position.set(1.0, 0.65, side * 0.29);
      eye.userData.part = 'head';
      this.group.add(eye);
    }

    const tail = box(0.4, 0.3, 0.5, COLORS.wing);
    tail.position.set(-0.85, 0.15, 0);
    this.group.add(tail);

    // wings pivot at the body edge so flapping rotates outward
    this.wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.1, 0.25, side * 0.45);
      const wing = box(0.9, 0.1, 0.7, COLORS.wing);
      wing.position.set(0, 0, side * 0.35);
      pivot.add(wing);
      this.group.add(pivot);
      this.wings.push({ pivot, side });
    }

    this.group.position.copy(randomWaypoint(spawnCenter, 20, 50));
    this.waypoint = randomWaypoint(spawnCenter);
    this.state = 'fly';
    this.stateTimer = 2 + Math.random() * 2; // time until next aim
    this.aimTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.flapPhase = Math.random() * Math.PI * 2;
    this.quackTimer = 3 + Math.random() * 6;
    this.poopTimer = 4 + Math.random() * 5;

    scene.add(this.group);
  }

  // ctx: { fireEgg(pos, dir), dropBomb(pos), fireAllyEgg(pos, dir), enemies }
  update(dt, playerPos, ctx) {
    if (!this.alive) return;

    this.flapPhase += dt * 14;
    const flap = Math.sin(this.flapPhase) * 0.7;
    for (const { pivot, side } of this.wings) pivot.rotation.x = flap * side;

    this.quackTimer -= dt;
    if (this.quackTimer <= 0) {
      this.quackTimer = 4 + Math.random() * 8;
      sfx.quack();
    }

    // bombing run: drop poop when passing above the player (enemies only)
    if (!this.ally) {
      this.poopTimer -= dt;
      if (this.poopTimer <= 0) {
        const dx = this.group.position.x - playerPos.x;
        const dz = this.group.position.z - playerPos.z;
        if (dx * dx + dz * dz < 100 && this.group.position.y > playerPos.y + 3) {
          ctx.dropBomb(this.group.position.clone());
          this.poopTimer = 5 + Math.random() * 6;
        } else {
          this.poopTimer = 0.5; // not overhead yet, check again soon
        }
      }
    }

    if (this.state === 'fly') {
      this.bobPhase += dt * 3;
      const toWp = this.waypoint.clone().sub(this.group.position);
      const wpDistToPlayer = this.waypoint.distanceTo(playerPos);
      if (toWp.length() < 2 || wpDistToPlayer > 70) {
        this.waypoint = randomWaypoint(playerPos);
      } else {
        toWp.normalize().multiplyScalar(this.speed * dt);
        toWp.y += Math.sin(this.bobPhase) * 1.5 * dt; // sine-wave bobbing
        this.group.position.add(toWp);
        // face travel direction
        this.group.rotation.y = Math.atan2(-toWp.z, toWp.x);
      }
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'aim';
        this.aimTimer = 0.6;
      }
    } else if (this.state === 'aim') {
      // pause, face the target, then fire. Allies target the nearest enemy
      // duck; enemies target the player.
      let targetDuck = null;
      let target = playerPos;
      if (this.ally) {
        let best = 60;
        for (const e of ctx.enemies) {
          const d = e.group.position.distanceTo(this.group.position);
          if (d < best) { best = d; targetDuck = e; }
        }
        if (!targetDuck) { // nothing to shoot at, keep flying
          this.state = 'fly';
          this.stateTimer = 1.5;
          return;
        }
        target = targetDuck.group.position;
      }
      const toTarget = target.clone().sub(this.group.position);
      this.group.rotation.y = Math.atan2(-toTarget.z, toTarget.x);
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) {
        const muzzle = this.group.position.clone();
        muzzle.y += 0.3;
        let aimPos = target.clone();
        if (targetDuck) {
          // lead the shot: enemies fly toward their waypoints
          const t = muzzle.distanceTo(target) / 16; // egg flight time
          const vel = targetDuck.waypoint.clone().sub(target);
          if (vel.lengthSq() > 0) vel.normalize().multiplyScalar(targetDuck.speed);
          aimPos.addScaledVector(vel, t);
        }
        const dir = aimPos.sub(muzzle).normalize();
        if (this.ally) ctx.fireAllyEgg(muzzle, dir);
        else ctx.fireEgg(muzzle, dir);
        this.state = 'fly';
        this.stateTimer = (2 + Math.random() * 2) / this.fireRateScale;
      }
    }
  }

  recruit() {
    this.ally = true;
    this.breadHits = 0;
    // bread-yellow head marks a friendly duck
    this.group.traverse((o) => {
      if (o.userData.part === 'head' && o.material) o.material.color.set(0xf8b800);
    });
    sfx.recruit();
  }

  hit(damage) {
    this.hp -= damage;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die(silent = false) {
    this.alive = false;
    this.scene.remove(this.group);
    if (!silent) sfx.deathQuack();
  }
}

// ---- duck projectiles (eggs lobbed at the player) ----
export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.material = new THREE.SpriteMaterial({ map: eggTexture(), transparent: true });
  }

  spawn(pos, dir, speed = 11) {
    const sprite = new THREE.Sprite(this.material);
    sprite.position.copy(pos);
    sprite.scale.set(0.6, 0.75, 1);
    this.scene.add(sprite);
    this.list.push({ sprite, vel: dir.clone().multiplyScalar(speed), life: 8 });
    sfx.duckShoot();
  }

  // returns number of hits on the player this frame
  update(dt, playerPos) {
    let hits = 0;
    for (const p of this.list) {
      p.life -= dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const d = p.sprite.position.distanceTo(playerPos);
      if (d < 1.0) {
        hits++;
        p.life = 0;
      }
      if (p.sprite.position.y < 0.1) p.life = 0;
    }
    this.list = this.list.filter((p) => {
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        return false;
      }
      return true;
    });
    return hits;
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.sprite);
    this.list = [];
  }
}

// ---- explosive poop dropped like bombs ----
const BOMB_BLAST_RADIUS = 3.5;

export class BombManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.particles = [];
    this.geo = new THREE.BoxGeometry(0.4, 0.35, 0.4);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x503000 });
    this.particleGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    this.particleMats = [
      new THREE.MeshLambertMaterial({ color: 0xf87800 }),
      new THREE.MeshLambertMaterial({ color: 0xf8b800 }),
      new THREE.MeshLambertMaterial({ color: 0x503000 }),
    ];
  }

  drop(pos) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.list.push({ mesh, vy: 0 });
    sfx.bombDrop();
  }

  explode(pos) {
    sfx.explosion();
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.particleMats[i % this.particleMats.length]);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 8 + 2,
        (Math.random() - 0.5) * 12
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 0.7 });
    }
  }

  // returns total damage dealt to the player this frame
  update(dt, playerPos) {
    let damage = 0;
    for (const b of this.list) {
      b.vy -= 18 * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.rotation.y += 4 * dt;
      const nearPlayer = b.mesh.position.distanceTo(playerPos) < 1.1;
      if (b.mesh.position.y < 0.2 || nearPlayer) {
        this.explode(b.mesh.position);
        if (b.mesh.position.distanceTo(playerPos) < BOMB_BLAST_RADIUS) damage += 20;
        b.dead = true;
      }
    }
    this.list = this.list.filter((b) => {
      if (b.dead) {
        this.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= 15 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += 6 * dt;
      p.mesh.rotation.z += 6 * dt;
    }
    this.particles = this.particles.filter((p) => {
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
    return damage;
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.list = [];
    this.particles = [];
  }
}

// ---- thrown knives (player weapon, one-shot kill) ----
export class KnifeManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.bladeGeo = new THREE.BoxGeometry(0.1, 0.04, 0.55);
    this.bladeMat = new THREE.MeshLambertMaterial({ color: 0xbcbcbc });
    this.handleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.25);
    this.handleMat = new THREE.MeshLambertMaterial({ color: 0x503000 });
  }

  throw(pos, dir) {
    const group = new THREE.Group();
    const blade = new THREE.Mesh(this.bladeGeo, this.bladeMat);
    blade.position.z = -0.2;
    group.add(blade);
    const handle = new THREE.Mesh(this.handleGeo, this.handleMat);
    handle.position.z = 0.2;
    group.add(handle);
    group.position.copy(pos);
    group.lookAt(pos.clone().add(dir));
    this.scene.add(group);
    this.list.push({ group, vel: dir.clone().multiplyScalar(40), life: 1.6 });
    sfx.knife();
  }

  // calls onKill(duck) for each duck a knife hits; knives pierce and
  // keep flying, so one throw can kill several ducks in a line
  update(dt, ducks, onKill) {
    for (const k of this.list) {
      k.life -= dt;
      k.vel.y -= 8 * dt;
      k.group.position.addScaledVector(k.vel, dt);
      k.group.rotateZ(14 * dt); // spin along the flight axis
      if (k.group.position.y < 0.05) k.life = 0;
      for (const d of ducks) {
        if (!d.alive) continue;
        if (k.group.position.distanceTo(d.group.position) < 1.3) {
          onKill(d);
        }
      }
    }
    this.list = this.list.filter((k) => {
      if (k.life <= 0) {
        this.scene.remove(k.group);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const k of this.list) this.scene.remove(k.group);
    this.list = [];
  }
}

// ---- thrown bread pieces (hit an enemy duck 3 times to recruit it) ----
export class BreadManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.crumbs = [];
    this.geo = new THREE.BoxGeometry(0.3, 0.22, 0.3);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xf8b800 });
    this.crustMat = new THREE.MeshLambertMaterial({ color: 0xac7c00 });
    this.crumbGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  }

  throw(pos, dir) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.list.push({ mesh, vel: dir.clone().multiplyScalar(30), life: 2 });
    sfx.breadThrow();
  }

  crumbBurst(pos) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.crumbGeo, i % 2 ? this.mat : this.crustMat);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 5
      );
      this.scene.add(mesh);
      this.crumbs.push({ mesh, vel, life: 0.6 });
    }
  }

  // calls onHit(duck) for each enemy duck a piece lands on
  update(dt, enemies, onHit) {
    for (const b of this.list) {
      b.life -= dt;
      b.vel.y -= 8 * dt; // lobbed arc
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += 6 * dt;
      b.mesh.rotation.y += 4 * dt;
      if (b.mesh.position.y < 0.05) b.life = 0;
      for (const d of enemies) {
        if (!d.alive) continue;
        if (b.mesh.position.distanceTo(d.group.position) < 1.6) {
          this.crumbBurst(b.mesh.position);
          onHit(d);
          b.life = 0;
          break;
        }
      }
    }
    this.list = this.list.filter((b) => {
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    for (const c of this.crumbs) {
      c.life -= dt;
      c.vel.y -= 12 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
    }
    this.crumbs = this.crumbs.filter((c) => {
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    for (const c of this.crumbs) this.scene.remove(c.mesh);
    this.list = [];
    this.crumbs = [];
  }
}

// ---- eggs fired by recruited ducks at enemy ducks ----
export class AllyEggManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.material = new THREE.SpriteMaterial({ map: eggTexture(), transparent: true });
  }

  spawn(pos, dir, speed = 16) {
    const sprite = new THREE.Sprite(this.material);
    sprite.position.copy(pos);
    sprite.scale.set(0.5, 0.62, 1);
    this.scene.add(sprite);
    this.list.push({ sprite, vel: dir.clone().multiplyScalar(speed), life: 5 });
    sfx.duckShoot();
  }

  // calls onKill(duck) when an egg finishes off an enemy duck
  update(dt, enemies, onKill) {
    for (const p of this.list) {
      p.life -= dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      if (p.sprite.position.y < 0.1) p.life = 0;
      for (const d of enemies) {
        if (!d.alive) continue;
        if (p.sprite.position.distanceTo(d.group.position) < 1.4) {
          if (d.hit(1)) onKill(d);
          p.life = 0;
          break;
        }
      }
    }
    this.list = this.list.filter((p) => {
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.sprite);
    this.list = [];
  }
}

// ---- pixel feather burst on duck death ----
export class FeatherManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.22, 0.06, 0.22);
    this.mats = [
      new THREE.MeshLambertMaterial({ color: 0xfcfcfc }),
      new THREE.MeshLambertMaterial({ color: 0x503000 }),
      new THREE.MeshLambertMaterial({ color: 0xf87800 }),
    ];
  }

  burst(pos) {
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mats[i % this.mats.length]);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 8
      );
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      this.scene.add(mesh);
      this.list.push({ mesh, vel, spin, life: 1.2 });
    }
  }

  update(dt) {
    for (const f of this.list) {
      f.life -= dt;
      f.vel.y -= 12 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
    }
    this.list = this.list.filter((f) => {
      if (f.life <= 0 || f.mesh.position.y < -1) {
        this.scene.remove(f.mesh);
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const f of this.list) this.scene.remove(f.mesh);
    this.list = [];
  }
}
