// ---------- touch / mobile controls ----------
// This whole layer is inert on desktop: initMobileControls() returns null unless
// the device is touch-capable, so the mouse/keyboard code path is never touched.
//
// Layout follows Call of Duty Mobile: the left half of the screen is a floating
// movement stick (drag a thumb anywhere to walk), the right half is free-look
// AND tap-to-fire. Dedicated fire buttons sit on both the left and right so you
// can strafe-and-shoot, ADS is a tap toggle, and the weapon list collapses to a
// single chip that opens a quick-select grid.

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

// A touch in the look zone counts as a "tap to fire" only if the thumb never
// travels past this many pixels — anything more is a look-drag, not a shot.
const TAP_SLOP = 12;

// Current weapon short-labels, in unlock/hotkey order, for the quick-select grid.
const WEAPON_LIST = [
  ['gun', 'GUN'], ['shotgun', 'SHOT'], ['knife', 'KNIFE'], ['bread', 'BREAD'],
  ['mg', 'MG'], ['flame', 'FIRE'], ['flak', 'FLAK'], ['sniper', 'SNIPE'],
  ['shark', 'SHARK'], ['breadsniper', 'B.SNP'],
];
const WEAPON_LABEL = Object.fromEntries(WEAPON_LIST);

/**
 * @param api {{
 *   keys: Record<string, boolean>,
 *   look: (dx:number, dy:number) => void,
 *   shoot: () => void,
 *   grapple: () => void,
 *   lunge: () => void,
 *   setFire: (down: boolean) => void,
 *   setScope: (on: boolean) => void,
 *   setWeapon: (id: string) => void,
 *   togglePause: () => void,
 * }}
 * @returns {null | { frame: (state:string, weapons:object, weaponId:string) => void }}
 */
