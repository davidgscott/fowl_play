// ---------- touch / mobile controls ----------
// This whole layer is inert on desktop: initMobileControls() returns null unless
// the device is touch-capable, so the mouse/keyboard code path is never touched.

export const isTouchDevice =
  (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches) ||
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints || 0) > 0;

// Movement joystick geometry (in CSS pixels).
const STICK_RADIUS = 60;   // max knob travel from the base
const DEAD_ZONE = 18;      // ignore tiny wobbles before a direction registers

// Look sensitivity (radians per pixel dragged). Mouse-look uses 0.0024/px under
// pointer lock; touch drag feels right a touch higher.
const LOOK_SENS = 0.004;

/**
 * @param api {{
 *   keys: Record<string, boolean>,
 *   look: (dx:number, dy:number) => void,
 *   shoot: () => void,
 *   grapple: () => void,
 *   lunge: () => void,
 *   setWeapon: (id: string) => void,
 *   togglePause: () => void,
 * }}
 * @returns {null | { frame: (state:string, weapons:object, weaponId:string) => void }}
 */
export function initMobileControls(api) {
  if (!isTouchDevice) return null;

  document.body.classList.add('touch');

  const root = document.createElement('div');
  root.id = 'mc';
  root.className = 'hidden';
  root.innerHTML = `
    <div id="mc-move">
      <div id="mc-stick" class="hidden"><div id="mc-knob"></div></div>
    </div>
    <div id="mc-look"></div>
    <button id="mc-pause" class="mc-btn mc-corner" aria-label="Pause">II</button>
    <div id="mc-weapons">
      <button class="mc-wpn" data-wpn="gun">GUN</button>
      <button class="mc-wpn" data-wpn="shotgun">SHOT</button>
      <button class="mc-wpn" data-wpn="knife">KNIFE</button>
      <button class="mc-wpn" data-wpn="bread">BREAD</button>
      <button class="mc-wpn" data-wpn="mg">MG</button>
      <button class="mc-wpn" data-wpn="flame">FIRE</button>
      <button class="mc-wpn" data-wpn="flak">FLAK</button>
      <button class="mc-wpn" data-wpn="sniper">SNIPE</button>
      <button class="mc-wpn" data-wpn="shark">SHARK</button>
    </div>
    <div id="mc-actions">
      <button id="mc-scope" class="mc-btn mc-small hidden" aria-label="Scope">SCOPE</button>
      <button id="mc-grapple" class="mc-btn mc-small" aria-label="Grapple">GRPL</button>
      <button id="mc-lunge" class="mc-btn mc-small" aria-label="Lunge">LUNGE</button>
      <button id="mc-jump" class="mc-btn mc-small" aria-label="Jump">JUMP</button>
      <button id="mc-fire" class="mc-btn mc-fire" aria-label="Fire">FIRE</button>
    </div>
  `;
  document.body.appendChild(root);

  const moveZone = root.querySelector('#mc-move');
  const stick = root.querySelector('#mc-stick');
  const knob = root.querySelector('#mc-knob');
  const lookZone = root.querySelector('#mc-look');

  // ----- movement joystick -----
  let moveId = null;
  let baseX = 0, baseY = 0;

  function clearMoveKeys() {
    api.keys['KeyW'] = api.keys['KeyS'] = api.keys['KeyA'] = api.keys['KeyD'] = false;
  }

  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    api.keys['KeyW'] = dy < -DEAD_ZONE;
    api.keys['KeyS'] = dy > DEAD_ZONE;
    api.keys['KeyA'] = dx < -DEAD_ZONE;
    api.keys['KeyD'] = dx > DEAD_ZONE;
  }

  moveZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (moveId !== null) return;
    const t = e.changedTouches[0];
    moveId = t.identifier;
    baseX = t.clientX; baseY = t.clientY;
    stick.style.left = `${baseX}px`;
    stick.style.top = `${baseY}px`;
    stick.classList.remove('hidden');
    setStick(0, 0);
  }, { passive: false });

  moveZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) setStick(t.clientX - baseX, t.clientY - baseY);
    }
  }, { passive: false });

  function endMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        stick.classList.add('hidden');
        knob.style.transform = 'translate(0,0)';
        clearMoveKeys();
      }
    }
  }
  moveZone.addEventListener('touchend', endMove);
  moveZone.addEventListener('touchcancel', endMove);

  // ----- look drag -----
  let lookId = null, lookX = 0, lookY = 0;

  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookX = t.clientX; lookY = t.clientY;
  }, { passive: false });

  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        api.look((t.clientX - lookX) * LOOK_SENS, (t.clientY - lookY) * LOOK_SENS);
        lookX = t.clientX; lookY = t.clientY;
      }
    }
  }, { passive: false });

  function endLook(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) lookId = null;
    }
  }
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', endLook);

  // ----- action buttons -----
  // A momentary button: fires `press` on touchstart, `release` on touchend, and
  // adds a pressed class for visual feedback.
  function bindButton(el, press, release) {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      if (press) press();
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      if (release) release();
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  }

  let fireHeld = false;
  bindButton(root.querySelector('#mc-fire'),
    () => { fireHeld = true; api.setFire(true); api.shoot(); },
    () => { fireHeld = false; api.setFire(false); });
  bindButton(root.querySelector('#mc-jump'),
    () => { api.keys['Space'] = true; },
    () => { api.keys['Space'] = false; });
  // hold to scope, same as SHIFT on desktop
  const scopeBtn = root.querySelector('#mc-scope');
  bindButton(scopeBtn,
    () => { api.setScope(true); scopeBtn.classList.add('active'); },
    () => { api.setScope(false); scopeBtn.classList.remove('active'); });
  bindButton(root.querySelector('#mc-grapple'), () => api.grapple());
  bindButton(root.querySelector('#mc-lunge'), () => api.lunge());
  bindButton(root.querySelector('#mc-pause'), () => api.togglePause());

  root.querySelectorAll('.mc-wpn').forEach((btn) => {
    bindButton(btn, () => api.setWeapon(btn.dataset.wpn));
  });

  const wpnButtons = Array.from(root.querySelectorAll('.mc-wpn'));

  // ----- per-frame refresh: visibility + button state -----
  return {
    frame(state, weapons, weaponId) {
      const playing = state === 'playing';
      root.classList.toggle('hidden', !playing);
      if (!playing) {
        // Don't let a held joystick/jump keep driving the player while paused,
        // in the shop, or on a menu screen.
        if (moveId !== null || api.keys['Space']) {
          moveId = null;
          stick.classList.add('hidden');
          clearMoveKeys();
          api.keys['Space'] = false;
          fireHeld = false;
          api.setFire(false);
          api.setScope(false);
          scopeBtn.classList.remove('active');
        }
        return;
      }
      // the scope button only makes sense with the rifle out
      scopeBtn.classList.toggle('hidden', weaponId !== 'sniper');
      if (weaponId !== 'sniper') {
        api.setScope(false);
        scopeBtn.classList.remove('active');
      }
      // hold-to-fire (respects each weapon's own cooldown)
      if (fireHeld) api.shoot();

      for (const btn of wpnButtons) {
        const w = weapons[btn.dataset.wpn];
        btn.classList.toggle('locked', !w.unlocked);
        btn.classList.toggle('active', btn.dataset.wpn === weaponId);
      }
    },
  };
}
