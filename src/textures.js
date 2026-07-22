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

export function flameTexture() {
  const [c, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(3, 2, 10, 13);
  ctx.fillStyle = PAL.orange;
  ctx.fillRect(4, 4, 8, 10);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(6, 6, 4, 7);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(7, 9, 2, 3);
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

// ---- the big AA ring sight the gunner looks through ----
// A dark "spider-web" ring (concentric circles + radial spokes) like a WWII
// anti-aircraft ranging sight. Drawn smooth (not pixelated) so the rings read
// cleanly, and centered on the aim point.
export function aaSightCanvas() {
  const S = 260;
  const [c, ctx] = makeCanvas(S, S);
  const cx = S / 2, cy = S / 2, R = S / 2 - 10;
  ctx.lineCap = 'round';
  const dark = 'rgba(16,18,22,0.92)', mid = 'rgba(16,18,22,0.6)';

  // heavy outer ring
  ctx.strokeStyle = dark; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  // concentric rings
  ctx.lineWidth = 3; ctx.strokeStyle = mid;
  for (const f of [0.74, 0.5, 0.27]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); }
  // radial spokes (the web)
  const spokes = 12;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.1, cy + Math.sin(a) * R * 0.1);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  // heavier horizon + vertical crosshairs
  ctx.strokeStyle = dark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  // center aim pip
  ctx.fillStyle = 'rgba(248,56,0,0.95)';
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  return c;
}

// ---- floating "this one is an ally" marker: a small downward chevron ----
// A chunky yellow caret (pointing down at the bird) with a dark outline so it
// reads against both sky and terrain. Cleaner than a text label.
export function allyMarkerCanvas() {
  const [c, ctx] = makeCanvas(32, 28);
  const chevron = (yTop, yBot, w) => {
    ctx.beginPath();
    ctx.moveTo(16 - w, yTop);
    ctx.lineTo(16, yBot);
    ctx.lineTo(16 + w, yTop);
    ctx.lineTo(16 + w - 5, yTop);
    ctx.lineTo(16, yBot - 7);
    ctx.lineTo(16 - w + 5, yTop);
    ctx.closePath();
    ctx.fill();
  };
  // dark outline pass (slightly larger), then the yellow fill
  ctx.fillStyle = 'rgba(16,18,22,0.9)';
  ctx.beginPath();
  ctx.moveTo(3, 5); ctx.lineTo(16, 25); ctx.lineTo(29, 5); ctx.lineTo(22, 5); ctx.lineTo(16, 15); ctx.lineTo(10, 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAL.yellow;
  chevron(7, 23, 11);
  return c;
}

// ---- first-person viewmodel: twin AA barrels in perspective ----
// Two barrels seen from behind the breech, foreshortened: fat at the base
// (close to the viewer) and narrowing + angling inward as they recede toward
// the target. Drawn chunky/pixelated to match the game.
export function flakGunCanvas() {
  const W = 128, H = 150;
  const [c, ctx] = makeCanvas(W, H);
  const steel = '#6c6c6c', steelDark = '#343434', steelLite = '#a4a4a4';
  const quad = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  };

  // a barrel from a wide base (boX..biX at yBot) to a narrow top (toX..tiX at yTop).
  // Short: tips stop ~1/3 up the ring sight so they clear the center aim point.
  const barrel = (boX, biX, toX, tiX) => {
    const yTop = 50, yBot = 118;
    quad([boX, yBot, biX, yBot, tiX, yTop, toX, yTop], steel);
    // left highlight edge
    quad([boX, yBot, boX + (biX - boX) * 0.3, yBot, toX + (tiX - toX) * 0.3, yTop, toX, yTop], steelLite);
    // right shaded edge
    quad([biX - (biX - boX) * 0.26, yBot, biX, yBot, tiX, yTop, tiX - (tiX - toX) * 0.26, yTop], steelDark);
    // rounded tube end: dome the top, but keep the SAME left-right shading as
    // the body (bright outer edge, dark inner edge) so the whole tube reads as
    // one consistent cylinder — no top-lit cap, no dark bore
    const cx = (toX + tiX) / 2, rw = Math.abs(tiX - toX) / 2 + 0.5, capH = 4.5;
    const dome = (color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(cx, yTop, rw, capH, 0, Math.PI, Math.PI * 2); ctx.fill();
    };
    const band = (fromX, toXc, color) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.min(fromX, toXc), yTop - capH - 2, Math.abs(toXc - fromX), capH + 4);
      ctx.clip();
      dome(color);
      ctx.restore();
    };
    const w = tiX - toX;
    dome(steel);                                       // rounded silhouette
    band(toX, toX + w * 0.3, steelLite);               // highlight continues on the outer edge
    band(tiX - w * 0.26, tiX, steelDark);              // shade continues on the inner edge
  };
  // left + right barrels: wide bases, narrow tips that lean inward toward each
  // other, so they read as converging in perspective toward the target
  barrel(22, 44, 36, 48);
  barrel(106, 84, 92, 80);

  // breech housing across the bottom
  ctx.fillStyle = steelDark; ctx.fillRect(24, 110, 80, 30);
  ctx.fillStyle = steel; ctx.fillRect(26, 112, 76, 12);
  ctx.fillStyle = steelLite; ctx.fillRect(26, 112, 76, 2);
  // ammo drums either side
  ctx.fillStyle = PAL.darkGreen; ctx.fillRect(18, 116, 10, 16); ctx.fillRect(100, 116, 10, 16);
  ctx.fillStyle = PAL.green; ctx.fillRect(19, 118, 8, 4); ctx.fillRect(101, 118, 8, 4);
  // short center mount post between the barrels (sells "attached" without
  // standing alone in the now-cleared center of the sight)
  ctx.fillStyle = steelDark; ctx.fillRect(60, 96, 8, 18);
  ctx.fillStyle = steel; ctx.fillRect(61, 96, 4, 18);

  // two gloved hands gripping the breech
  const hand = (x) => {
    ctx.fillStyle = PAL.darkBrown; ctx.fillRect(x, 124, 26, 26);
    ctx.fillStyle = PAL.brown; ctx.fillRect(x, 124, 26, 3);
    ctx.fillStyle = '#241608'; for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 6, 128, 3, 18); // fingers
  };
  hand(14); hand(88);

  return c;
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
