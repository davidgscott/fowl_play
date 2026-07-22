// Natural disasters: a wandering tornado (and its shark-infested cousin, the
// SHARKNADO) that sweeps the arena, flinging and shredding birds, allies and
// the player alike. Purely a hazard — it belongs to nobody.
import * as THREE from 'three';
import { sfx } from './audio.js';

const ARENA_R = 62;        // keep the funnel roaming within this radius of the PLAYER
const LIFETIME = 60;       // seconds it spends on the map before dissipating
const TRAVEL = 17;         // horizontal travel speed (fast — a real threat)
// touchdown distance from the player, picked at random in this range. far enough
// that — with the funnel bearing in at TRAVEL (17/s) — you get ~5 seconds to spot
// it and run, and well outside SPINOUT_RANGE (34) so a sharknado never drops you
// straight into the shark zone.
const SPAWN_DIST_MIN = 85;
const SPAWN_DIST_MAX = 100;
const HEIGHT = 44;         // funnel height (towering)
const KILL_RADIUS = 3.4;   // birds sucked into the core are destroyed
const CAPTURE_RADIUS = 4;  // walk this close and the funnel picks you up
const SPINOUT_RANGE = 34;  // sharknado: how far a shark will leap for a bird
const MAX_SPINOUTS = 6;
// player capture: swirl up the outside of the cloud, then hurl out the top
const RISE_TIME = 1.9;     // seconds from grabbed to flung out the top
const SWIRL_SPEED = 9;     // rad/s the player is spun around the funnel
const ORBIT_MIN = 2.6, ORBIT_MAX = 6.5; // orbit radius widens as they rise (outside the cloud)
const THROW_SPEED = 26;    // horizontal fling out the top (plain tornado)
// A sharknado's sharks keep spinning out at anything within SPINOUT_RANGE. A normal
// throw drops you right back inside that ring, where fresh sharks launch and bite you
// to death on landing. So fling the player clear of the bite range with room to spare.
// The throw impulse decays at ~7/s (see main.js movement), so horizontal travel is
// roughly speed / 7; size the speed so even the worst throw angle (back across the
// funnel) still lands well outside the range.
const IMPULSE_FALLOFF = 7;                        // matches the player impulse decay in main.js
const SHARKNADO_SAFE_DIST = SPINOUT_RANGE + 16;   // min distance to land from the funnel
const THROW_SPEED_SHARKNADO = (SHARKNADO_SAFE_DIST + ORBIT_MAX) * IMPULSE_FALLOFF;
const THROW_UP = 6;        // extra upward pop on release
const FALL_DAMAGE = 20;    // taken when they slam back down
const SHARK_BITE = 10;     // per bite during a sharknado ride

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
    const dist = SPAWN_DIST_MIN + Math.random() * (SPAWN_DIST_MAX - SPAWN_DIST_MIN);
    const p = playerPos.clone().add(new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist));
    p.y = 0;
    // spawn relative to the player wherever they roam — the ground follows the
    // player, so there's no fixed arena to clamp back toward (that old origin
    // clamp is what made storms touch down far away once you left the middle)
    const aim = playerPos.clone().sub(p); aim.y = 0;
    if (aim.lengthSq() < 0.01) aim.set(1, 0, 0);
    const vel = aim.normalize().multiplyScalar(TRAVEL);
    model.g.position.copy(p);
    this.scene.add(model.g);
    this.active = {
      type, ...model, pos: p, vel, life: LIFETIME,
      steerTimer: 1.2, spinTimer: 0.6, dissipate: 0,
      capture: null, captureCd: 0,
    };
  }

  clear() {
    if (this.active) {
      this.scene.remove(this.active.g);
      if (this.active.capture) this.active.capture.release(); // don't leave the player frozen
    }
    for (const s of this.spinouts) this.scene.remove(s.mesh);
    this.active = null;
    this.spinouts = [];
  }

  // Walk into the funnel and it grabs you: you get swirled up the outside of the
  // cloud and flung out the top in a random direction (fall damage on landing).
  // A sharknado bites you 1-3 times on the way up — never a guaranteed kill.
  updateCapture(dt, a, ctx) {
    a.captureCd = Math.max(0, a.captureCd - dt);
    if (!a.capture) {
      const pdx = ctx.playerPos.x - a.pos.x, pdz = ctx.playerPos.z - a.pos.z;
      if (a.captureCd <= 0 && pdx * pdx + pdz * pdz < CAPTURE_RADIUS * CAPTURE_RADIUS && ctx.playerPos.y < HEIGHT * 0.6) {
        a.capture = {
          t: 0, angle: Math.atan2(pdz, pdx), startY: ctx.playerPos.y,
          bites: a.type === 'sharknado' ? 1 + Math.floor(Math.random() * 3) : 0, // 1..3
          biteTimer: RISE_TIME * 0.35,
          release: () => { ctx.setHeld(false); },
        };
        ctx.setHeld(true);
        ctx.addShake(0.8);
        sfx.lunge(); // whoosh as it snatches you up
      }
      return;
    }

    const cap = a.capture;
    cap.t += dt / RISE_TIME;
    cap.angle += SWIRL_SPEED * dt;
    const climb = Math.min(1, cap.t);
    const y = cap.startY + (HEIGHT + 3 - cap.startY) * climb; // rise past the top
    const orbitR = ORBIT_MIN + (ORBIT_MAX - ORBIT_MIN) * climb; // widen up the cloud
    ctx.setPlayerPos(a.pos.x + Math.cos(cap.angle) * orbitR, y, a.pos.z + Math.sin(cap.angle) * orbitR);
    ctx.addShake(0.3);

    // sharknado bites, spaced across the ride
    if (cap.bites > 0) {
      cap.biteTimer -= dt;
      if (cap.biteTimer <= 0) {
        cap.bites--;
        cap.biteTimer = RISE_TIME / 3.2;
        ctx.damagePlayer(SHARK_BITE);
        ctx.addShake(0.9);
        sfx.sharkBite();
      }
    }

    if (cap.t >= 1) {
      // hurl out the top in a random direction; gravity + landing do the rest.
      // a sharknado throws you much farther so you land clear of the sharks' reach.
      const dir = Math.random() * Math.PI * 2;
      const speed = a.type === 'sharknado' ? THROW_SPEED_SHARKNADO : THROW_SPEED;
      ctx.throwPlayer(Math.cos(dir) * speed, Math.sin(dir) * speed, THROW_UP, FALL_DAMAGE);
      ctx.addShake(1.0);
      sfx.lunge();
      a.capture = null;
      a.captureCd = 2.5; // brief grace so it doesn't instantly re-grab
    }
  }

  // ctx: { playerPos, enemies, allies, feathers, damagePlayer, addShake,
  //        setHeld(bool), setPlayerPos(x,y,z), throwPlayer(vx,vz,up,fallDmg) }
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
    // steer back toward the player if it wanders too far — keeps the storm a
    // threat in your vicinity wherever you roam (rather than drifting to origin)
    const px = ctx.playerPos.x, pz = ctx.playerPos.z;
    if (Math.hypot(a.pos.x - px, a.pos.z - pz) > ARENA_R) {
      const back = new THREE.Vector3(px - a.pos.x, 0, pz - a.pos.z).normalize().multiplyScalar(TRAVEL);
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

    // ---- pick up + swirl + fling the player ----
    this.updateCapture(dt, a, ctx);

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
    // don't pile spin-out sharks onto the player while they're already being
    // chewed on inside a capture — the 1-3 capture bites are the whole budget
    if (playerNear && !a.capture && !playerAlreadyHunted && (!cands.length || Math.random() < 0.18)) {
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
            // if a capture started mid-flight, don't double up on bites
            if (!(this.active && this.active.capture)) { ctx.damagePlayer(12); ctx.addShake(1.0); sfx.sharkBite(); }
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
