// Rank skin atlases by colour-histogram similarity to each item icon; write a contact sheet of the top candidates per icon.
// Usage: node match.mjs <atlasDir> <iconDir> <outDir> [topN]
import sharp from "sharp";
import fs from "fs";
import path from "path";
const [atlasDir, iconDir, outDir, topN = "8"] = process.argv.slice(2);
const BINS = 6;
async function hist(file) {
  const { data, info } = await sharp(file).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const h = new Float32Array(BINS ** 3); let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const q = c => Math.min(BINS - 1, (c * BINS) >> 8);
    h[q(data[i]) * BINS * BINS + q(data[i + 1]) * BINS + q(data[i + 2])]++; n++;
  }
  if (n) for (let k = 0; k < h.length; k++) h[k] /= n;
  return h;
}
const inter = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.min(a[k], b[k]); return s; };
const atlases = fs.readdirSync(atlasDir).filter(f => /^\d+_atlas\.png$/.test(f));
const ah = [];
for (const f of atlases) { try { ah.push([f, await hist(path.join(atlasDir, f))]); } catch {} }
fs.mkdirSync(outDir, { recursive: true });
for (const icon of fs.readdirSync(iconDir).filter(f => f.endsWith(".png"))) {
  const ih = await hist(path.join(iconDir, icon));
  const top = ah.map(([f, h]) => [f, inter(ih, h)]).sort((a, b) => b[1] - a[1]).slice(0, +topN);
  console.log(icon, top.map(([f, s]) => `${f.split("_")[0]}:${s.toFixed(2)}`).join(" "));
  const tiles = [{ input: await sharp(path.join(iconDir, icon)).resize(200, 200, { fit: "contain", background: "#fff" }).png().toBuffer(), left: 0, top: 0 }];
  for (const [k, [f]] of top.entries()) {
    const img = await sharp(path.join(atlasDir, f)).resize(400, 200, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer();
    const label = Buffer.from(`<svg width="400" height="24"><text x="4" y="18" font-size="18" font-family="Arial">${f.split("_")[0]}</text></svg>`);
    const col = (k % 2), row = Math.floor(k / 2);
    tiles.push({ input: img, left: 210 + col * 410, top: row * 230 + 24 }, { input: label, left: 210 + col * 410, top: row * 230 });
  }
  await sharp({ create: { width: 1040, height: Math.ceil(+topN / 2) * 230 + 10, channels: 3, background: "#fff" } }).composite(tiles).png().toFile(path.join(outDir, `cand_${icon}`));
}
