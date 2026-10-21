// Build the web assets of the whole catalogue:
//  - public/{coiffes,capes,ailes,epaulieres,costumes}/<skinId>/*.webp : rendered Vues + icon, once per skin
//  - src/data/{coiffes,capes,ailes,epaulieres,costumes}.json        : one entry per item (names in fr/en/es/pt, view geometry)
// Items and their skins come from matches.json (automatch.mjs), corrected by catalogue.config.json:
//  - "skins":   { itemId: skinId } checked by hand, they win over the automatic match
//  - "exclude": itemIds left out (wrong or doubtful match)
//  - "minScore", "fallbackScore" + "fallbackMargin": how confident an automatic match must be to be kept
// Inputs: .extraction-cache/skinjson/<skinId>.json, .extraction-cache/atlas/<skinId>_atlas.png,
//         .extraction-cache/icons/<iconId>.png, and the client's I18n folder.
// Usage: npm run assets:catalogue [-- --force] [-- <dofusI18nDir>]   (--force re-renders skins already built)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderSkin } from "./render.mjs";
import { loadI18n } from "./i18n.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const cache = path.join(root, ".extraction-cache");
const args = process.argv.slice(2);
const force = args.includes("--force");
const i18nDir = args.find(a => !a.startsWith("--")) ?? "E:/Dofus/Dofus-dofus3/Dofus_Data/StreamingAssets/Content/I18n";
const PX_PER_UNIT = 16;
const LANGS = ["fr", "en", "es", "pt"];
/** Directions shown in the Essayage: 2 = face, 1 = 3/4 (mirrored for the other side). No profil: face tracking is lost before. */
const DIRECTIONS = [1, 2];
const WEBP = { quality: 88, alphaQuality: 90, effort: 5 };

/** Per kind: how skin part names map to the Calques of a Vue. */
const KINDS = {
  // Hats, headbands and ears, masks and glasses all hang from the head bone; "…B" parts go behind the head
  coiffe: { folder: "coiffes", calques: { Chapeau: "front", ChapeauB: "back", Bandeau: "front", BandeauB: "back", Masque: "front", MasqueB: "back" } },
  // CapeBas is composed into Cape at build time (see composeCape); a backpack (Sac) is a single part
  cape: { folder: "capes", calques: { Cape: "front", Sac: "front" } },
  // Wings (Ailes) have their own Emplacement; their two parts are composed into one Calque (see composeWings)
  ailes: { folder: "ailes", wings: true },
  // One Calque per shoulder: each part sits on its own shoulder at runtime (EpauletteG, the character's left, on screen-right)
  epaulieres: { folder: "epaulieres", calques: { EpauletteG: "gauche", EpauletteD: "droite" } },
  // Neck pieces: ColeUL (the front band) composed over Cole (the scarf) on their shared neck bone (see composeNeck)
  costume: { folder: "costumes", calques: { Cole: "front" } },
};

/** Composes a neck piece's front band (ColeUL) over its scarf (Cole) into Cole's PNG: both hang from the neck bone. */
async function composeNeck(outDir, parts, dir) {
  const cole = parts[`Cole_${dir}`], band = parts[`ColeUL_${dir}`];
  if (!cole || !band) return;
  const left = Math.max(cole.originX, band.originX), up = Math.max(cole.originY, band.originY);
  const width = Math.max(left - cole.originX + cole.width, left - band.originX + band.width);
  const height = Math.max(up - cole.originY + cole.height, up - band.originY + band.height);
  const coleFile = path.join(outDir, cole.file);
  const composed = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: coleFile, left: left - cole.originX, top: up - cole.originY },
      { input: path.join(outDir, band.file), left: left - band.originX, top: up - band.originY },
    ]).png().toBuffer();
  fs.writeFileSync(coleFile, composed);
  Object.assign(cole, { width, height, originX: left, originY: up });
}

/**
 * Torso pieces hang from several bones: the belly (Abdomen), the chest (Torse), the neck (Cou) and the neck piece
 * (Cole, ColeUL). The skeleton is not read, but it is the same for every costume: each part's root, in game units
 * from the chest's root (y up), is a constant per Vue, chosen by eye on several costumes so the parts join up.
 * Back to front. Thorax, a second drawing of the chest, is left out.
 */
