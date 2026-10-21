// The in-between methods, each a function of yaw (0 = face, 90 = profile toward screen-right).
import fs from "node:fs";
import sharp from "sharp";
import { S, blank, bbox, lerpBox, warp, mix, bracket, smoothstep, loadView, fromRGBA, P } from "./lib.mjs";

export async function loadHat(id) {
  const v = {};
  for (const d of [2, 1, 0]) { const f = await loadView(id, d); v[d] = { f, box: bbox(f), rows: rowEdges(f) }; }
  return v;
}

/** A: today's behaviour, snap to one view (choisirVue's 15° face Palier with 3° hysteresis, plus a profile Palier at 67.5°). */
export function snapDir(yaw, prev) {
  const edges = [[15, 2, 1], [67.5, 1, 0]];
  let d = yaw < 15 ? 2 : yaw < 67.5 ? 1 : 0;
  for (const [e, lo, hi] of edges) if (prev != null && [lo, hi].includes(prev) && [lo, hi].includes(d) && d !== prev && Math.abs(yaw - e) < 3) d = prev;
  return d;
}

/** B: crossfade the two nearest views, each stretched so its bounding box moves continuously between theirs. */
export function methodB(hat, yaw) {
  const { a, b, t } = bracket(yaw), A = hat[a], B = hat[b], to = lerpBox(A.box, B.box, t);
  return mix(warp(A.f, A.box, to), warp(B.f, B.box, to), smoothstep(0.3, 0.7, t));
}

/** Left/right alpha edge of every row (null for an empty row). */
function rowEdges(f) {
  const out = [];
  for (let y = 0; y < S; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < S; x++) if (f.d[(y * S + x) * 4 + 3] > 0.05) { if (l < 0) l = x; r = x + 1; }
    out.push(l < 0 ? null : [l, r]);
  }
  // Fill empty rows inside the box from the nearest row above, so a hole doesn't collapse the row
  let last = null; for (let y = 0; y < S; y++) { if (out[y]) last = out[y]; else if (last) out[y] = [...last, true]; }
  return out;
}

/** B2: like B, but each row is stretched on its own so the outline itself morphs (one 1-pixel drawImage per row). */
export function methodB2(hat, yaw) {
  const { a, b, t } = bracket(yaw), A = hat[a], B = hat[b], to = lerpBox(A.box, B.box, t);
  const draw = (V, other, otherT) => {
    const o = blank();
    for (let y = Math.floor(to.t); y < Math.ceil(to.b); y++) {
      const v = (y + 0.5 - to.t) / (to.b - to.t);
      const ys = Math.floor(V.box.t + v * (V.box.b - V.box.t)), yo = Math.floor(other.box.t + v * (other.box.b - other.box.t));
      const e = V.rows[ys], eo = other.rows[yo];
      if (!e || ys < 0 || ys >= S) continue;
      const lo = eo ? eo[0] : e[0], ro = eo ? eo[1] : e[1];
      const l = e[0] + (lo - e[0]) * otherT, r = e[1] + (ro - e[1]) * otherT, sx = (e[1] - e[0]) / Math.max(1, r - l);
      for (let x = Math.max(0, Math.floor(l)); x < Math.min(S, Math.ceil(r)); x++) {
        const u = e[0] + (x + 0.5 - l) * sx - 0.5, x0 = Math.floor(u), fx = u - x0, i = (y * S + x) * 4;
        for (const [xx, w] of [[x0, 1 - fx], [x0 + 1, fx]]) {
          if (xx < 0 || xx >= S || !w) continue;
          const j = (ys * S + xx) * 4;
          for (let k = 0; k < 4; k++) o.d[i + k] += V.f.d[j + k] * w;
        }
      }
    }
    return o;
  };
  return mix(draw(A, B, t), draw(B, A, 1 - t), smoothstep(0.3, 0.7, t));
}

/** C: RIFE frames precomputed by rife.mjs, 31 per segment (t = k/30). Returns null when they weren't generated. */
export async function loadRife(id) {
  const segs = {};
  for (const seg of ["21", "10"]) {
    const dir = P(`rife/${id}/${seg}`);
    if (!fs.existsSync(`${dir}/rgb`)) return null;
    segs[seg] = [];
    for (let k = 0; k <= 30; k++) {
      const name = `${String(k + 1).padStart(8, "0")}.png`;
      const rgb = await sharp(`${dir}/rgb/${name}`).removeAlpha().raw().toBuffer();
      const al = await sharp(`${dir}/alpha/${name}`).removeAlpha().raw().toBuffer();
      const f = blank();
      for (let i = 0; i < S * S; i++) {
        const a = al[i * 3] / 255; // rgb is straight colour (bled past the edges), alpha comes from its own RIFE pass
        for (let c = 0; c < 3; c++) f.d[i * 4 + c] = rgb[i * 3 + c] / 255 * a;
        f.d[i * 4 + 3] = a;
      }
      segs[seg].push(f);
    }
  }
  return segs;
}

export function methodC(rife, yaw) {
  const { a, t } = bracket(yaw), seg = rife[a === 2 ? "21" : "10"];
  const k = t * 30, k0 = Math.floor(k), k1 = Math.min(30, k0 + 1);
  return k1 === k0 ? seg[k0] : mix(seg[k0], seg[k1], k - k0);
}
export { fromRGBA };
