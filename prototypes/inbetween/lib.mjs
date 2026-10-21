// Shared helpers for the in-between prototype: views as premultiplied float RGBA frames in one coordinate frame.
import sharp from "sharp";
import fs from "node:fs";

export const HATS = [2893, 5070, 4068];
export const S = 512, OX = 288, OY = 400; // frame size and where the attach point (head bone) sits in it
/** Yaw (degrees) each Dofus direction stands for: 2 = face, 1 = 3/4, 0 = profile. */
export const VIEW_YAW = { 2: 0, 1: 45, 0: 90 };
const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
export const P = f => here + f;

/** A frame: { w, h, d: Float32Array premultiplied RGBA in 0..1 }. */
export const blank = () => ({ w: S, h: S, d: new Float32Array(S * S * 4) });

/** One direction of a hat, back layer under front layer, as a frame; `layer` "front" or "back" keeps only that one. */
export async function loadView(id, dir, layer = null) {
  const parts = JSON.parse(fs.readFileSync(P(`views/${id}/views.json`))).parts;
  const names = Object.keys(parts).filter(n => n.endsWith("_" + dir)).filter(n => !layer || (layer === "back") === n.includes("B_"))
    .sort((a, b) => +b.includes("B_") - +a.includes("B_"));
  const tiles = names.map(n => ({ input: P(`views/${id}/${parts[n].file}`), left: OX - parts[n].originX, top: OY - parts[n].originY }));
  const raw = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles).raw().toBuffer();
  return fromRGBA(raw);
}

/**
 * Straight (unpremultiplied) colour, with the edge colours spread into the transparent area: RIFE then never sees a
 * background colour, so the colour and alpha flows disagreeing at the edges doesn't leave a dark or grey fringe.
 */
export function bleed(f) {
  const col = new Float32Array(S * S * 3), known = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const a = f.d[i * 4 + 3];
    if (a > 0.02) { known[i] = 1; for (let c = 0; c < 3; c++) col[i * 3 + c] = f.d[i * 4 + c] / a; }
  }
  for (let pass = 0; pass < 64; pass++) {
    const add = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x; if (known[i]) continue;
      let n = 0; const s = [0, 0, 0];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * S + xx;
        if (xx < 0 || yy < 0 || xx >= S || yy >= S || !known[j]) continue;
        n++; for (let c = 0; c < 3; c++) s[c] += col[j * 3 + c];
      }
      if (n) add.push([i, s.map(v => v / n)]);
    }
    if (!add.length) break;
    for (const [i, s] of add) { known[i] = 1; col.set(s, i * 3); }
  }
  for (let i = 0; i < S * S; i++) if (!known[i]) col.fill(0.5, i * 3, i * 3 + 3);
  return col;
}

export function fromRGBA(raw, w = S, h = S) {
  const d = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = raw[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) d[i * 4 + k] = raw[i * 4 + k] / 255 * a;
    d[i * 4 + 3] = a;
  }
  return { w, h, d };
}

export function toRGBA(f, bg = null) {
  const out = Buffer.alloc(f.w * f.h * 4);
  for (let i = 0; i < f.w * f.h; i++) {
    const a = f.d[i * 4 + 3];
    for (let k = 0; k < 3; k++) {
      const c = bg ? f.d[i * 4 + k] + bg[k] * (1 - a) : (a > 1e-4 ? f.d[i * 4 + k] / a : 0);
      out[i * 4 + k] = Math.round(Math.max(0, Math.min(1, c)) * 255);
    }
    out[i * 4 + 3] = bg ? 255 : Math.round(Math.min(1, a) * 255);
  }
  return out;
}

/** Alpha bounding box {l, r, t, b} in pixels. */
export function bbox(f) {
  let l = f.w, r = 0, t = f.h, b = 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.d[(y * f.w + x) * 4 + 3] > 0.05) {
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return { l, r: r + 1, t, b: b + 1 };
}

const lerp = (a, b, t) => a + (b - a) * t;
export const lerpBox = (A, B, t) => ({ l: lerp(A.l, B.l, t), r: lerp(A.r, B.r, t), t: lerp(A.t, B.t, t), b: lerp(A.b, B.b, t) });

/** Stretches f so its box `from` lands on box `to` (a scale + shift per axis, i.e. one drawImage in the browser). */
export function warp(f, from, to) {
  const o = blank(), sx = (from.r - from.l) / (to.r - to.l), sy = (from.b - from.t) / (to.b - to.t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = from.l + (x + 0.5 - to.l) * sx - 0.5, v = from.t + (y + 0.5 - to.t) * sy - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const i = (y * S + x) * 4;
    for (const [xx, yy, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
      if (xx < 0 || yy < 0 || xx >= S || yy >= S || !w) continue;
      const j = (yy * S + xx) * 4;
      for (let k = 0; k < 4; k++) o.d[i + k] += f.d[j + k] * w;
    }
  }
  return o;
}

/** Crossfade in premultiplied space (what a 'lighter' composite of two globalAlpha draws gives in a canvas). */
export function mix(a, b, t) {
  const o = blank();
  for (let i = 0; i < o.d.length; i++) o.d[i] = a.d[i] * (1 - t) + b.d[i] * t;
  return o;
}

/** The two views around a yaw in 0..90 and the position t between them. */
export function bracket(yaw) {
  return yaw <= 45 ? { a: 2, b: 1, t: yaw / 45 } : { a: 1, b: 0, t: (yaw - 45) / 45 };
}

export const smoothstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