export function initMobileControls(api) {
  if (!isTouchDevice) return null;

  document.body.classList.add('touch');

  const quickGrid = WEAPON_LIST
    .map(([id, label]) => `<button class="mc-wpn" data-wpn="${id}">${label}</button>`)
    .join('');

  const root = document.createElement('div');
  root.id = 'mc';
  root.className = 'hidden';
  root.innerHTML = `
    <div id="mc-move">
      <div id="mc-stick" class="hidden"><div id="mc-knob"></div></div>
    </div>
    <div id="mc-look"></div>
    <button id="mc-pause" class="mc-btn mc-corner" aria-label="Pause">II</button>

    <button id="mc-fire-left" class="mc-btn mc-small" aria-label="Fire">FIRE</button>
    <button id="mc-weapon" class="mc-btn" aria-label="Weapons">GUN</button>

    <div id="mc-actions">
      <button id="mc-ads" class="mc-btn mc-small" aria-label="Aim down sights">ADS</button>
      <button id="mc-grapple" class="mc-btn mc-small" aria-label="Grapple">GRPL</button>
      <button id="mc-lunge" class="mc-btn mc-small" aria-label="Lunge">LUNGE</button>
      <button id="mc-jump" class="mc-btn mc-small" aria-label="Jump">JUMP</button>
      <button id="mc-fire" class="mc-btn mc-fire" aria-label="Fire">FIRE</button>
    </div>

    <div id="mc-quick" class="hidden">
      <div id="mc-quick-grid">${quickGrid}</div>
    </div>
  `;
  document.body.appendChild(root);

  const moveZone = root.querySelector('#mc-move');
  const stick = root.querySelector('#mc-stick');
  const knob = root.querySelector('#mc-knob');
  const lookZone = root.querySelector('#mc-look');
  const adsBtn = root.querySelector('#mc-ads');
  const weaponChip = root.querySelector('#mc-weapon');
  const quick = root.querySelector('#mc-quick');

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

  // ----- look drag + tap-to-fire -----
  // A single touch in the right half both looks (while dragging) and fires (if
  // it lands and lifts without travelling — CoD's "tap to shoot").
  // lookX/lookY track the previous point for incremental look deltas; startX/
  // startY is the touch-down anchor, used only to decide tap-vs-drag.
  let lookId = null, lookX = 0, lookY = 0, startX = 0, startY = 0, lookMoved = false;

  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookX = startX = t.clientX; lookY = startY = t.clientY;
    lookMoved = false;
  }, { passive: false });

  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        if (!lookMoved && Math.hypot(t.clientX - startX, t.clientY - startY) > TAP_SLOP) {
          lookMoved = true; // travelled far enough: this is a look, not a tap
        }
        api.look((t.clientX - lookX) * LOOK_SENS, (t.clientY - lookY) * LOOK_SENS);
        lookX = t.clientX; lookY = t.clientY;
      }
    }
  }, { passive: false });

  function endLook(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        if (!lookMoved) api.shoot(); // a stationary tap fires one round
        lookId = null;
      }
    }
  }
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  });

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

  // Either fire button (left or right) drives the held-fire state; the stream/
  // full-auto weapons keep going as long as at least one is down.
  let fireButtons = 0;
  function pressFire() {
    if (fireButtons === 0) { api.setFire(true); api.shoot(); }
    fireButtons++;
  }
  function releaseFire() {
    fireButtons = Math.max(0, fireButtons - 1);
    if (fireButtons === 0) api.setFire(false);
  }
  bindButton(root.querySelector('#mc-fire'), pressFire, releaseFire);
  bindButton(root.querySelector('#mc-fire-left'), pressFire, releaseFire);

  bindButton(root.querySelector('#mc-jump'),
    () => { api.keys['Space'] = true; },
    () => { api.keys['Space'] = false; });

  // ADS is a tap toggle: tap to aim down sights (zoom + steadier look), tap to
  // drop back to the hip. Works on every weapon — a true scope for the snipers,
  // a mild zoom for everything else.
  let adsOn = false;
  function setAds(on) {
    adsOn = on;
    api.setScope(on);
    adsBtn.classList.toggle('active', on);
  }
  bindButton(adsBtn, () => setAds(!adsOn));

  bindButton(root.querySelector('#mc-grapple'), () => api.grapple());
  bindButton(root.querySelector('#mc-lunge'), () => api.lunge());
  bindButton(root.querySelector('#mc-pause'), () => api.togglePause());

  // ----- weapon quick-select -----
  // The chip shows the current weapon; tapping it opens a grid of every unlocked
  // weapon. Picking one (or tapping the backdrop) closes the grid again.
  function openQuick() { quick.classList.remove('hidden'); }
  function closeQuick() { quick.classList.add('hidden'); }
  bindButton(weaponChip, () => {
    if (quick.classList.contains('hidden')) openQuick(); else closeQuick();
  });
  // tap on the dimmed backdrop (but not the grid itself) dismisses
  quick.addEventListener('touchstart', (e) => {
    if (e.target === quick) { e.preventDefault(); closeQuick(); }
  }, { passive: false });

  const wpnButtons = Array.from(root.querySelectorAll('.mc-wpn'));
  for (const btn of wpnButtons) {
    bindButton(btn, () => {
      if (!btn.classList.contains('locked')) { api.setWeapon(btn.dataset.wpn); closeQuick(); }
    });
  }

  // fully reset the transient control state (used when leaving the playing state)
  function resetHeld() {
    moveId = null;
    stick.classList.add('hidden');
    clearMoveKeys();
    api.keys['Space'] = false;
    fireButtons = 0;
    api.setFire(false);
    setAds(false);
    closeQuick();
  }

  let lastWeapon = null;

  // ----- per-frame refresh: visibility + button state -----
  return {
    frame(state, weapons, weaponId) {
      const playing = state === 'playing';
      root.classList.toggle('hidden', !playing);
      if (!playing) {
        // Don't let a held joystick/jump/ADS keep driving the player while
        // paused, in the shop, or on a menu screen.
        if (moveId !== null || api.keys['Space'] || fireButtons || adsOn) resetHeld();
        return;
      }

      // switching weapons drops you back to the hip (a held toggle would carry
      // a sniper zoom onto the pistol, which feels wrong)
      if (weaponId !== lastWeapon) {
        if (adsOn) setAds(false);
        lastWeapon = weaponId;
      }

      // reflect the live weapon on the chip
      weaponChip.textContent = WEAPON_LABEL[weaponId] || weaponId.toUpperCase();

      // hold-to-fire (respects each weapon's own cooldown)
      if (fireButtons > 0) api.shoot();

      for (const btn of wpnButtons) {
        const w = weapons[btn.dataset.wpn];
        btn.classList.toggle('locked', !w.unlocked);
        btn.classList.toggle('active', btn.dataset.wpn === weaponId);
      }
    },
  };
}
