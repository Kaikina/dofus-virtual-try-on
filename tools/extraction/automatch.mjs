// Match every hat / cape item to its skin automatically. The client has no item → skin table, so each item icon is
// compared with the 3/4 Vue of every skin of the right kind (hat skins have Chapeau_<dir> parts, cape skins Cape_<dir>).
//
// Usage: node automatch.mjs <items.json> <skinJsonDir> <atlasDir> <iconDir> <workDir> <out.json>
//   items.json: [{ itemId, nameId, typeId, iconId, name }]  (typeId 16/246 = hat, 17/247 = cape)
// Writes out.json: [{ itemId, nameId, iconId, kind, skinId, score, margin }] sorted by itemId.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderSkin } from "./render.mjs";

const [itemsPath, skinJsonDir, atlasDir, iconDir, workDir, outPath] = process.argv.slice(2);
const KIND_OF_TYPE = { 16: "coiffe", 246: "coiffe", 17: "cape", 247: "cape", 300: "ailes", 299: "epaulieres", 199: "costume" };
/**
 * Part families each kind of skin may use. Head items hang from the head bone (hats, headbands and ears, masks and
 * glasses); back items from the back (capes, backpacks). Epaulettes and wings (two parts on two separate bones) can't
 * be placed without the skeleton and are left out.
 */
export const FAMILIES = {
  coiffe: ["Chapeau", "Bandeau", "Masque"], cape: ["Cape", "Sac"], ailes: ["AileG", "AileD"],
  // One part per shoulder
  epaulieres: ["EpauletteG", "EpauletteD"],
  // Costume pieces a webcam shows: at the neck (Cole) or on the torso (Torse). Full-body costumes are left out here; their
  // torso was matched by hand (see catalogue.config.json)
  costume: ["Cole", "Torse"],
};
/** Kinds whose candidates must not be a whole body (arms, legs, feet): those can't be placed without the skeleton. */
const NO_FULL_BODY = new Set(["epaulieres", "costume"]);
const FULL_BODY_PARTS = ["BrasD", "BrasG", "JambeD", "CuisseD", "PiedD"];
/** Parts that mark a whole character head (a look, not an item): such skins are never candidates. */
const CHARACTER_PARTS = ["Tete", "Crane"];
const N = 32; // feature image size
const BINS = 6;

// ---------- Features ----------

/** Colour histogram of opaque pixels + alpha silhouette normalised to its bounding box (and its mirror). */
async function features(input) {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.clone().resize(96, 96, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const hist = new Float32Array(BINS ** 3);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const q = c => Math.min(BINS - 1, (c * BINS) >> 8);
    hist[q(data[i]) * BINS * BINS + q(data[i + 1]) * BINS + q(data[i + 2])]++;
    n++;
  }
  if (n) for (let k = 0; k < hist.length; k++) hist[k] /= n;
  // Silhouette: trim transparent borders, then fit in an N×N square
  const trimmed = await sharp(input).ensureAlpha().trim({ threshold: 1 }).toBuffer().catch(() => sharp(input).png().toBuffer());
  const { data: a } = await sharp(trimmed).ensureAlpha().resize(N, N, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const mask = Float32Array.from(a, v => v / 255);
  const mirror = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) mirror[y * N + x] = mask[y * N + (N - 1 - x)];
  return { hist, mask, mirror, opaque: n };
}

const histSim = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.min(a[k], b[k]); return s; };
const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += Math.min(a[k], b[k]); u += Math.max(a[k], b[k]); } return u ? i / u : 0; };
const viewSim = (icon, view) => 0.6 * histSim(icon.hist, view.hist) + 0.4 * Math.max(iou(icon.mask, view.mask), iou(icon.mask, view.mirror));
/**
 * Hat icons look like the hat's 3/4 Vue (7/7 known hats found first). Cape icons show the whole cape, top and bottom,
 * while the Vue keeps only the top: they are compared with the colours of the whole atlas instead (2/3 known capes
 * found first, the third a close second; mixing in the Vue made it worse). Cape matches are less reliable.
 */
const similarity = (kind, icon, v) => kind === "coiffe" ? viewSim(icon, v.view) : histSim(icon.hist, v.atlas);

// ---------- Candidate skins ----------

