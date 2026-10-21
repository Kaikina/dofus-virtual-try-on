// Renders the spike's evidence: idle upper body (front + 3/4), re-posed arms, head roll / torso lean, expressions.
// Usage: node poses.mjs [bodySkin=11] [headSkin=2012]   → ../out/*.png
import sharp from "sharp";
import fs from "node:fs";
import { loadSkin, loadBones, frameNodes, composeTris, raster, mul, rotAbout, translate } from "./puppet.mjs";

const [bodyId = "11", headId = "2012"] = process.argv.slice(2);
const OUT = new URL("../out/", import.meta.url); fs.mkdirSync(OUT, { recursive: true });
const bones = loadBones("C:/Users/girou/dofus-virtual-try-on/.extraction-cache/bones/bone_1-static", "1-static");
const skins = { body: await loadSkin(bodyId), head: await loadSkin(headId) };
const deg = Math.PI / 180;

// Seated webcam framing: nothing below the belt.
const LOWER = /^(Pied|Jambe|Cuisse|Ombre|carried|Queue|CapeBas|Bouclier)/;
const VIEW = { x0: -62, x1: 62, y0: 60, y1: 168 }, PPU = 4;
const idle = d => frameNodes(bones, `AnimStatiqueExplo0_${d}`, 0);
const pos = m => ({ x: m.tX, y: m.tY });
const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Arm chain of one side ("D" = character's right, "G" = left): shoulder (Epaule = upper arm), elbow (Bras = forearm),
 *  wrist (Main = hand). Each symbol's origin is its joint, so the joints are just the matrices' translations. */
function chain(nodes, side) {
  const find = re => nodes.find(n => re.test(n.name));
  const sh = find(new RegExp(`^Epaule${side}_\\d$`)), el = find(new RegExp(`^Bras${side}_\\d$`)), wr = find(new RegExp(`^Main${side}\\d+_\\d$`));
  // Epaulettes and armbands are equipment slots riding on the arm; assign them to the nearest joint of this side
  const S = pos(sh.m), E = pos(el.m);
  const riders = nodes.filter(n => /^(Epaulette|Brassard)/.test(n.name) && n.m).map(n => ({ n, dS: dist(pos(n.m), S), dE: dist(pos(n.m), E) }));
  const other = side === "D" ? "G" : "D", oS = pos(find(new RegExp(`^Epaule${other}_\\d$`)).m), oE = pos(find(new RegExp(`^Bras${other}_\\d$`)).m);
  const mine = riders.filter(r => Math.min(r.dS, r.dE) < Math.min(dist(pos(r.n.m), oS), dist(pos(r.n.m), oE)));
  return { sh, el, wr, onUpper: mine.filter(r => r.dS <= r.dE).map(r => r.n), onFore: mine.filter(r => r.dS > r.dE).map(r => r.n) };
}

/** Re-pose one arm from two world angles (degrees, y up, 0 = towards screen right): upper arm (shoulder→elbow) and
 *  forearm (elbow→wrist). This is exactly what MediaPipe Pose landmarks 11-13-15 / 12-14-16 give. */
function poseArm(nodes, side, upperDeg, foreDeg, handExtraDeg = 0) {
  const c = chain(nodes, side);
  const S = pos(c.sh.m), E = pos(c.el.m), W = pos(c.wr.m);
  const a0 = ang(S, E), b0 = ang(E, W), L1 = dist(S, E), L2 = dist(E, W);
  const a = upperDeg * deg, b = foreDeg * deg;
  const R1 = rotAbout(a - a0, S.x, S.y);
  const E2 = { x: S.x + L1 * Math.cos(a), y: S.y + L1 * Math.sin(a) }, W2 = { x: E2.x + L2 * Math.cos(b), y: E2.y + L2 * Math.sin(b) };
  const R2 = mul(translate(E2.x - E.x, E2.y - E.y), rotAbout(b - b0, E.x, E.y));
  const R3 = mul(translate(W2.x - W.x, W2.y - W.y), rotAbout(b - b0 + handExtraDeg * deg, W.x, W.y));
  for (const n of [c.sh, ...c.onUpper]) n.m = mul(R1, n.m);
  for (const n of [c.el, ...c.onFore]) n.m = mul(R2, n.m);
  c.wr.m = mul(R3, c.wr.m);
  return c;
}

/** Torso lean (roll of the shoulder line) about the pelvis, and head roll about the neck. */
function leanAndRoll(nodes, leanDeg, headRollDeg) {
  const pelvis = pos(nodes.find(n => /^Bassin_\d$/.test(n.name)).m);
  const R = rotAbout(leanDeg * deg, pelvis.x, pelvis.y);
  for (const n of nodes) if (n.m && !LOWER.test(n.name) && !/^(Bassin|Jupe|Ceinture)/.test(n.name)) n.m = mul(R, n.m);
  const head = nodes.find(n => /^Tete_\d$/.test(n.name)), h = pos(head.m);
  head.m = mul(rotAbout(headRollDeg * deg, h.x, h.y), head.m);
}

/** Arms drawn over the torso (the idle frame puts them behind it, which only works while they hang at the sides). */
const armsInFront = (sides = ["D", "G"]) => nodes => {
  const isArm = n => /^(Epaule|Bras|Main|Brassard|Epaulette)/.test(n.name) && sides.some(s => n.name.includes(s));
  const arms = nodes.filter(isArm), rest = nodes.filter(n => !isArm(n));
  const i = rest.findIndex(n => /^Tete_\d$/.test(n.name));
  return [...rest.slice(0, i), ...arms, ...rest.slice(i)];
};

// Poses as world angles (deg). Front view: the character's right arm (D) is on screen left. In 3/4 (dir 1) the left
// arm (G) is the far one and stays behind the torso unless it crosses the body (farInFront).
const POSES = {
  idle: {},
  wave: { D: [205, 95, 0], lean: -6, roll: 6 },
  crossed: { D: [-80, 8, 0], G: [-100, 172, 0], farInFront: true },
  desk: { D: [-100, -25, 0], G: [-80, -155, 0], farInFront: true },
  cheer: { D: [150, 100, 0], G: [30, 80, 0], roll: -5 },
};

async function render(nodes, file, opts = {}) {
  const T = composeTris(skins, nodes, { skip: n => LOWER.test(n), ...opts });
  const r = raster(T, VIEW, PPU);
  await sharp(r.buf, { raw: { width: r.W, height: r.H, channels: 4 } }).png().toFile(new URL(file, OUT).pathname.slice(1));
  return r;
}

function posed(d, p) {
  const nodes = idle(d);
  if (p.lean || p.roll) leanAndRoll(nodes, p.lean ?? 0, p.roll ?? 0);
  if (p.D) poseArm(nodes, "D", ...p.D);
  if (p.G) poseArm(nodes, "G", ...p.G);
  return nodes;
}

const sheet = async (files, out, labels, bg = "#f4f1ea") => {
  const metas = await Promise.all(files.map(f => sharp(new URL(f, OUT).pathname.slice(1)).metadata()));
  const W = metas.reduce((s, m) => s + m.width, 0), H = Math.max(...metas.map(m => m.height)) + 28;
  let x = 0; const comps = [];
  for (let i = 0; i < files.length; i++) {
    comps.push({ input: new URL(files[i], OUT).pathname.slice(1), left: x, top: 0 });
    comps.push({ input: Buffer.from(`<svg width="${metas[i].width}" height="28"><text x="50%" y="19" font-family="Segoe UI, Arial" font-size="16" text-anchor="middle" fill="#333">${labels[i]}</text></svg>`), left: x, top: H - 28 });
    x += metas[i].width;
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: bg } }).composite(comps).png().toFile(new URL(out, OUT).pathname.slice(1));
};

