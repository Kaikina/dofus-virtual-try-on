// Exports what dev/puppet.html needs: one PNG per skin piece (tinted with PALETTE, origin = the piece's joint) and the
// idle frame of each direction (draw order + matrices). Output: ../live/ (Ankama-derived: dev only, never in public/).
// Usage: node export-live.mjs [bodySkin=11] [headSkin=2012]
import sharp from "sharp";
import fs from "node:fs";
import { loadSkin, loadBones, frameNodes, partTris, raster } from "./puppet.mjs";

const [bodyId = "11", headId = "2012"] = process.argv.slice(2);
const OUT = new URL("../live/", import.meta.url).pathname.slice(1);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const bones = loadBones("C:/Users/girou/dofus-virtual-try-on/.extraction-cache/bones/bone_1-static", "1-static");
const body = await loadSkin(bodyId), head = await loadSkin(headId);
const PPU = 16; // px per skin unit (bone units are 3 skin units)
const LOWER = /^(Pied|Jambe|Cuisse|Ombre|carried|Queue|CapeBas|Bouclier)/;
const ID = { rX: 1, uX: 0, rY: 0, uY: 1, tX: 0, tY: 0 };

const pieces = {};
async function piece(skin, name, key) {
  if (key in pieces) return !!pieces[key];
  const T = partTris(skin, name, ID);
  if (!T.length) return (pieces[key] = null, false);
  const xs = T.flatMap(t => t.p.map(p => p.x)), ys = T.flatMap(t => t.p.map(p => p.y));
  const view = { x0: Math.floor(Math.min(...xs) * 4) / 4, x1: Math.ceil(Math.max(...xs) * 4) / 4, y0: Math.floor(Math.min(...ys) * 4) / 4, y1: Math.ceil(Math.max(...ys) * 4) / 4 };
  const r = raster(T, view, PPU);
  const file = `${key}.png`;
  await sharp(r.buf, { raw: { width: r.W, height: r.H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(OUT + file);
  // (originX, originY): pixel of the piece's origin (its joint) inside the PNG
  pieces[key] = { file, width: r.W, height: r.H, originX: -view.x0 * PPU, originY: view.y1 * PPU };
  return true;
}

const directions = {};
for (const d of [1, 2]) {
  const nodes = [];
  for (const n of frameNodes(bones, `AnimStatiqueExplo0_${d}`, 0)) {
    if (!n.m || LOWER.test(n.name)) continue;
    const isHead = /^Tete_\d$/.test(n.name);
    const ok = isHead ? await piece(head, n.name, `head_${n.name}`) : await piece(body, n.name, `body_${n.name}`);
    if (!ok) continue;
    const m = n.m;
    nodes.push({ name: n.name, piece: isHead ? `head_${n.name}` : `body_${n.name}`, m: [m.rX, m.uX, m.tX, m.rY, m.uY, m.tY].map(v => +v.toFixed(4)) });
  }
  directions[d] = nodes;
}
// Head variants: the expressions (3/4 only) and the front open-mouth head
const heads = {};
for (const name of ["Tete_1", ...Array.from({ length: 13 }, (_, i) => `Tete${i + 2}_1`), "Tete_2", "Tete2_2"])
  if (await piece(head, name, `head_${name}`)) heads[name] = `head_${name}`;

fs.writeFileSync(OUT + "puppet.json", JSON.stringify({ bodySkin: +bodyId, headSkin: +headId, pxPerUnit: PPU, boneUnitsPerSkinUnit: 3, pieces, directions, heads }, null, 1));
const size = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(OUT + f).size, 0);
console.log(Object.keys(pieces).length, "pieces,", (size / 1024).toFixed(0), "KB");