const TORSO_LAYERS = {
  2: [["Abdomen", 0, -5], ["Torse", 0, 0], ["Cou", 0, 5.5], ["Cole", 0, 5], ["ColeUL", 0, 5]],
  1: [["Abdomen", -2, -8], ["Torse", 0, 0], ["Cou", 0, 5.5], ["Cole", 0, 5], ["ColeUL", 0, 5]],
};
/**
 * A Dofus torso is small next to its shoulders (a chibi body): shown at the scale of a neck piece it only covered the
 * top of the chest. Torso pieces are drawn this much bigger, so neck and torso pieces share one default Réglage.
 */
const TORSO_SCALE = 1.5;
/** The composed torso keeps the neck piece's root as its own, so torso and neck pieces share one anchor. */
const TORSO_ROOT = [0, 5];

/** Composes a torso piece's parts (see TORSO_LAYERS) into one image, stored as its Cole part. */
async function composeTorso(outDir, parts, dir, pxPerUnit) {
  if (!parts[`Torse_${dir}`]) return false;
  // Each layer's root in pixels from the composed image's root, y down
  const layers = TORSO_LAYERS[dir].map(([name, ux, uy]) => ({ p: parts[`${name}_${dir}`], x: (ux - TORSO_ROOT[0]) * pxPerUnit, y: -(uy - TORSO_ROOT[1]) * pxPerUnit }))
    .filter(l => l.p);
  const left = Math.ceil(Math.max(...layers.map(l => l.p.originX - l.x))), up = Math.ceil(Math.max(...layers.map(l => l.p.originY - l.y)));
  const width = Math.ceil(Math.max(...layers.map(l => left + l.x - l.p.originX + l.p.width)));
  const height = Math.ceil(Math.max(...layers.map(l => up + l.y - l.p.originY + l.p.height)));
  const composed = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers.map(l => ({ input: path.join(outDir, l.p.file), left: Math.round(left + l.x - l.p.originX), top: Math.round(up + l.y - l.p.originY) })))
    .png().toBuffer();
  const file = `Costume_${dir}.png`;
  fs.writeFileSync(path.join(outDir, file), composed);
  if (parts[`Cole_${dir}`]) fs.rmSync(path.join(outDir, parts[`Cole_${dir}`].file)); // now inside the composed image
  parts[`Cole_${dir}`] = { file, width, height, originX: left, originY: up };
  return true;
}

/**
 * How far each wing is turned outward around its root in the face Vue, in degrees. The game's bones spread the wings
 * like a fan; the skin draws them upright. Tuned by eye against the game's character preview.
 */
const WING_SPREAD_DEG = Number(process.env.WING_SPREAD_DEG ?? 30);
/** How narrow the far wing looks in the 3/4 Vue (1 = as wide as in the face Vue). */
const WING_FAR_SQUEEZE = Number(process.env.WING_FAR_SQUEEZE ?? 0.4);


/**
 * A wing image flipped, turned around its root (clockwise degrees), then narrowed horizontally around the root
 * (squeeze < 1: a wing seen edge-on, as on screen it reaches less far sideways), with the root's new position.
 */
