// All art is generated at runtime on small canvases. NES-ish 12-color palette.
import * as THREE from 'three';

export const PAL = {
  black: '#000000',
  white: '#fcfcfc',
  gray: '#bcbcbc',
  darkGray: '#7c7c7c',
  green: '#00a800',
  darkGreen: '#005800',
  brown: '#ac7c00',
  darkBrown: '#503000',
  red: '#d82800',
  orange: '#f87800',
  yellow: '#f8b800',
  sky: '#3cbcfc',
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Deterministic-ish speckle helper
function speckle(ctx, size, colors, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(Math.floor(Math.random() * size), Math.floor(Math.random() * size), 1, 1);
  }
}

export function grassTexture(repeat) {
  const [c, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = PAL.green;
  ctx.fillRect(0, 0, 32, 32);
  speckle(ctx, 32, [PAL.darkGreen], 90);
  speckle(ctx, 32, [PAL.yellow], 6);
  return toTexture(c, repeat, repeat);
}

export function trunkTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.brown;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = PAL.darkBrown;
  for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
  speckle(ctx, 16, [PAL.darkBrown], 10);
  return toTexture(c);
}

export function leafTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.darkGreen;
  ctx.fillRect(0, 0, 16, 16);
  speckle(ctx, 16, [PAL.green], 60);
  return toTexture(c);
}

export function stoneTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.gray;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = PAL.darkGray;
  // blocky brick lines
  ctx.fillRect(0, 3, 16, 1);
  ctx.fillRect(0, 8, 16, 1);
  ctx.fillRect(0, 13, 16, 1);
  ctx.fillRect(4, 0, 1, 3);
  ctx.fillRect(11, 4, 1, 4);
  ctx.fillRect(6, 9, 1, 4);
  speckle(ctx, 16, [PAL.white], 8);
  return toTexture(c);
}

export function barnTexture() {
  const [c, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = PAL.darkBrown;
  for (let x = 0; x < 32; x += 8) ctx.fillRect(x, 0, 1, 32);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 30, 32, 2);
  // cross-brace X
  for (let i = 0; i < 28; i++) {
    ctx.fillRect(2 + i, 2 + i, 1, 1);
    ctx.fillRect(29 - i, 2 + i, 1, 1);
  }
  return toTexture(c);
}

export function roofTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.darkGray;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = PAL.black;
  for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
  return toTexture(c);
}

export function skyTexture() {
  const [c, ctx] = makeCanvas(1, 64);
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#0078f8');
  grad.addColorStop(0.6, PAL.sky);
  grad.addColorStop(1, '#a8d8fc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function cloudTexture() {
  const [c, ctx] = makeCanvas(32, 16);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(6, 6, 20, 5);
  ctx.fillRect(10, 3, 8, 3);
  ctx.fillRect(18, 4, 6, 2);
  ctx.fillRect(3, 8, 3, 3);
  ctx.fillRect(26, 8, 3, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function eggTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(5, 2, 6, 12);
  ctx.fillRect(3, 4, 10, 9);
  ctx.fillRect(4, 3, 8, 11);
  ctx.fillStyle = PAL.gray;
  ctx.fillRect(4, 11, 8, 2);
  ctx.fillRect(5, 13, 6, 1);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(6, 4, 3, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function orbTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(4, 2, 8, 12);
  ctx.fillRect(2, 4, 12, 8);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(5, 4, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function muzzleTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(6, 0, 4, 16);
  ctx.fillRect(0, 6, 16, 4);
  ctx.fillRect(3, 3, 10, 10);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(5, 5, 6, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 3x5 pixel font for big banner/title text ----
const FONT = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '110', '100', '110', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '110', '011'],
  R: ['110', '101', '110', '110', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '011'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  0: ['010', '101', '101', '101', '010'],
  1: ['010', '110', '010', '010', '111'],
  2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '110', '101', '010'],
  7: ['111', '001', '010', '010', '010'],
  8: ['010', '101', '010', '101', '010'],
  9: ['010', '101', '011', '001', '110'],
  ' ': ['000', '000', '000', '000', '000'],
};

// Renders text as chunky pixels onto a canvas element (with outline + shadow).
export function pixelTextCanvas(text, scale, color = PAL.white, shadow = PAL.black) {
  const chars = text.toUpperCase().split('');
  const w = chars.length * 4 - 1;
  const h = 5;
  const c = document.createElement('canvas');
  c.width = (w + 1) * scale;
  c.height = (h + 1) * scale;
  const ctx = c.getContext('2d');
  const draw = (col, ox, oy) => {
    ctx.fillStyle = col;
    chars.forEach((ch, ci) => {
      const glyph = FONT[ch] || FONT[' '];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 3; x++) {
          if (glyph[y][x] === '1') {
            ctx.fillRect((ci * 4 + x + ox) * scale, (y + oy) * scale, scale, scale);
          }
        }
      }
    });
  };
  draw(shadow, 1, 1);
  draw(color, 0, 0);
  return c;
}
