// Review sheets for the Coiffes' RIFE turns (rife-coiffes.mjs): one row per skin, face Vue → in-between frames → 3/4
// Vue, back Calque under front Calque, on grey. Bad turns go in tools/extraction/tours.config.json "exclude".
// Usage: node tools/extraction/tours-sheet.mjs [--only=1055,2893] [--per=40]  → .extraction-cache/tours-review/sheet_<n>.png
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, ".extraction-cache/tours-review");
const arg = name => process.argv.find(a => a.startsWith(`--${name}`))?.split("=")[1];
const only = arg("only")?.split(",").map(Number), per = Number(arg("per") ?? 40);
const tours = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/tours.json"), "utf8"));
const coiffes = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/coiffes.json"), "utf8")).map(c => [c.skinId, c]));
const CELL = 200, S = 0.4, LABEL = 70; // cell size, scale from the PNGs, label column

/** Cell i of the turn (0 = face Vue, K+1 = 3/4 Vue) as a CELL×CELL PNG, anchor at (CELL/2, 0.92·CELL). */
async function cell(skin, tour, i) {
  const c = coiffes.get(skin), comps = [];
  for (const layer of ["back", "front"]) {
    let file, cal, sx = 0;
    if (i === 0 || i === tour.frames + 1) { cal = c.directions[i ? 1 : 2][layer]; file = cal?.file; }
    else if (tour[layer]) { cal = tour[layer]; file = cal.file; sx = (i - 1) * cal.width; }
    else { cal = c.directions[i <= tour.frames / 2 ? 2 : 1][layer]; file = cal?.file; } // no frames: snaps halfway
    if (!cal) continue;
    const img = await sharp(path.join(ROOT, "public/coiffes", String(skin), file)).extract({ left: sx, top: 0, width: cal.width, height: cal.height })
      .resize(Math.max(1, Math.round(cal.width * S)), Math.max(1, Math.round(cal.height * S))).toBuffer();
    const left = Math.round(CELL / 2 - cal.originX * S), top = Math.round(CELL * 0.92 - cal.originY * S);
    comps.push({ input: await sharp({ create: { width: CELL * 3, height: CELL * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: img, left: left + CELL, top: top + CELL }]).png().toBuffer() });
  }
  const big = await sharp({ create: { width: CELL * 3, height: CELL * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toBuffer();
  return sharp(big).extract({ left: CELL, top: CELL, width: CELL, height: CELL }).png().toBuffer();
}

fs.mkdirSync(OUT, { recursive: true });
const skins = Object.keys(tours).map(Number).filter(s => !only || only.includes(s));
for (let p = 0; p * per < skins.length; p++) {
  const page = skins.slice(p * per, (p + 1) * per);
  const cols = Math.max(...page.map(s => tours[s].frames + 2));
  const comps = [];
  for (const [r, skin] of page.entries()) {
    const t = tours[skin];
    comps.push({ input: Buffer.from(`<svg width="${LABEL}" height="${CELL}"><text x="6" y="${CELL / 2}" font-family="Arial" font-size="18" fill="#222">${skin}</text></svg>`), left: 0, top: r * CELL });
    for (let i = 0; i < t.frames + 2; i++) comps.push({ input: await cell(skin, t, i), left: LABEL + i * CELL, top: r * CELL });
  }
  const file = path.join(OUT, `sheet_${p + 1}.png`);
  await sharp({ create: { width: LABEL + cols * CELL, height: page.length * CELL, channels: 4, background: "#b8b8b8" } }).composite(comps).png().toFile(file);
  console.log(file);
}