async function transformLayer(file, p, flip, angleDeg, squeeze = 1) {
  let img = sharp(file);
  if (flip) img = img.flop();
  let buf = await img.png().toBuffer(), w = p.width, h = p.height;
  let ox = flip ? p.width - p.originX : p.originX, oy = p.originY;
  if (angleDeg) {
    const { data, info } = await sharp(buf).rotate(angleDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
    // sharp turns around the image centre and grows the canvas to fit: follow the root through the same rotation
    const t = (angleDeg * Math.PI) / 180, dx = ox - w / 2, dy = oy - h / 2;
    ox = info.width / 2 + Math.cos(t) * dx - Math.sin(t) * dy;
    oy = info.height / 2 + Math.sin(t) * dx + Math.cos(t) * dy;
    buf = data; w = info.width; h = info.height;
  }
  if (squeeze !== 1) {
    const nw = Math.max(1, Math.round(w * squeeze));
    buf = await sharp(buf).resize(nw, h, { fit: "fill" }).png().toBuffer();
    ox *= nw / w; w = nw;
  }
  return { input: buf, width: w, height: h, ox: Math.round(ox), oy: Math.round(oy) };
}

/**
 * Wings hang from two bones (AileG, AileD) whose positions and angles the skin doesn't give. In the face Vue, AileG is
 * drawn twice, as is and mirrored around the shared root, so the pair is symmetric (AileD is drawn at another angle and
 * mirroring it gave a lopsided pair that looked rotated on camera), each turned outward by WING_SPREAD_DEG so the pair
 * opens like a fan as in the game; the 3/4 Vue is the same pair seen at an angle, the far wing (on the side the
 * character faces) narrowed. The face
 * Vue drawings are used because the 3/4 ones are posed by the skeleton. A middle piece (Sac) goes on top.
 * Returns the composed PNG's geometry.
 */
async function composeWings(outDir, parts, dir) {
  // [part, mirrored, clockwise turn, squeeze]: AileG points up-left, so the left wing turns anticlockwise, its mirror clockwise
  const pairs = dir === 2
    ? [["AileG", true, WING_SPREAD_DEG], ["AileG", false, -WING_SPREAD_DEG]]
    // As in the game's preview, the 3/4 Vue is the face pair seen at an angle, drawn from the face Vue's wings: the near
    // wing, on the back side (screen-left for direction 1, which faces screen-right), stays whole and is drawn on top; the
    // far one, on the side the character faces, peeks out behind the head, narrowed as seen edge-on
    : [["AileG", true, WING_SPREAD_DEG, WING_FAR_SQUEEZE, 2], ["AileG", false, -WING_SPREAD_DEG, 1, 2]];
  const layers = [...pairs, ["Sac", false, 0]]
    .map(([name, flip, angle, squeeze, from = dir]) => ({ p: parts[`${name}_${from}`], flip, angle, squeeze }))
    .filter(l => l.p);
  if (!layers.length) return null;
  // Each layer's root lands on the shared root
  const placed = await Promise.all(layers.map(l => transformLayer(path.join(outDir, l.p.file), l.p, l.flip, l.angle, l.squeeze)));
  const left = Math.max(...placed.map(l => l.ox)), top = Math.max(...placed.map(l => l.oy));
  const width = Math.max(...placed.map(l => left - l.ox + l.width)), height = Math.max(...placed.map(l => top - l.oy + l.height));
  const composites = placed.map(l => ({ input: l.input, left: left - l.ox, top: top - l.oy }));
  const file = `Ailes_${dir}.webp`;
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).webp(WEBP).toFile(path.join(outDir, file));
  return { file, width, height, originX: left, originY: top };
}

/**
 * Where the bone of a cape's bottom part (CapeBas) sits relative to the top part's (Cape), in game units (x right, y up),
 * per Dofus direction. The skin doesn't give it (it comes from the skeleton), but the skeleton is the same for every
 * cape: chosen by eye on several capes so the two parts join without a gap (2026-10-15).
 */
const CAPE_BAS_OFFSET = { 2: [0, -18], 1: [-4, -18] };

/** Composes a cape's bottom part behind its top part into the top part's PNG, updating its geometry in parts. */
async function composeCape(outDir, parts, dir, pxPerUnit) {
  // A backpack-like cape (Sac) can have a lower part too, e.g. a tail
  const top = parts[`Cape_${dir}`] ?? parts[`Sac_${dir}`], bas = parts[`CapeBas_${dir}`];
  if (!top || !bas) return;
  const [ux, uy] = CAPE_BAS_OFFSET[dir];
  // Root positions in a shared frame whose origin is the top part's root
  const basRoot = { x: ux * pxPerUnit, y: -uy * pxPerUnit };
  const left = Math.max(top.originX, bas.originX - basRoot.x), up = Math.max(top.originY, bas.originY - basRoot.y);
  const width = Math.ceil(Math.max(left - top.originX + top.width, left + basRoot.x - bas.originX + bas.width));
  const height = Math.ceil(Math.max(up - top.originY + top.height, up + basRoot.y - bas.originY + bas.height));
  const topFile = path.join(outDir, top.file);
  const composed = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: path.join(outDir, bas.file), left: Math.round(left + basRoot.x - bas.originX), top: Math.round(up + basRoot.y - bas.originY) },
      { input: topFile, left: Math.round(left - top.originX), top: Math.round(up - top.originY) },
    ]).png().toBuffer();
  fs.writeFileSync(topFile, composed);
  Object.assign(top, { width, height, originX: Math.round(left), originY: Math.round(up) });
}

const config = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "catalogue.config.json"), "utf8"));
const matches = ["matches.json", "matches-ailes.json", "matches-epaul-costume.json", "matches-vivants.json"].flatMap(f => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, f), "utf8")));
const i18n = Object.fromEntries(LANGS.map(l => [l, loadI18n(path.join(i18nDir, `${l}.bin`))]));
const exclude = new Set(config.exclude ?? []);

