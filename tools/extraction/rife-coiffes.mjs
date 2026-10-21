// RIFE in-between frames for the Coiffes, from the face Vue (direction 2) to the 3/4 Vue (direction 1), so a hat turns
// with the head instead of snapping between the two (validated in prototypes/inbetween). Each Calque (front, back) is
// interpolated on its own, so the head can still be drawn between them; a Calque only one Vue has gets no frames.
// Colour and alpha go through RIFE in two passes (it has no alpha channel), the colour spread past the edges first so
// no background colour bleeds in. The K in-between frames of a Calque go side by side in one strip,
// public/coiffes/<skin>/tour_<front|back>.webp; the ends stay the Vues themselves. Metadata: src/data/tours.json.
//
// Usage: node tools/extraction/rife-coiffes.mjs [--force] [--only=1055,2893] [--frames=5]
//   needs the rife-ncnn-vulkan build in .extraction-cache/rife/ (rife-ncnn-vulkan.exe + rife-v4.6/), a Vulkan GPU.
//   Skins already done are skipped (resumable); tools/extraction/tours.config.json lists skins to leave out.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXE = path.join(ROOT, ".extraction-cache/rife/rife-ncnn-vulkan.exe");
const WORK = path.join(ROOT, ".extraction-cache/rife-work");
const TOURS = path.join(ROOT, "src/data/tours.json");
const arg = name => process.argv.find(a => a.startsWith(`--${name}`))?.split("=")[1];
const force = process.argv.includes("--force");
const only = arg("only")?.split(",").map(Number);
/** In-between frames per Calque: the prototype found 4 to 6 steps enough between face and 3/4 (with a crossfade). */
const K = Number(arg("frames") ?? 5);
const exclude = new Set(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "tours.config.json"), "utf8")).exclude);

const coiffes = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/coiffes.json"), "utf8"));
const tours = fs.existsSync(TOURS) ? JSON.parse(fs.readFileSync(TOURS, "utf8")) : {};
const skins = [...new Map(coiffes.map(c => [c.skinId, c])).values()]
  .filter(c => c.directions[1] && c.directions[2] && !exclude.has(c.skinId) && (!only || only.includes(c.skinId)));

/** A Calque as premultiplied RGBA floats in a W×H frame whose (ox, oy) pixel is the Point d'ancrage. */
async function load(skin, c, W, H, ox, oy) {
  const raw = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: path.join(ROOT, "public/coiffes", String(skin), c.file), left: ox - c.originX, top: oy - c.originY }]).raw().toBuffer();
  const d = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { const a = raw[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) d[i * 4 + k] = (raw[i * 4 + k] / 255) * a; d[i * 4 + 3] = a; }
  return d;
}

/** Straight colour with the edge colours spread outward, so RIFE never sees a background colour (no dark fringe). */
function bleed(d, W, H) {
  const col = new Float32Array(W * H * 3), known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const a = d[i * 4 + 3]; if (a > 0.02) { known[i] = 1; for (let c = 0; c < 3; c++) col[i * 3 + c] = d[i * 4 + c] / a; } }
  for (let pass = 0; pass < 32; pass++) {
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

/** The K in-between frames of one Calque as a strip, or null when RIFE gave nothing usable. */
async function tour(skin, faceCalque, troisQuartsCalque, layer) {
  const ends = [faceCalque, troisQuartsCalque], M = 8;
  // Common frame, both Calques placed on the Point d'ancrage
  const ox = Math.max(...ends.map(c => c.originX)) + M, oy = Math.max(...ends.map(c => c.originY)) + M;
  const W = ox + Math.max(...ends.map(c => c.width - c.originX)) + M, H = oy + Math.max(...ends.map(c => c.height - c.originY)) + M;
  const imgs = await Promise.all(ends.map(c => load(skin, c, W, H, ox, oy)));
  const out = {};
  for (const kind of ["rgb", "alpha"]) {
    const dIn = path.join(WORK, `in-${kind}`), dOut = path.join(WORK, kind);
    for (const d of [dIn, dOut]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
    for (const [k, d] of imgs.entries()) {
      const col = kind === "rgb" ? bleed(d, W, H) : null, b = Buffer.alloc(W * H * 3);
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.round((col ? col[i * 3 + c] : d[i * 4 + 3]) * 255);
      await sharp(b, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 1 }).toFile(path.join(dIn, `${String(k + 1).padStart(8, "0")}.png`));
    }
    // -n counts the output frames, ends included
    execFileSync(EXE, ["-i", dIn, "-o", dOut, "-n", String(K + 2), "-m", path.join(path.dirname(EXE), "rife-v4.6")], { stdio: "pipe" });
    out[kind] = await Promise.all(Array.from({ length: K }, (_, k) => sharp(path.join(dOut, `${String(k + 2).padStart(8, "0")}.png`)).removeAlpha().raw().toBuffer()));
  }
  // One crop shared by the K frames (they share the Point d'ancrage), then side by side
  const frames = out.rgb.map((rgb, k) => {
    const f = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      for (let c = 0; c < 3; c++) f[i * 4 + c] = rgb[i * 3 + c];
      // RIFE blurs the alpha where the two drawings disagree (a hole opening, a horn passing in front): those
      // half-transparent patches show dark smudges. Sharpen it back toward the game's crisp edges.
      const s = Math.max(0, Math.min(1, (out.alpha[k][i * 3] / 255 - 0.25) / 0.5));
      f[i * 4 + 3] = Math.round(s * s * (3 - 2 * s) * 255);
    }
    return f;
  });
  let l = W, r = 0, t = H, b = 0;
  for (const f of frames) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3] > 3) {
    if (x < l) l = x; if (x >= r) r = x + 1; if (y < t) t = y; if (y >= b) b = y + 1;
  }
  if (r <= l || b <= t) return null;
  const cw = r - l, ch = b - t;
  const cells = await Promise.all(frames.map(f => sharp(f, { raw: { width: W, height: H, channels: 4 } }).extract({ left: l, top: t, width: cw, height: ch }).raw().toBuffer()));
  const file = `tour_${layer}.webp`;
  await sharp({ create: { width: cw * K, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells.map((input, k) => ({ input, raw: { width: cw, height: ch, channels: 4 }, left: k * cw, top: 0 })))
    .webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(ROOT, "public/coiffes", String(skin), file));
  return { file, width: cw, height: ch, originX: ox - l, originY: oy - t };
}

const save = () => fs.writeFileSync(TOURS, JSON.stringify(Object.fromEntries(Object.entries(tours).sort((a, b) => a[0] - b[0])), null, 1) + "\n");
let done = 0;
const started = Date.now();
for (const c of skins) {
  const key = String(c.skinId);
  if (tours[key] && !force && tours[key].frames === K) { done++; continue; }
  const entry = { frames: K };
  for (const layer of ["front", "back"]) {
    const face = c.directions[2][layer], tq = c.directions[1][layer];
    if (!face || !tq) continue;
    const strip = await tour(c.skinId, face, tq, layer);
    if (strip) entry[layer] = strip;
  }
  if (entry.front || entry.back) tours[key] = entry;
  done++;
  // Not after every skin: the dev server reloads the app each time src/data/ changes
  if (done % 25 === 0) save();
  const rate = (Date.now() - started) / 1000 / done;
  if (done % 10 === 0 || done === skins.length) console.log(`${done}/${skins.length} (${rate.toFixed(1)} s/skin, ~${Math.round(((skins.length - done) * rate) / 60)} min left)`);
}
save();
fs.rmSync(WORK, { recursive: true, force: true });
console.log(`${Object.keys(tours).length} skins with frames in src/data/tours.json`);
