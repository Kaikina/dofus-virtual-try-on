// Asset cost of method C: extra webp frames per hat at 7.5° and 3.75° steps (front+back flattened, cropped to content).
import sharp from "sharp";
import { HATS, toRGBA, bbox, S } from "./lib.mjs";
import { loadRife } from "./methods.mjs";
import fs from "node:fs";
const enc = async f => { const b = bbox(f); return (await sharp(toRGBA(f), { raw: { width: S, height: S, channels: 4 } }).extract({ left: b.l, top: b.t, width: b.r - b.l, height: b.b - b.t }).webp({ quality: 90 }).toBuffer()).length; };
for (const id of HATS) {
  const r = await loadRife(id), shipped = fs.readdirSync(`../../public/coiffes/${id}`).filter(f => /_\d\.webp$/.test(f)).reduce((s, f) => s + fs.statSync(`../../public/coiffes/${id}/${f}`).size, 0);
  const out = [];
  for (const step of [5, 2.5]) { // in RIFE frames (each 1.5°): 7.5° and 3.75°
    let sum = 0, n = 0;
    for (const seg of ["21", "10"]) for (let k = step; k < 30; k += step) { sum += await enc(r[seg][Math.round(k)]); n++; }
    out.push(`${step * 1.5}°: ${n} frames, ${(sum / 1024).toFixed(0)} KB`);
  }
  console.log(id, `shipped today (2 Vues, front+back): ${(shipped / 1024).toFixed(0)} KB |`, out.join(" | "));
}
