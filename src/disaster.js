// Natural disasters: a wandering tornado (and its shark-infested cousin, the
// SHARKNADO) that sweeps the arena, flinging and shredding birds, allies and
// the player alike. Purely a hazard — it belongs to nobody.
import * as THREE from 'three';
import { sfx } from './audio.js';

const ARENA_R = 62;        // keep the funnel roaming inside this radius of origin
const LIFETIME = 20;       // seconds it spends on the map before dissipating
const TRAVEL = 17;         // horizontal travel speed (fast — a real threat)
const SPAWN_DIST = 36;     // how far from the player it touches down
const HEIGHT = 44;         // funnel height (towering)
const KILL_RADIUS = 3.4;   // birds sucked into the core are destroyed
const CATCH_RADIUS = 4.6;  // the player is picked up + tossed within this
const SPINOUT_RANGE = 34;  // sharknado: how far a shark will leap for a bird
const MAX_SPINOUTS = 6;

export class TornadoManager {
  constructor(scene, sharks) {
    this.scene = scene;
    this.sharks = sharks; // reused for shark meshes + the split-in-half effect
    this.active = null;
    this.spinouts = [];
  }

  get isActive() { return !!this.active; }

  // ---- build the swirling funnel (+ orbiting sharks for a sharknado) ----
  build(type) {
    const g = new THREE.Group();
    const dust = type === 'sharknado' ? 0x54607c : 0x8c8c8c;
    const rings = [];
    const segs = Math.round(HEIGHT / 2) + 1; // keep rings ~2 units apart so the column stays solid
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const w = 1.6 + t * t * 8; // narrow at the base, flaring toward the top
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 2.6, w),
        new THREE.MeshLambertMaterial({ color: dust, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      mesh.position.y = t * HEIGHT;
      g.add(mesh);
      rings.push({ mesh, phase: Math.random() * 6.28, r: 0.4 + t * 1.7, spin: 7 + t * 3 });
    }
    const debris = [];
    const debCol = type === 'sharknado' ? 0x2c3c4c : 0x503000;
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshLambertMaterial({ color: debCol }));
      g.add(mesh);
      debris.push({ mesh, phase: Math.random() * 6.28, y: Math.random() * HEIGHT, r: 1.5 + Math.random() * 6, spin: 3 + Math.random() * 4 });
    }
    const orbit = [];
    if (type === 'sharknado' && this.sharks) {
      const count = 6; // spread up the taller funnel
      for (let i = 0; i < count; i++) {
        const mesh = this.sharks.build();
        mesh.scale.setScalar(0.95);
        g.add(mesh);
        orbit.push({ mesh, phase: i * 1.05, y: 4 + i * (HEIGHT / count), r: 4 + (i % 2), spin: 2.4 });
      }
    }
    return { g, rings, debris, orbit };
  }

  spawn(type, playerPos) {
    if (this.active) this.clear();
    const model = this.build(type);
    // touch down fairly close to the player, on a random bearing, and bear down
    // on them — the wander takes over once it arrives, so it's a threat you have
    // to actively dodge rather than a distant curiosity
    const ang = Math.random() * Math.PI * 2;
    const p = playerPos.clone().add(new THREE.Vector3(Math.cos(ang) * SPAWN_DIST, 0, Math.sin(ang) * SPAWN_DIST));
    p.y = 0;
    const r = Math.hypot(p.x, p.z);
    if (r > ARENA_R) { p.x *= ARENA_R / r; p.z *= ARENA_R / r; } // keep it on the map
    const aim = playerPos.clone().sub(p); aim.y = 0;
    if (aim.lengthSq() < 0.01) aim.set(1, 0, 0);
    const vel = aim.normalize().multiplyScalar(TRAVEL);
    model.g.position.copy(p);
    this.scene.add(model.g);
    this.active = {
      type, ...model, pos: p, vel, life: LIFETIME,
      steerTimer: 1.2, spinTimer: 0.6, playerDmgTimer: 0, playerBiteTimer: 0, dissipate: 0,
    };
  }

  clear() {
    if (this.active) this.scene.remove(this.active.g);
    for (const s of this.spinouts) this.scene.remove(s.mesh);
    this.active = null;
    this.spinouts = [];
  }

  // ctx: { playerPos, enemies, allies, feathers, damagePlayer, addImpulse, liftPlayer, addShake }
  update(dt, ctx) {
    this.updateSpinouts(dt, ctx);
    const a = this.active;
    if (!a) return;

    // ---- travel: wander, occasionally lunging toward the player, kept in bounds ----
    a.steerTimer -= dt;
    if (a.steerTimer <= 0) {
      a.steerTimer = 0.9 + Math.random() * 1.1;
      let heading;
      if (Math.random() < 0.25) { // drift toward the player now and then, not always
        heading = ctx.playerPos.clone().sub(a.pos); heading.y = 0; heading.normalize();
      } else {
        const cur = Math.atan2(a.vel.z, a.vel.x) + (Math.random() - 0.5) * 1.6;
        heading = new THREE.Vector3(Math.cos(cur), 0, Math.sin(cur));
      }
      a.vel.copy(heading.multiplyScalar(TRAVEL));
    }
    // steer back if it strays past the rim
    if (Math.hypot(a.pos.x, a.pos.z) > ARENA_R) {
      const back = new THREE.Vector3(-a.pos.x, 0, -a.pos.z).normalize().multiplyScalar(TRAVEL);
      a.vel.lerp(back, 0.5);
    }
    a.pos.addScaledVector(a.vel, dt);
    a.g.position.copy(a.pos);

    // ---- animate the swirl ----
    for (const r of a.rings) {
      r.phase += r.spin * dt;
      r.mesh.position.set(Math.sin(r.phase) * r.r, r.mesh.position.y, Math.cos(r.phase) * r.r);
      r.mesh.rotation.y += r.spin * dt * 0.5;
    }
    for (const d of a.debris) {
      d.phase += d.spin * dt;
      d.mesh.position.set(Math.cos(d.phase) * d.r, d.y, Math.sin(d.phase) * d.r);
    }
    for (const o of a.orbit) {
      o.phase += o.spin * dt;
      o.mesh.position.set(Math.cos(o.phase) * o.r, o.y, Math.sin(o.phase) * o.r);
      o.mesh.rotation.y = -o.phase; // nose along the orbit
    }

    // ---- shred any bird caught in the core (enemy or ally) ----
    for (const d of ctx.enemies) this.maybeShred(d, a, ctx);
    for (const d of ctx.allies) this.maybeShred(d, a, ctx);

    // ---- sharknado: fling sharks at nearby birds (and sometimes the player) ----
    if (a.type === 'sharknado') {
      a.spinTimer -= dt;
      if (a.spinTimer <= 0 && this.spinouts.length < MAX_SPINOUTS) {
        a.spinTimer = 0.55 + Math.random() * 0.5;
        this.launchSpinout(a, ctx);
      }
    }

    // ---- catch + toss the player (dangerous, but you can fight/run out) ----
    const pdx = ctx.playerPos.x - a.pos.x, pdz = ctx.playerPos.z - a.pos.z;
    if (pdx * pdx + pdz * pdz < CATCH_RADIUS * CATCH_RADIUS && ctx.playerPos.y < HEIGHT) {
      // swirl inward + tangential, and loft the player off their feet — kept
      // weak enough (< run speed) that a determined player can break away
      const inward = new THREE.Vector3(-pdx, 0, -pdz).normalize();
      const tangent = new THREE.Vector3(-pdz, 0, pdx).normalize();
      ctx.addImpulse(inward.multiplyScalar(9).addScaledVector(tangent, 16));
      ctx.liftPlayer(7);
      ctx.addShake(0.4);
      a.playerDmgTimer -= dt;
      if (a.playerDmgTimer <= 0) { a.playerDmgTimer = 0.4; ctx.damagePlayer(2); } // ~5/s
      // sharknado: a shark lunges out of the funnel and bites for extra damage
      if (a.type === 'sharknado') {
        a.playerBiteTimer -= dt;
        if (a.playerBiteTimer <= 0) { a.playerBiteTimer = 2.0; ctx.damagePlayer(12); ctx.addShake(0.9); sfx.sharkBite(); }
      }
    }

    // ---- lifetime + dissipation ----
    a.life -= dt;
    if (a.life <= 0) {
      a.dissipate += dt;
      a.g.scale.setScalar(Math.max(0.01, 1 - a.dissipate * 1.4));
      if (a.dissipate > 0.75) this.clear();
    }
  }

  maybeShred(d, a, ctx) {
    if (!d.alive) return;
    const dx = d.group.position.x - a.pos.x, dz = d.group.position.z - a.pos.z;
    if (dx * dx + dz * dz < KILL_RADIUS * KILL_RADIUS && d.group.position.y < HEIGHT) {
      if (d.hit(999)) ctx.feathers.burst(d.group.position, d.cfg.feathers);
    }
  }

  // a shark leaps from the funnel toward a nearby bird (or, rarely, the player)
  launchSpinout(a, ctx) {
    const near = [];
    for (const d of ctx.enemies) if (d.alive) near.push(d);
    for (const d of ctx.allies) if (d.alive) near.push(d);
    const cands = near.filter((d) => {
      const dx = d.group.position.x - a.pos.x, dz = d.group.position.z - a.pos.z;
      return dx * dx + dz * dz < SPINOUT_RANGE * SPINOUT_RANGE;
    });
    let targetKind = 'bird', target = null;
    const pdx = ctx.playerPos.x - a.pos.x, pdz = ctx.playerPos.z - a.pos.z;
    const playerNear = pdx * pdx + pdz * pdz < SPINOUT_RANGE * SPINOUT_RANGE;
    const playerAlreadyHunted = this.spinouts.some((s) => s.targetKind === 'player');
    // only ever one shark chasing the player at a time, and prefer birds
    if (playerNear && !playerAlreadyHunted && (!cands.length || Math.random() < 0.18)) {
      targetKind = 'player';
    } else if (cands.length) {
      target = cands[(Math.random() * cands.length) | 0];
    } else {
      return;
    }
    const mesh = this.sharks.build();
    const from = a.pos.clone(); from.y = 5 + Math.random() * (HEIGHT - 8);
    mesh.position.copy(from);
    const aim = (targetKind === 'player' ? ctx.playerPos : target.group.position).clone();
    const dir = aim.sub(from).normalize();
    mesh.lookAt(mesh.position.clone().add(dir));
    this.scene.add(mesh);
    this.spinouts.push({ mesh, vel: dir.multiplyScalar(42), targetKind, target, life: 2.6 });
    sfx.sharkLaunch();
  }

  updateSpinouts(dt, ctx) {
    for (const s of this.spinouts) {
      s.life -= dt;
      const aim = s.targetKind === 'player' ? ctx.playerPos
        : (s.target && s.target.alive ? s.target.group.position : null);
      if (aim) {
        const dir = aim.clone().sub(s.mesh.position);
        const dist = dir.length();
        dir.normalize();
        s.vel.lerp(dir.multiplyScalar(42), Math.min(1, 6 * dt));
        s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
        const reach = s.targetKind === 'player' ? 2.2 : 1.6;
        if (dist < reach) {
          if (s.targetKind === 'player') {
            ctx.damagePlayer(12); ctx.addShake(1.0); sfx.sharkBite();
          } else if (s.target.alive) {
            const color = 0x503000;
            this.sharks.splitInHalf(s.target.group.position, color);
            s.target.hit(999);
            sfx.sharkBite();
          }
          s.life = 0;
        }
      } else {
        s.target = null; // prey gone; keep flying a beat, then expire
      }
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 6 * dt;
    }
    this.spinouts = this.spinouts.filter((s) => {
      if (s.life <= 0 || s.mesh.position.y < 0.2) { this.scene.remove(s.mesh); return false; }
      return true;
    });
  }
}
