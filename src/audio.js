// All sound effects synthesized with the Web Audio API. No audio files.
let ctx = null;

export function initAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ type = 'square', from = 440, to = 440, dur = 0.1, vol = 0.15, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, filterFrom = 4000, filterTo = 400, delay = 0 }) {
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
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
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
  quack() {
    tone({ type: 'square', from: 480, to: 380, dur: 0.08, vol: 0.1 });
    tone({ type: 'square', from: 360, to: 280, dur: 0.1, vol: 0.1, delay: 0.09 });
  },
  deathQuack() {
    tone({ type: 'square', from: 600, to: 100, dur: 0.35, vol: 0.14 });
    tone({ type: 'square', from: 300, to: 60, dur: 0.35, vol: 0.08, delay: 0.05 });
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
