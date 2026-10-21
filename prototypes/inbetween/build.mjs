// Builds the contact sheet (sheet.png) and the yaw-sweep animations (anim-*.webp, compare.webp/.gif).
import sharp from "sharp";
import { HATS, mix } from "./lib.mjs";
import { loadHat, snapDir, methodB, methodB2, loadRife, methodC } from "./methods.mjs";
import { toRGBA } from "./lib.mjs";

const BG = [0.85, 0.85, 0.85];
const hats = {}, rifes = {};
for (const id of HATS) { hats[id] = await loadHat(id); rifes[id] = await loadRife(id); }
/** Square crop around all three views of a hat, so every method of one hat is framed the same. */
const crop = {};
for (const id of HATS) {
  const bs = [0, 1, 2].map(d => hats[id][d].box), l = Math.min(...bs.map(b => b.l)), r = Math.max(...bs.map(b => b.r));
  const t = Math.min(...bs.map(b => b.t)), b = Math.max(...bs.map(b => b.b)), side = Math.max(r - l, b - t) + 24;
  crop[id] = { left: Math.max(0, Math.round((l + r - side) / 2)), top: Math.max(0, Math.round((t + b - side) / 2)), width: side, height: side };
}
const tile = (f, size, id) => sharp(toRGBA(f, BG), { raw: { width: f.w, height: f.h, channels: 4 } }).extract(crop[id]).resize(size, size).png().toBuffer();
const text = (s, w, h, size = 14, weight = "normal") => Buffer.from(`<svg width="${w}" height="${h}"><text x="4" y="${h - 6}" font-size="${size}" font-weight="${weight}" font-family="Arial">${s}</text></svg>`);

const METHODS = [
  ["A", "A snap (prod)", (id, yaw, st) => hats[id][st.dir = snapDir(yaw, st.dir)].f],
  ["B", "B bbox squash", (id, yaw) => methodB(hats[id], yaw)],
  ["B2", "B2 row warp", (id, yaw) => methodB2(hats[id], yaw)],
  ["C", "C RIFE v4.6", (id, yaw) => methodC(rifes[id], yaw)],
].filter(([k]) => k !== "C" || HATS.every(id => rifes[id]));

// Contact sheet: one block per hat, a row per method, a column per 7.5° of yaw
const YAWS = Array.from({ length: 13 }, (_, i) => i * 7.5), T = 150, LW = 130, HEAD = 26;
const tiles = [];
let top = 0;
tiles.push({ input: text("yaw →", LW, HEAD, 14, "bold"), left: 0, top });
for (const [c, y] of YAWS.entries()) tiles.push({ input: text(`${y}°${y === 0 ? " face" : y === 45 ? " 3/4" : y === 90 ? " profil" : ""}`, T, HEAD, 14, [0, 45, 90].includes(y) ? "bold" : "normal"), left: LW + c * T, top });
top += HEAD;
for (const id of HATS) {
  tiles.push({ input: text(`skin ${id}`, LW, HEAD, 16, "bold"), left: 0, top }); top += HEAD;
  for (const [, label, fn] of METHODS) {
    tiles.push({ input: text(label, LW, T / 2 + 10), left: 0, top });
    const st = {};
    for (const [c, yaw] of YAWS.entries()) tiles.push({ input: await tile(fn(id, yaw, st), T - 4, id), left: LW + c * T + 2, top: top + 2 });
    top += T;
  }
  top += 10;
}
await sharp({ create: { width: LW + YAWS.length * T, height: top, channels: 3, background: "#ffffff" } }).composite(tiles).png().toFile("sheet.png");
console.log("sheet.png");

// Animations: yaw 0 → 90 → 0 in 1.5° steps at 40 ms a frame; A crossfades for 90 ms (CROSSFADE_MS) on a Vue change
const FRAME_MS = 40, YAW_STEPS = [...Array.from({ length: 61 }, (_, i) => i * 1.5), ...Array.from({ length: 59 }, (_, i) => 88.5 - i * 1.5)];
const AT = 224;
function frameA(id, st, yaw, i) {
  const d = snapDir(yaw, st.dir);
  if (st.dir != null && d !== st.dir) { st.from = st.dir; st.at = i; }
  st.dir = d;
  const t = st.from == null ? 1 : Math.min(1, (i - st.at) * FRAME_MS / 90);
  return t >= 1 ? hats[id][d].f : mix(hats[id][st.from].f, hats[id][d].f, t);
}
const anim = {};
for (const [k, label, fn] of METHODS) {
  anim[k] = [];
  const st = Object.fromEntries(HATS.map(id => [id, {}]));
  for (const [i, yaw] of YAW_STEPS.entries()) {
    const parts = [];
    for (const [c, id] of HATS.entries()) parts.push({ input: await tile(k === "A" ? frameA(id, st[id], yaw, i) : fn(id, yaw), AT, id), left: c * AT, top: 20 });
    parts.push({ input: text(`${label} — yaw ${yaw.toFixed(1)}°`, AT * 3, 20, 13, "bold"), left: 0, top: 0 });
    anim[k].push(await sharp({ create: { width: AT * 3, height: AT + 20, channels: 3, background: "#d9d9d9" } }).composite(parts).png().toBuffer());
  }
  await sharp(anim[k], { join: { animated: true } }).webp({ quality: 85, delay: FRAME_MS, loop: 0 }).toFile(`anim-${k}.webp`);
  console.log(`anim-${k}.webp`);
}
// All methods stacked, to compare at a glance
const stacked = [];
for (let i = 0; i < YAW_STEPS.length; i++)
  stacked.push(await sharp({ create: { width: AT * 3, height: (AT + 20) * METHODS.length, channels: 3, background: "#d9d9d9" } })
    .composite(METHODS.map(([k], r) => ({ input: anim[k][i], left: 0, top: r * (AT + 20) }))).png().toBuffer());
await sharp(stacked, { join: { animated: true } }).webp({ quality: 85, delay: FRAME_MS, loop: 0 }).toFile("compare.webp");
await sharp(stacked, { join: { animated: true } }).gif({ delay: FRAME_MS, loop: 0 }).toFile("compare.gif");
console.log("compare.webp compare.gif");
