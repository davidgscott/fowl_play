// All sound effects synthesized with the Web Audio API. No audio files.
let ctx = null;
let master = null, comp = null, reverb = null;
let curveSoft = null, curveHard = null;

const MASTER_GAIN = 0.9;

export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    buildBus();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// ---- master bus: every voice -> master gain -> limiter -> speakers ----
// A single compressor acts as a brick-wall-ish limiter so the louder, layered
// "juice" SFX and full-auto stacks never clip the output.
function buildBus() {
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master.connect(comp).connect(ctx.destination);

  // one shared reverb for impact "body" / tails
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(0.32, 2.4);
  reverb.connect(master);

  curveSoft = makeCurve(12);
  curveHard = makeCurve(60);
}

// short synthetic impulse response for a hint of room + tail
function makeImpulse(dur, decay) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// waveshaper distortion curve; higher k = more grit
function makeCurve(k) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// connect a voice's final gain to the bus, with optional reverb send + panning
function routeOut(node, reverbMix, pan) {
  if (!master) { node.connect(ctx.destination); return; } // safety if bus absent
  let out = node;
  if (pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    out = p;
  }
  out.connect(master);
  if (reverbMix > 0 && reverb) {
    const send = ctx.createGain();
    send.gain.value = reverbMix;
    out.connect(send).connect(reverb);
  }
}

function tone({ type = 'square', from = 440, to = 440, dur = 0.1, vol = 0.15, delay = 0, attack = 0, shaper = 0, reverbMix = 0, pan = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  if (attack > 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(attack, dur * 0.9));
  } else {
    gain.gain.setValueAtTime(vol, t0);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  if (shaper) {
    const ws = ctx.createWaveShaper();
    ws.curve = shaper === 2 ? curveHard : curveSoft;
    osc.connect(ws).connect(gain);
  } else {
    osc.connect(gain);
  }
  routeOut(gain, reverbMix, pan);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, filterFrom = 4000, filterTo = 400, delay = 0, attack = 0, shaper = 0, reverbMix = 0, pan = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterTo), t0 + dur);
  const gain = ctx.createGain();
  if (attack > 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(attack, dur * 0.9));
  } else {
    gain.gain.setValueAtTime(vol, t0);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  if (shaper) {
    const ws = ctx.createWaveShaper();
    ws.curve = shaper === 2 ? curveHard : curveSoft;
    filter.connect(ws).connect(gain);
  } else {
    filter.connect(gain);
  }
  routeOut(gain, reverbMix, pan);
  src.start(t0);
}