// 1. Idle upper body, front (2) and 3/4 (1), with the arm joints marked
for (const d of [2, 1]) {
  const nodes = idle(d);
  await render(nodes, `idle_dir${d}.png`);
  const px = p => [(p.x - VIEW.x0) * PPU, (VIEW.y1 - p.y) * PPU];
  const dots = ["D", "G"].flatMap(s => { const c = chain(nodes, s); return [c.sh, c.el, c.wr].map((n, k) => ({ p: px(pos(n.m)), col: ["#e63946", "#2a9d8f", "#457b9d"][k] })); });
  const head = px(pos(nodes.find(n => /^Tete_\d$/.test(n.name)).m)), pelvis = px(pos(nodes.find(n => /^Bassin_\d$/.test(n.name)).m));
  const svg = `<svg width="${(VIEW.x1 - VIEW.x0) * PPU}" height="${(VIEW.y1 - VIEW.y0) * PPU}">` +
    dots.map(d => `<circle cx="${d.p[0]}" cy="${d.p[1]}" r="6" fill="${d.col}" stroke="#fff" stroke-width="2"/>`).join("") +
    `<rect x="${head[0] - 6}" y="${head[1] - 6}" width="12" height="12" fill="#f4a261" stroke="#fff" stroke-width="2"/>` +
    `<rect x="${pelvis[0] - 6}" y="${pelvis[1] - 6}" width="12" height="12" fill="#6d597a" stroke="#fff" stroke-width="2"/></svg>`;
  await sharp(new URL(`idle_dir${d}.png`, OUT).pathname.slice(1)).composite([{ input: Buffer.from(svg) }]).png().toFile(new URL(`rig_dir${d}.png`, OUT).pathname.slice(1));
}
await sheet(["rig_dir2.png", "rig_dir1.png"], "rig.png", ["face (dir 2)", "3/4 (dir 1)"]);

// 2. Re-posed arms, both directions
for (const d of [2, 1]) {
  const files = [];
  for (const [name, p] of Object.entries(POSES)) {
    const f = `pose_${name}_dir${d}.png`;
    await render(posed(d, p), f, name === "idle" ? {} : { order: armsInFront(d === 2 || p.farInFront ? ["D", "G"] : ["D"]) });
    files.push(f);
  }
  await sheet(files, `poses_dir${d}.png`, Object.keys(POSES));
}

// 3. Expressions: the head skin's Tete<N>_1 variants (3/4 only), plus the two front heads
const EXPR = [["Tete_1", "base"], ["Tete10_1", "blink"], ["Tete9_1", "sourire"], ["Tete6_1", "mdr"], ["Tete8_1", "peur"], ["Tete3_1", "enerver"], ["Tete7_1", "moqueur"]];
const HV = { x0: -30, x1: 30, y0: 112, y1: 172 };
const headOnly = async (d, part, file) => {
  const nodes = idle(d).filter(n => /^(Tete_\d|Cou_\d)$/.test(n.name));
  const r = raster(composeTris(skins, nodes, { headPart: part }), HV, 5);
  await sharp(r.buf, { raw: { width: r.W, height: r.H, channels: 4 } }).png().toFile(new URL(file, OUT).pathname.slice(1));
};
for (const [part, label] of EXPR) await headOnly(1, part, `expr_${label}.png`);
await headOnly(2, "Tete_2", "expr_front_base.png"); await headOnly(2, "Tete2_2", "expr_front_course.png");
await sheet([...EXPR.map(([, l]) => `expr_${l}.png`), "expr_front_base.png", "expr_front_course.png"], "expressions.png",
  [...EXPR.map(([p, l]) => `${l} (${p})`), "face: base (Tete_2)", "face: course (Tete2_2)"]);
console.log("done");
