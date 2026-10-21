// Spike: compose a Dofus 3 character (body skin + head skin) on a Bones animation frame, and re-pose its arms.
// Same conventions as tools/extraction/render.mjs: skin meshes are y-up, display-list transforms are Flash matrices
// (transpose, then flip y). Bones frames are already y-up matrices [a b tx c d ty], in units of 3 x skin units.
import sharp from "sharp";
import fs from "node:fs";
import { decodeAnim } from "./bonesanim.mjs";

const CACHE = new URL("../../../.extraction-cache/", import.meta.url);
const ID = { rX: 1, uX: 0, rY: 0, uY: 1, tX: 0, tY: 0 };
export const mul = (a, b) => ({ // a ∘ b (apply b then a)
  rX: a.rX * b.rX + a.uX * b.rY, uX: a.rX * b.uX + a.uX * b.uY,
  rY: a.rY * b.rX + a.uY * b.rY, uY: a.rY * b.uX + a.uY * b.uY,
  tX: a.rX * b.tX + a.uX * b.tY + a.tX, tY: a.rY * b.tX + a.uY * b.tY + a.tY });
const apply = (m, p) => ({ x: m.rX * p.x + m.uX * p.y + m.tX, y: m.rY * p.x + m.uY * p.y + m.tY });
export const rotAbout = (ang, cx, cy) => { const c = Math.cos(ang), s = Math.sin(ang); return { rX: c, uX: -s, rY: s, uY: c, tX: cx - c * cx + s * cy, tY: cy - s * cx - c * cy }; };
export const translate = (dx, dy) => ({ ...ID, tX: dx, tY: dy });