export const sfx = {
  blaster() {
    tone({ type: 'square', from: 900, to: 120, dur: 0.12, vol: 0.18 });
    noise({ dur: 0.08, vol: 0.1, filterFrom: 6000, filterTo: 800 });
  },
  grapple() {
    tone({ type: 'square', from: 200, to: 1400, dur: 0.25, vol: 0.12 });
  },
  grappleHit() {
    tone({ type: 'square', from: 1200, to: 300, dur: 0.1, vol: 0.12 });
  },
  lunge() {
    noise({ dur: 0.25, vol: 0.15, filterFrom: 2500, filterTo: 200 });
  },
  shotgun() {
    tone({ type: 'square', from: 300, to: 60, dur: 0.2, vol: 0.2 });
    noise({ dur: 0.25, vol: 0.22, filterFrom: 3000, filterTo: 200 });
  },
  reload() {
    tone({ type: 'square', from: 700, to: 700, dur: 0.05, vol: 0.1 });
    tone({ type: 'square', from: 500, to: 500, dur: 0.05, vol: 0.1, delay: 0.15 });
    tone({ type: 'square', from: 900, to: 900, dur: 0.06, vol: 0.1, delay: 0.45 });
  },
  knife() {
    noise({ dur: 0.15, vol: 0.12, filterFrom: 7000, filterTo: 1500 });
    tone({ type: 'sawtooth', from: 1200, to: 400, dur: 0.12, vol: 0.06 });
  },
  bombDrop() {
    tone({ type: 'sine', from: 1400, to: 300, dur: 0.7, vol: 0.08 });
  },
  explosion() {
    noise({ dur: 0.5, vol: 0.25, filterFrom: 1200, filterTo: 60 });
    tone({ type: 'sawtooth', from: 90, to: 30, dur: 0.4, vol: 0.18 });
  },
  breadThrow() {
    noise({ dur: 0.12, vol: 0.08, filterFrom: 3000, filterTo: 800 });
  },
  recruit() {
    tone({ type: 'square', from: 480, to: 380, dur: 0.08, vol: 0.1 });
    tone({ type: 'square', from: 523, to: 523, dur: 0.1, vol: 0.12, delay: 0.12 });
    tone({ type: 'square', from: 784, to: 784, dur: 0.1, vol: 0.12, delay: 0.22 });
    tone({ type: 'square', from: 1047, to: 1047, dur: 0.15, vol: 0.12, delay: 0.32 });
  },
  buy() {
    tone({ type: 'square', from: 900, to: 900, dur: 0.06, vol: 0.12 });
    tone({ type: 'square', from: 1350, to: 1350, dur: 0.08, vol: 0.12, delay: 0.07 });
  },
  deny() {
    tone({ type: 'sawtooth', from: 160, to: 120, dur: 0.18, vol: 0.12 });
  },
  sniper() {
    tone({ type: 'square', from: 1600, to: 90, dur: 0.3, vol: 0.22 });
    noise({ dur: 0.4, vol: 0.2, filterFrom: 5000, filterTo: 120 });
    tone({ type: 'sine', from: 220, to: 60, dur: 0.5, vol: 0.1, delay: 0.05 }); // tail crack
  },
  scope() {
    tone({ type: 'square', from: 1200, to: 1600, dur: 0.05, vol: 0.06 });
  },
  sharkLaunch() {
    tone({ type: 'sawtooth', from: 120, to: 480, dur: 0.35, vol: 0.16 });
    noise({ dur: 0.3, vol: 0.14, filterFrom: 1800, filterTo: 400 });
  },
  sharkChomp() {
    tone({ type: 'square', from: 300, to: 80, dur: 0.12, vol: 0.18 });
    noise({ dur: 0.18, vol: 0.16, filterFrom: 2500, filterTo: 300 });
  },
  sharkBite() {
    // wet crunch, then the two halves coming apart
    noise({ dur: 0.35, vol: 0.26, filterFrom: 1600, filterTo: 80 });
    tone({ type: 'sawtooth', from: 200, to: 40, dur: 0.3, vol: 0.2 });
    tone({ type: 'square', from: 700, to: 90, dur: 0.22, vol: 0.14, delay: 0.12 });
  },
  machineGun() {
    tone({ type: 'square', from: 700, to: 160, dur: 0.06, vol: 0.09 });
    noise({ dur: 0.05, vol: 0.06, filterFrom: 5000, filterTo: 900 });
  },
  flame() {
    noise({ dur: 0.12, vol: 0.045, filterFrom: 900, filterTo: 300 });
  },
  flyingV() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: 0.13, vol: 0.14, delay: i * 0.075 }));
  },
  screech() {
    tone({ type: 'sawtooth', from: 900, to: 1500, dur: 0.22, vol: 0.1 });
    tone({ type: 'sawtooth', from: 1400, to: 600, dur: 0.3, vol: 0.09, delay: 0.2 });
  },
  quack() {
    tone({ type: 'square', from: 480, to: 380, dur: 0.08, vol: 0.1 });
    tone({ type: 'square', from: 360, to: 280, dur: 0.1, vol: 0.1, delay: 0.09 });
  },
  honk() {
    // lower, throatier than a quack - the goose
    tone({ type: 'sawtooth', from: 240, to: 150, dur: 0.2, vol: 0.13 });
    tone({ type: 'sawtooth', from: 170, to: 110, dur: 0.22, vol: 0.11, delay: 0.16 });
  },
  flak() {
    // quad-cannon thump: metallic bark + low boom
    tone({ type: 'square', from: 220, to: 60, dur: 0.16, vol: 0.2 });
    tone({ type: 'square', from: 140, to: 45, dur: 0.12, vol: 0.14, delay: 0.04 });
    noise({ dur: 0.18, vol: 0.16, filterFrom: 2200, filterTo: 200 });
  },
  flakBurst() {
    // airburst pop high in the sky
    noise({ dur: 0.3, vol: 0.2, filterFrom: 1600, filterTo: 90 });
    tone({ type: 'sawtooth', from: 80, to: 32, dur: 0.28, vol: 0.14 });
  },
  deathQuack() {
    tone({ type: 'square', from: 600, to: 100, dur: 0.35, vol: 0.14 });
    tone({ type: 'square', from: 300, to: 60, dur: 0.35, vol: 0.08, delay: 0.05 });
  },

  // ---- combat "juice" confirms (play when the player's shot connects) ----
  hitConfirm() {
    // crisp universal "thock" so every connecting shot feels like it landed
    tone({ type: 'square', from: 420, to: 180, dur: 0.05, vol: 0.16, attack: 0.002 });
    noise({ dur: 0.05, vol: 0.11, filterFrom: 3200, filterTo: 500 });
    tone({ type: 'sine', from: 150, to: 70, dur: 0.07, vol: 0.10 }); // sub thump
  },
  kill() {
    // meaty splat, layered under the duck's own deathQuack
    tone({ type: 'square', from: 260, to: 60, dur: 0.14, vol: 0.20, shaper: 1 });
    noise({ dur: 0.18, vol: 0.16, filterFrom: 2200, filterTo: 120, reverbMix: 0.25 });
    tone({ type: 'sawtooth', from: 180, to: 40, dur: 0.16, vol: 0.14 });
  },
  headshot() {
    // crunchy crack + a bright bell "ding" you can't miss
    noise({ dur: 0.04, vol: 0.20, filterFrom: 8000, filterTo: 2000, shaper: 2 });
    tone({ type: 'square', from: 1900, to: 1900, dur: 0.02, vol: 0.10 });          // click transient
    tone({ type: 'sine', from: 2093, to: 2093, dur: 0.20, vol: 0.14, reverbMix: 0.45 }); // C7 ding
    tone({ type: 'sine', from: 3136, to: 3136, dur: 0.16, vol: 0.07, delay: 0.01, reverbMix: 0.45 }); // fifth shimmer
  },
  combo(n) {
    // climbs a semitone ladder as kills chain, capped at +1 octave
    const f = 523.25 * Math.pow(2, Math.min(n, 12) / 12);
    tone({ type: 'square', from: f, to: f, dur: 0.09, vol: 0.13, attack: 0.002, reverbMix: 0.2 });
  },
  duckShoot() {
    tone({ type: 'sawtooth', from: 250, to: 700, dur: 0.15, vol: 0.08 });
  },
  hit() {
    tone({ type: 'sawtooth', from: 140, to: 60, dur: 0.25, vol: 0.2 });
    noise({ dur: 0.15, vol: 0.12, filterFrom: 1000, filterTo: 100 });
  },
  jump() {
    tone({ type: 'square', from: 250, to: 500, dur: 0.1, vol: 0.08 });
  },
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: 0.12, vol: 0.12, delay: i * 0.11 }));
  },
  waveClear() {
    const notes = [784, 659, 784, 1047, 1319];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: 0.1, vol: 0.12, delay: i * 0.09 }));
  },
  gameOver() {
    const notes = [392, 330, 262, 196, 131];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f * 0.9, dur: 0.25, vol: 0.14, delay: i * 0.22 }));
  },
};