fs.mkdirSync(workDir, { recursive: true });
const skinIds = fs.readdirSync(skinJsonDir).map(f => f.match(/^(\d+)\.json$/)?.[1]).filter(Boolean);
const candidates = Object.fromEntries(Object.keys(FAMILIES).map(k => [k, []]));
for (const id of skinIds) {
  const keys = JSON.parse(fs.readFileSync(path.join(skinJsonDir, `${id}.json`), "utf8")).m_Structure?.m_keys ?? [];
  if (CHARACTER_PARTS.some(p => keys.some(k => k.startsWith(`${p}_`)))) continue;
  for (const [kind, families] of Object.entries(FAMILIES)) {
    if (NO_FULL_BODY.has(kind) && FULL_BODY_PARTS.some(p => keys.some(k => k.startsWith(`${p}_`)))) continue;
    if (families.some(p => keys.includes(`${p}_1`) || keys.includes(`${p}_2`))) candidates[kind].push(id);
  }
}
console.log(`candidate skins: ${candidates.coiffe.length} hats, ${candidates.cape.length} capes`);

/** Features of a skin's 3/4 Vue (rendered small once, cached in workDir). */
const viewCache = new Map();
async function viewFeatures(kind, id) {
  const key = `${kind}:${id}`;
  if (viewCache.has(key)) return viewCache.get(key);
  const dir = path.join(workDir, id);
  const want = FAMILIES[kind].flatMap(p => [`${p}_1.png`, `${p}_2.png`]);
  let file = want.map(f => path.join(dir, f)).find(f => fs.existsSync(f));
  if (!file) {
    try {
      await renderSkin(path.join(skinJsonDir, `${id}.json`), path.join(atlasDir, `${id}_atlas.png`), dir, 6, [1, 2]);
    } catch (e) {
      console.warn(`render failed for skin ${id}: ${e.message}`);
    }
    file = want.map(f => path.join(dir, f)).find(f => fs.existsSync(f));
  }
  const view = file ? await features(file).catch(() => null) : null;
  // Cape icons show every piece of the cape: compare them with the whole atlas too
  const f = view ? { view, atlas: kind !== "coiffe" ? (await features(path.join(atlasDir, `${id}_atlas.png`))).hist : null } : null;
  viewCache.set(key, f);
  return f;
}

// ---------- Matching ----------

// An item may give its kind itself: a living item (type 113) can be a hat, a cape… Its looks (one per level) carry `look`.
const kindOf = i => i.kind ?? KIND_OF_TYPE[i.typeId];
const items = JSON.parse(fs.readFileSync(itemsPath, "utf8")).filter(kindOf);
const byIcon = new Map(); // items sharing an icon share a skin: match each icon once
for (const it of items) (byIcon.get(it.iconId) ?? byIcon.set(it.iconId, []).get(it.iconId)).push(it);

for (const kind of Object.keys(FAMILIES)) {
  if (!items.some(i => kindOf(i) === kind)) continue; // only render the views this run needs
  for (const [i, id] of candidates[kind].entries()) {
    await viewFeatures(kind, id);
    if (i % 200 === 0) console.log(`${kind}: ${i}/${candidates[kind].length} views ready`);
  }
}

const out = [];
let done = 0;
for (const [iconId, group] of byIcon) {
  const kind = kindOf(group[0]);
  const iconFile = path.join(iconDir, `${iconId}.png`);
  if (!fs.existsSync(iconFile)) { console.warn(`no icon ${iconId}`); continue; }
  const icon = await features(iconFile);
  const scored = [];
  for (const id of candidates[kind]) {
    const v = viewCache.get(`${kind}:${id}`);
    if (v) scored.push([id, similarity(kind, icon, v)]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const [best, second] = scored;
  for (const it of group) {
    out.push({ itemId: it.itemId, nameId: it.nameId, ...(it.look && { look: it.look }), iconId, kind, skinId: best ? +best[0] : null, score: best?.[1] ?? 0, margin: best && second ? best[1] - second[1] : 1, top: scored.slice(0, 5).map(([s, v]) => `${s}:${v.toFixed(3)}`).join(" ") });
  }
  if (++done % 100 === 0) console.log(`${done}/${byIcon.size} icons matched`);
}
out.sort((a, b) => a.itemId - b.itemId);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote ${out.length} matches`);