export async function loadSkin(id) {
  const st = JSON.parse(fs.readFileSync(new URL(`skinjson/${id}.json`, CACHE), "utf8")).m_Structure;
  const { data, info } = await sharp(fs.readFileSync(new URL(`atlas/${id}_atlas.png`, CACHE))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { id, st, parts: Object.fromEntries(st.m_values.map(v => [v.name, v])), tex: data, tw: info.width, th: info.height };
}

/** Loads the rig of a Bones bundle exported by fetchbones.mjs + AssetRipper Export/PrimaryContent. */
export function loadBones(dir, prefix) {
  const mb = fs.readdirSync(dir).filter(f => f.startsWith("MonoBehaviour")).map(f => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8").replace(/-?Infinity/g, "null")))
    .find(j => j.m_Structure.exposedNodeNames);
  const names = mb.m_Structure.exposedNodeNames;
  const anim = name => decodeAnim(fs.readFileSync(`${dir}/../export-${prefix}/Assets/TextAsset/${prefix}_${name}.bytes`));
  return { names, anim, animations: mb.m_Structure.animations.map(a => a.name) };
}

/** Full frame state: for flags 0x20 (unchanged) entries, carry the matrix over from the previous frame. */
export function frameNodes(bones, animName, frame = 0) {
  const a = bones.anim(animName); const last = new Map(); let out;
  for (let f = 0; f <= frame; f++) {
    out = a.frames[f].map(e => { if (e.m) last.set(e.depth + ":" + e.node, e.m); const m = last.get(e.depth + ":" + e.node); return { name: bones.names[e.node], depth: e.depth, sub: e.b, m: m && { rX: m[0], uX: m[1], tX: m[2], rY: m[3], uY: m[4], tY: m[5] } }; });
  }
  return out;
}

// Player colours, by ColorGray_<slot>_ index (1 = skin, 2 = hair, 3..5 = clothes, 6 = accents). Values are made up.
export const PALETTE = { 1: [247, 205, 160], 2: [120, 70, 35], 3: [235, 228, 205], 4: [60, 110, 185], 5: [140, 95, 50], 6: [200, 60, 60] };

/** Triangles of a skin part placed with matrix M. Inlined descendants: a symbol entry with `entries = n` is followed
 *  by its n flattened descendants; chunk entries (symbolId -1) consume the part's skinChunks in order, already baked in
 *  the part's space. A chunk takes the colour slot of the innermost ColorGray_<n>_ symbol that encloses it. */
export function partTris(skin, name, M, out = []) {
  const part = skin.parts[name]; if (!part) return out;
  const { st } = skin; let k = 0; const stack = [];
  for (const e of part.DisplayListEntry) {
    while (stack.length && stack.at(-1).left === 0) stack.pop();
    for (const s of stack) s.left--; // `entries` counts all flattened descendants, so every open ancestor consumes one
    if (e.symbolId === -1) {
      const c = part.skinChunks[k++]; if (!c) continue;
      const slot = [...stack].reverse().find(s => s.slot)?.slot ?? null;
      for (let i = 0; i < c.indexCount; i += 3) {
        const vs = [0, 1, 2].map(j => st.vertices[c.startVertexIndex + st.triangles[c.startIndexIndex + i + j]]);
        out.push({ skin, p: vs.map(v => apply(M, v.pos)), uv: vs.map(v => v.uv), slot });
      }
    } else if (e.entries > 0) {
      const sym = st.referencedSymbols[e.symbolId];
      stack.push({ left: e.entries, slot: +(sym.match(/^ColorGray_(\d)_/)?.[1] ?? 0) || null });
    }
  }
  return out;
}

function sample(s, u, v) {
  const x = u * s.tw - 0.5, y = (1 - v) * s.th - 0.5;
  const x0 = Math.max(0, Math.min(s.tw - 1, Math.floor(x))), y0 = Math.max(0, Math.min(s.th - 1, Math.floor(y)));
  const x1 = Math.min(s.tw - 1, x0 + 1), y1 = Math.min(s.th - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const px = (xx, yy, c) => s.tex[(yy * s.tw + xx) * 4 + c];
  return [0, 1, 2, 3].map(c => px(x0, y0, c) * (1 - fx) * (1 - fy) + px(x1, y0, c) * fx * (1 - fy) + px(x0, y1, c) * (1 - fx) * fy + px(x1, y1, c) * fx * fy);
}

/** Rasterise triangles (y-up world units) into an RGBA buffer covering view = {x0, x1, y0, y1}. */
export function raster(T, view, ppu, palette = PALETTE) {
  const W = Math.round((view.x1 - view.x0) * ppu), H = Math.round((view.y1 - view.y0) * ppu);
  const img = new Float32Array(W * H * 4);
  const toPx = p => ({ x: (p.x - view.x0) * ppu, y: (view.y1 - p.y) * ppu });
  for (const t of T) {
    const [a, b, c] = t.p.map(toPx);
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y); if (Math.abs(area) < 1e-9) continue;
    const tint = t.slot ? palette[t.slot] : null;
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y < Math.min(H, Math.ceil(Math.max(a.y, b.y, c.y))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x < Math.min(W, Math.ceil(Math.max(a.x, b.x, c.x))); x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
        const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const s = sample(t.skin, w0 * t.uv[0].x + w1 * t.uv[1].x + w2 * t.uv[2].x, w0 * t.uv[0].y + w1 * t.uv[1].y + w2 * t.uv[2].y);
        if (tint) for (let k = 0; k < 3; k++) s[k] = Math.min(255, s[k] * tint[k] / 160); // grey ~160 = the chosen colour
        const i = (y * W + x) * 4, sa = s[3] / 255, da = img[i + 3];
        const oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) img[i + k] = oa ? (s[k] * sa + img[i + k] * da * (1 - sa)) / oa : 0;
        img[i + 3] = oa;
      }
  }
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { for (let k = 0; k < 3; k++) buf[i * 4 + k] = img[i * 4 + k]; buf[i * 4 + 3] = Math.round(img[i * 4 + 3] * 255); }
  return { buf, W, H };
}

export const png = (r, file, bg = null) => {
  let s = sharp(r.buf, { raw: { width: r.W, height: r.H, channels: 4 } });
  if (bg) s = s.flatten({ background: bg });
  return s.png().toFile(file);
};

/** Head node "Tete_<d>" → the head skin's assembly; `headPart` swaps it for an expression variant, e.g. "Tete9_1". */
export function composeTris({ body, head }, nodes, { skip = () => false, headPart = null, order = null } = {}) {
  const T = [];
  const list = order ? order(nodes) : nodes;
  for (const n of list) {
    if (!n.m || skip(n.name)) continue;
    const M = n.m;
    if (/^Tete_\d$/.test(n.name)) partTris(head, headPart ?? n.name, M, T);
    else if (body.parts[n.name]) partTris(body, n.name, M, T);
    else if (head.parts[n.name]) partTris(head, n.name, M, T);
  }
  return T;
}
