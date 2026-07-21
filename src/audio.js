// All sound effects synthesized with the Web Audio API. No audio files.
let ctx = null;
let master = null, comp = null, reverb = null;
let curveSoft = null, curveHard = null, curveTanh = null;

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
  curveTanh = makeTanh(4);
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

// smoother tanh saturation curve (warmer than the rational one) - used for
// realistic gunshot cracks
function makeTanh(k) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(k * x);
  }
  return curve;
}

function pickCurve(shaper) {
  return shaper === 3 ? curveTanh : shaper === 2 ? curveHard : curveSoft;
}

// fill a buffer with white, pink (~-3dB/oct) or brown (~-6dB/oct) noise. Colored
// noise gives cracks a natural spectral tilt instead of flat white.
function fillNoise(data, color) {
  const len = data.length;
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5; }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
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
    ws.curve = pickCurve(shaper);
    osc.connect(ws).connect(gain);
  } else {
    osc.connect(gain);
  }
  routeOut(gain, reverbMix, pan);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// `hp` (highpass cutoff) turns the lowpass into a band-pass, isolating a crack
// band with no low mud. `color` picks white/pink/brown noise.
function noise({ dur = 0.15, vol = 0.12, filterFrom = 4000, filterTo = 400, hp = 0, color = 'white', delay = 0, attack = 0, shaper = 0, reverbMix = 0, pan = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  fillNoise(buf.getChannelData(0), color);
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
  let head = src;
  if (hp) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    hpf.Q.value = 0.7;
    head.connect(hpf);
    head = hpf;
  }
  head.connect(filter);
  if (shaper) {
    const ws = ctx.createWaveShaper();
    ws.curve = pickCurve(shaper);
    filter.connect(ws).connect(gain);
  } else {
    filter.connect(gain);
  }
  routeOut(gain, reverbMix, pan);
  src.start(t0);
}

// A continuous, low-passed noise bed whose volume *pulsates* via an LFO and
// decays to a small floor above zero -> a rolling echo that swells and recedes
// (rather than on/off bursts) and never falls completely silent.
function echoTail({ dur = 1.7, vol = 0.12, floor = 0.012, filterFrom = 2400, filterTo = 100, color = 'pink', lfoHz = 3, lfoDepth = 0.6, delay = 0, reverbMix = 0.5 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  fillNoise(buf.getChannelData(0), color);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterTo), t0 + dur);
  const gain = ctx.createGain();
  // base level decays to a floor > 0 (the underlying static that never hits zero)
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, floor), t0 + dur);
  // an LFO adds a smooth swell on top; its depth (< base) decays with the tail,
  // so the composite level pulsates but stays positive
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(lfoHz, t0);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(vol * lfoDepth, t0);
  lfoGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, floor * lfoDepth), t0 + dur);
  lfo.connect(lfoGain).connect(gain.gain);
  src.connect(filter).connect(gain);
  routeOut(gain, reverbMix, 0);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.02);
}