/** Renders a skin's Vues as WebP (unless already built) and returns its directions geometry. */
async function buildSkin(kind, skinId, iconId) {
  const { folder, calques = {}, wings } = KINDS[kind];
  const outDir = path.join(root, "public", folder, String(skinId));
  const metaFile = path.join(outDir, "directions.json");
  if (!force && fs.existsSync(metaFile)) return JSON.parse(fs.readFileSync(metaFile, "utf8"));
  fs.rmSync(outDir, { recursive: true, force: true });
  const { pxPerUnit, parts } = await renderSkin(path.join(cache, "skinjson", `${skinId}.json`), path.join(cache, "atlas", `${skinId}_atlas.png`), outDir, PX_PER_UNIT, DIRECTIONS);
  if (kind === "cape") for (const dir of DIRECTIONS) await composeCape(outDir, parts, dir, pxPerUnit);
  let torso = false;
  if (kind === "costume") for (const dir of DIRECTIONS) if (await composeTorso(outDir, parts, dir, pxPerUnit)) torso = true; else await composeNeck(outDir, parts, dir);
  const directions = {};
  if (wings) {
    for (const dir of DIRECTIONS) {
      const front = await composeWings(outDir, parts, dir);
      if (front) directions[dir] = { front };
    }
  }
  // In KINDS order, so a skin with two families for the same Calque (e.g. Cape and Sac) keeps the first one listed
  const priority = name => { const i = Object.keys(calques).indexOf(name.replace(/_\d$/, "")); return i < 0 ? Infinity : i; };
  for (const [name, p] of Object.entries(parts).sort(([a], [b]) => priority(a) - priority(b))) {
    const png = path.join(outDir, p.file);
    const [, part, dir] = name.match(/^([A-Za-z]+)_(\d)$/);
    const calque = calques[part];
    if (calque && !directions[dir]?.[calque]) {
      const file = p.file.replace(/\.png$/, ".webp");
      await sharp(png).webp(WEBP).toFile(path.join(outDir, file));
      (directions[dir] ??= {})[calque] = { file, width: p.width, height: p.height, originX: p.originX, originY: p.originY };
    }
    fs.rmSync(png); // the PNG was only an intermediate; unused parts (CapeBas…) are dropped too
  }
  await sharp(path.join(cache, "icons", `${iconId}.png`)).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp(WEBP).toFile(path.join(outDir, "icon.webp"));
  const meta = { pxPerUnit: torso ? pxPerUnit / TORSO_SCALE : pxPerUnit, directions };
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  return meta;
}

const catalogues = Object.fromEntries(Object.keys(KINDS).map(k => [k, []]));
const seen = new Set();
let skipped = 0;
for (const m of matches) {
  const key = m.look ? `${m.itemId}:${m.look}` : m.itemId; // a living item's looks share its id: "13213:1" is its first look
  const skinId = config.skins?.[key] ?? m.skinId;
  const verified = config.skins?.[key] !== undefined;
  if (exclude.has(key) || skinId == null) continue;
  const confident = m.score >= config.minScore || (m.score >= config.fallbackScore && m.margin >= config.fallbackMargin);
  if (!verified && !confident) { skipped++; continue; }
  // A living item's looks are told apart by their level, as players name them ("Chapeau Rolivan 1")
  const names = Object.fromEntries(LANGS.map(l => [l, (i18n[l].get(m.nameId) ?? "") + (m.look ? ` ${m.look}` : "")]));
  const seenKey = `${m.kind}:${skinId}:${names.fr}`; // the same item listed twice (same name, same look) is kept once
  if (!names.fr || seen.has(seenKey)) continue;
  seen.add(seenKey);
  try {
    const { pxPerUnit, directions } = await buildSkin(m.kind, skinId, m.iconId);
    if (!Object.keys(directions).length) continue;
    catalogues[m.kind].push({ itemId: m.itemId, skinId, names, pxPerUnit, directions });
  } catch (e) {
    console.warn(`skin ${skinId} (item ${m.itemId}): ${e.message}`);
  }
  const n = Object.values(catalogues).reduce((a, l) => a + l.length, 0);
  if (n % 100 === 0) console.log(`${n} items built`);
}

fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
for (const [kind, list] of Object.entries(catalogues)) {
  fs.writeFileSync(path.join(root, "src", "data", `${KINDS[kind].folder}.json`), JSON.stringify(list) + "\n");
}
console.log(`catalogue: ${Object.entries(catalogues).map(([k, l]) => `${l.length} ${k}`).join(", ")}; ${skipped} doubtful matches left out`);
