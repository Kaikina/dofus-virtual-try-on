// Frames for the live test page (dev/inbetween.html): RIFE between face and 3/4, front and back layers apart, so the
// head can still be drawn between them. 31 frames (t = k/30) per layer, cropped to the hat and saved as webp.
// CLI: node live.mjs <path to rife-ncnn-vulkan.exe>
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { HATS, S, OX, OY, loadView, bleed, bbox, toRGBA, P } from "./lib.mjs";

const exe = process.argv[2], N = 31;
const rgb3 = (f, pick) => { const b = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.round(pick(i, c) * 255); return b; };
const meta = {};
for (const id of HATS) {
  const out = P(`live/${id}`), work = P(`rife-live/${id}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const layers = {};
  for (const layer of ["front", "back"]) {
    const ends = [await loadView(id, 2, layer), await loadView(id, 1, layer)];
    if (ends.some(f => !f.d.some((v, i) => i % 4 === 3 && v > 0))) continue; // a layer missing in one of the two views
    const frames = {};
    for (const kind of ["rgb", "alpha"]) {
      const dIn = `${work}/${layer}/in-${kind}`, dOut = `${work}/${layer}/${kind}`;
      fs.rmSync(dIn, { recursive: true, force: true }); fs.rmSync(dOut, { recursive: true, force: true });
      fs.mkdirSync(dIn, { recursive: true }); fs.mkdirSync(dOut, { recursive: true });
      for (const [k, f] of ends.entries()) {
        const col = bleed(f);
        await sharp(rgb3(f, kind === "rgb" ? (i, c) => col[i * 3 + c] : i => f.d[i * 4 + 3]), { raw: { width: S, height: S, channels: 3 } })
          .png().toFile(`${dIn}/${String(k + 1).padStart(8, "0")}.png`);
      }
      execFileSync(exe, ["-i", dIn, "-o", dOut, "-n", String(N), "-m", exe.replace(/[^\/]+$/, "rife-v4.6")], { stdio: "pipe" });
      frames[kind] = await Promise.all(Array.from({ length: N }, (_, k) => sharp(`${dOut}/${String(k + 1).padStart(8, "0")}.png`).removeAlpha().raw().toBuffer()));
    }
    // Back to frames; the ends stay the exact game renders
    const layerFrames = Array.from({ length: N }, (_, k) => {
      if (k === 0 || k === N - 1) return ends[k ? 1 : 0];
      const d = new Float32Array(S * S * 4);
      for (let i = 0; i < S * S; i++) { const a = frames.alpha[k][i * 3] / 255; for (let c = 0; c < 3; c++) d[i * 4 + c] = frames.rgb[k][i * 3 + c] / 255 * a; d[i * 4 + 3] = a; }
      return { w: S, h: S, d };
    });
    // One crop for every frame of the layer, so they share an origin
    const bs = layerFrames.map(bbox), box = { l: Math.min(...bs.map(b => b.l)), t: Math.min(...bs.map(b => b.t)), r: Math.max(...bs.map(b => b.r)), b: Math.max(...bs.map(b => b.b)) };
    const crop = { left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t };
    for (const [k, f] of layerFrames.entries())
      await sharp(toRGBA(f), { raw: { width: S, height: S, channels: 4 } }).extract(crop).webp({ quality: 90, alphaQuality: 100 }).toFile(`${out}/${layer}_${k}.webp`);
    layers[layer] = { width: crop.width, height: crop.height, originX: OX - crop.left, originY: OY - crop.top };
  }
  meta[id] = { frames: N, layers };
  console.log(id, Object.keys(layers).join(" "));
}
fs.writeFileSync(P("live/frames.json"), JSON.stringify(meta, null, 2));