export const sfx = {
  blaster() {
    // MP40-matched gunshot: band-passed pink-noise crack (no low mud) through
    // tanh saturation, a clean low thump, a mid "pap" resonance, and a ring-off tail
    noise({ dur: 0.005, vol: 0.24, hp: 3500, filterFrom: 15000, filterTo: 8000, color: 'white' });   // sharp transient
    noise({ dur: 0.10, vol: 0.28, hp: 900, filterFrom: 4500, filterTo: 1300, color: 'pink', attack: 0.0004, shaper: 3 });
    noise({ dur: 0.04, vol: 0.13, hp: 1300, filterFrom: 2300, filterTo: 1500, color: 'pink', shaper: 3 });
    tone({ type: 'triangle', from: 200, to: 110, dur: 0.05, vol: 0.2, attack: 0.0004 });               // ~118Hz thump
    noise({ dur: 0.20, vol: 0.06, hp: 400, filterFrom: 1800, filterTo: 280, color: 'pink', reverbMix: 0.5, delay: 0.04 }); // tail
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
    // triumphant little "unit acquired" sting: a quick C-major run up to a held
    // top C with the whole triad ringing under it, capped by a bright sparkle
    tone({ type: 'square', from: 523, to: 523, dur: 0.09, vol: 0.12, delay: 0.00 });   // C5
    tone({ type: 'square', from: 659, to: 659, dur: 0.09, vol: 0.12, delay: 0.09 });   // E5
    tone({ type: 'square', from: 784, to: 784, dur: 0.10, vol: 0.12, delay: 0.18 });   // G5
    // resolve: held top C with a triad underneath for a full, victorious chord
    tone({ type: 'square',   from: 1047, to: 1047, dur: 0.42, vol: 0.13, attack: 0.005, delay: 0.28 }); // C6
    tone({ type: 'triangle', from: 659,  to: 659,  dur: 0.42, vol: 0.09, attack: 0.005, delay: 0.28 }); // E5
    tone({ type: 'triangle', from: 784,  to: 784,  dur: 0.42, vol: 0.09, attack: 0.005, delay: 0.28 }); // G5
    tone({ type: 'triangle', from: 523,  to: 523,  dur: 0.42, vol: 0.08, attack: 0.005, delay: 0.28 }); // C5 body
    noise({ dur: 0.16, vol: 0.06, hp: 6000, filterFrom: 15000, filterTo: 7000, color: 'white', delay: 0.28 }); // sparkle
  },
  buy() {
    tone({ type: 'square', from: 900, to: 900, dur: 0.06, vol: 0.12 });
    tone({ type: 'square', from: 1350, to: 1350, dur: 0.08, vol: 0.12, delay: 0.07 });
  },
  deny() {
    tone({ type: 'sawtooth', from: 160, to: 120, dur: 0.18, vol: 0.12 });
  },
  sniper() {
    // same MP40 report, bigger: deep sub-bass + a rolling hillside echo
    noise({ dur: 0.006, vol: 0.28, hp: 3500, filterFrom: 16000, filterTo: 8000, color: 'white' });    // sharp crack front
    noise({ dur: 0.13, vol: 0.30, hp: 800, filterFrom: 5000, filterTo: 1200, color: 'pink', attack: 0.0004, shaper: 3 });
    noise({ dur: 0.04, vol: 0.15, hp: 1300, filterFrom: 2300, filterTo: 1500, color: 'pink', shaper: 3 });
    tone({ type: 'triangle', from: 200, to: 70, dur: 0.14, vol: 0.26, attack: 0.0004 });               // big body
    tone({ type: 'sine', from: 90, to: 34, dur: 0.24, vol: 0.22 });                                    // deep sub
    // first distinct return off the nearest hill
    noise({ dur: 0.14, vol: 0.11, hp: 250, filterFrom: 2000, filterTo: 260, color: 'pink', reverbMix: 0.55, delay: 0.13 });
    // rolling hillside echo: a pulsating (swelling) muffled bed that decays
    echoTail({ dur: 1.9, vol: 0.12, floor: 0.011, filterFrom: 2200, filterTo: 110, color: 'pink', lfoHz: 3, lfoDepth: 0.65, delay: 0.12, reverbMix: 0.6 });
    // underlying static hiss so the tail never falls to silence (kept subtle)
    echoTail({ dur: 2.0, vol: 0.021, floor: 0.012, filterFrom: 5200, filterTo: 2600, color: 'white', lfoHz: 2, lfoDepth: 0.3, delay: 0.06, reverbMix: 0.15 });
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
    // the MP40 is a submachine gun, so each round is the gun's pop, tightened
    noise({ dur: 0.004, vol: 0.2, hp: 4000, filterFrom: 15000, filterTo: 9000, color: 'white' });      // snap
    noise({ dur: 0.07, vol: 0.22, hp: 950, filterFrom: 4500, filterTo: 1400, color: 'pink', attack: 0.0004, shaper: 3 });
    noise({ dur: 0.028, vol: 0.10, hp: 1300, filterFrom: 2200, filterTo: 1500, color: 'pink', shaper: 3 });
    tone({ type: 'triangle', from: 200, to: 110, dur: 0.04, vol: 0.15 });
    noise({ dur: 0.10, vol: 0.04, hp: 500, filterFrom: 1600, filterTo: 320, color: 'pink', reverbMix: 0.35, delay: 0.03 }); // short tail
  },
  flame() {
    noise({ dur: 0.12, vol: 0.045, filterFrom: 900, filterTo: 300 });
  },
  flyingV() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => tone({ type: 'square', from: f, to: f, dur: 0.13, vol: 0.14, delay: i * 0.075 }));
  },
  // A short, heroic fanfare for the flying-V attack — brassy lead + marching
  // bass + drum hits, landing on a big held tonic. ~2.8s to match V_DURATION.
  flyingVFanfare() {
    // brass lead (sawtooth = brass bite): G-G-G pickup, up through the triad,
    // to a soaring held G, a quick turn, and a big final G octave
    const lead = [
      [392, 0.00, 0.14], [392, 0.16, 0.12],                // G4 G4 pickup
      [523, 0.30, 0.28], [659, 0.60, 0.28],                // C5 E5
      [784, 0.90, 0.52],                                   // G5 held
      [698, 1.46, 0.20], [659, 1.68, 0.20], [784, 1.90, 0.90], // F5 E5, big G5 finish
    ];
    for (const [f, t, d] of lead) {
      tone({ type: 'sawtooth', from: f, to: f, dur: d, vol: 0.11, attack: 0.006, delay: t, shaper: 3 });
      tone({ type: 'square',   from: f, to: f, dur: d, vol: 0.05, attack: 0.006, delay: t }); // reinforce
    }
    // triumphant octave on the final held note
    tone({ type: 'square', from: 1568, to: 1568, dur: 0.90, vol: 0.06, attack: 0.01, delay: 1.90 }); // G6 sparkle
    // marching bass line (root motion C - G - C - C)
    const bass = [[131, 0.30, 0.56], [98, 0.90, 0.52], [131, 1.46, 0.42], [131, 1.90, 0.92]];
    for (const [f, t, d] of bass) {
      tone({ type: 'triangle', from: f, to: f, dur: d, vol: 0.20, attack: 0.005, delay: t });
      tone({ type: 'square',   from: f, to: f, dur: d, vol: 0.06, attack: 0.005, delay: t });
    }
    // drum drive: a low tom thump + snare crack on the accents
    const hits = [0.00, 0.30, 0.60, 0.90, 1.46, 1.90];
    for (const t of hits) {
      tone({ type: 'sine', from: 160, to: 55, dur: 0.10, vol: 0.16, attack: 0.001, delay: t });          // tom
      noise({ dur: 0.07, vol: 0.10, hp: 2000, filterFrom: 8000, filterTo: 2000, color: 'white', delay: t }); // snare
    }
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
