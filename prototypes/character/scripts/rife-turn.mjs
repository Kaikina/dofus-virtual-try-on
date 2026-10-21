// RIFE in-between frames, face (direction 2) → 3/4 (direction 1), for every piece the two idle rigs share (Tete, Torse,
// Epaule/Bras/Main D and G, Thorax…), as in prototypes/inbetween/live.mjs: both drawings aligned on the piece's origin
// (its joint), colour and alpha interpolated in two separate passes (RIFE has no alpha), the two ends kept as the exact
// game renders. Run export-live.mjs first (it clears ../live/).
// Usage: node rife-turn.mjs <path to rife-ncnn-vulkan.exe>   → ../live/turn/<Piece>/<k>.webp + "turn" in puppet.json
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const exe = process.argv[2], N = 31;
if (!exe) throw new Error("usage: node rife-turn.mjs <rife-ncnn-vulkan.exe>");
const LIVE = new URL("../live/", import.meta.url).pathname.slice(1);
const WORK = new URL("../.rife-work/", import.meta.url).pathname.slice(1);
const data = JSON.parse(fs.readFileSync(LIVE + "puppet.json", "utf8"));
const base = name => name.replace(/_\d$/, "");

/** Straight colour with the edge colours spread outward, so RIFE never sees a background colour (no dark fringe). */
function bleed(d, W, H) {
  const col = new Float32Array(W * H * 3), known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const a = d[i * 4 + 3]; if (a > 0.02) { known[i] = 1; for (let c = 0; c < 3; c++) col[i * 3 + c] = d[i * 4 + c] / a; } }
  for (let pass = 0; pass < 64; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (known[i]) continue;
      let n = 0; const s = [0, 0, 0];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * W + xx;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !known[j]) continue;
        n++; for (let c = 0; c < 3; c++) s[c] += col[j * 3 + c];
      }
      if (n) add.push([i, s.map(v => v / n)]);
    }
    if (!add.length) break;
    for (const [i, s] of add) { known[i] = 1; col.set(s, i * 3); }
  }
  for (let i = 0; i < W * H; i++) if (!known[i]) col.fill(0.5, i * 3, i * 3 + 3);
  return col;
}

/** RIFE frames between two pieces; returns the frame's metadata (shared by all N frames). */
async function turn(name, ends, outDir) {
  // Common frame: both drawings placed so their origins coincide, with a margin, sides rounded up to 32 px
  const M = 24, ceil32 = v => Math.ceil(v / 32) * 32;
  const left = Math.round(Math.max(...ends.map(p => p.originX)) + M), top = Math.round(Math.max(...ends.map(p => p.originY)) + M);
  const W = ceil32(left + Math.max(...ends.map(p => p.width - p.originX)) + M), H = ceil32(top + Math.max(...ends.map(p => p.height - p.originY)) + M);
  const imgs = await Promise.all(ends.map(async p => {
    const raw = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: LIVE + p.file, left: Math.round(left - p.originX), top: Math.round(top - p.originY) }]).raw().toBuffer();
    const d = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const a = raw[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) d[i * 4 + c] = raw[i * 4 + c] / 255 * a; d[i * 4 + 3] = a; }
    return d;
  }));
  const out = {};
  for (const kind of ["rgb", "alpha"]) {
    const dIn = `${WORK}${name}/in-${kind}`, dOut = `${WORK}${name}/${kind}`;
    for (const d of [dIn, dOut]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
    for (const [k, d] of imgs.entries()) {
      const col = bleed(d, W, H), b = Buffer.alloc(W * H * 3);
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.round((kind === "rgb" ? col[i * 3 + c] : d[i * 4 + 3]) * 255);
      await sharp(b, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${dIn}/${String(k + 1).padStart(8, "0")}.png`);
    }
    execFileSync(exe, ["-i", dIn, "-o", dOut, "-n", String(N), "-m", exe.replace(/[^\\/]+$/, "rife-v4.6")], { stdio: "pipe" });
    out[kind] = await Promise.all(Array.from({ length: N }, (_, k) => sharp(`${dOut}/${String(k + 1).padStart(8, "0")}.png`).removeAlpha().raw().toBuffer()));
  }
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (let k = 0; k < N; k++) {
    const rgba = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      if (k === 0 || k === N - 1) { // the ends stay the exact game renders
        const d = imgs[k ? 1 : 0], a = d[i * 4 + 3];
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = a > 1e-4 ? Math.round(d[i * 4 + c] / a * 255) : 0;
        rgba[i * 4 + 3] = Math.round(a * 255);
      } else {
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = out.rgb[k][i * 3 + c];
        // RIFE blurs the alpha where the two drawings disagree: half-transparent edges let the pieces underneath show
        // through as ghosts. Sharpen it back toward the game's crisp edges.
        const a = out.alpha[k][i * 3] / 255, s = Math.max(0, Math.min(1, (a - 0.3) / 0.4));
        rgba[i * 4 + 3] = Math.round(s * s * (3 - 2 * s) * 255);
      }
    }
    const file = `${outDir}${k}.webp`;
    await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(file);
    bytes += fs.statSync(file).size;
  }
  return { meta: { width: W, height: H, originX: left, originY: top }, bytes };
}

const front = new Map(data.directions[2].map(n => [base(n.name), n.piece]));
const threeQ = new Map(data.directions[1].map(n => [base(n.name), n.piece]));
const pieces = {};
let total = 0;
fs.rmSync(LIVE + "turn", { recursive: true, force: true });
for (const [name, pa] of front) {
  const pb = threeQ.get(name);
  if (!pb) continue;
  const dir = `turn/${name}/`;
  const { meta, bytes } = await turn(name, [data.pieces[pa], data.pieces[pb]], LIVE + dir);
  pieces[name] = { dir, ...meta };
  total += bytes;
  console.log(name, `${meta.width}x${meta.height}`, `${(bytes / 1024).toFixed(0)} KB`);
}
delete data.headturn;
data.turn = { frames: N, pieces };
fs.writeFileSync(LIVE + "puppet.json", JSON.stringify(data, null, 1));
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`${Object.keys(pieces).length} pieces × ${N} frames, ${(total / 1024).toFixed(0)} KB`);
