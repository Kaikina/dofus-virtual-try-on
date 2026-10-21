// Dev only: the live webcam with a hat drawn either the current way (A: choisirVue + 90 ms crossfade) or with the RIFE
// in-between frames of prototypes/inbetween (C: one frame per angle step between face and 3/4).
import { calqueUrl, coiffes, type CalqueImage, type Coiffe, type Direction } from "../src/domain/catalogue";
import { PoseSmoother } from "../src/domain/oneEuro";
import { choisirVue, type VueChoice } from "../src/domain/paliers";
import { computePose, headOutline, orderedOval, type Repere } from "../src/domain/pose";
import { placer, reglagePour, reglagesParDefaut, type Placement, type Reglage } from "../src/domain/reglages";
import { loaded } from "../src/render/scene";
import { FaceTracker } from "../src/tracking/faceTracker";
import frames from "../prototypes/inbetween/live/frames.json";

type Layer = "front" | "back";
interface FrameSet { frames: number; layers: Partial<Record<Layer, Omit<CalqueImage, "file">>> }
const FRAMES = frames as Record<string, FrameSet>;
const HATS = Object.keys(FRAMES).map(Number).map(id => coiffes.find(c => c.skinId === id)).filter((c): c is Coiffe => !!c);
const CROSSFADE_MS = 90; // as in src/render/scene.ts
/** |yaw| below which C keeps the side it was on, so an asymmetric face drawing doesn't flip back and forth at 0°. */
const SIDE_HYSTERESIS_DEG = 3;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas"), ctx = canvas.getContext("2d")!;
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;
const params = new URLSearchParams(location.search);
/** ?timer: drive the loop with a timer, for when requestAnimationFrame is paused (a hidden window, automated checks). */
const nextFrame = (f: (now: number) => void) => params.has("timer") ? setTimeout(() => f(performance.now()), 1000 / 30) : requestAnimationFrame(f);

let mode: "A" | "C" = params.get("mode") === "C" ? "C" : "A";
let hat: Coiffe = HATS.find(h => h.skinId === Number(params.get("skin"))) ?? HATS[0];

// ---------- Images ----------

const images = new Map<string, HTMLImageElement>();
function image(url: string): HTMLImageElement {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img;
}
const frameUrl = (skinId: number, layer: Layer, k: number) => `/prototypes/inbetween/live/${skinId}/${layer}_${k}.webp`;
function preload(h: Coiffe): void {
  for (const v of Object.values(h.directions)) for (const c of Object.values(v)) image(calqueUrl("coiffe", h.skinId, c as CalqueImage));
  const set = FRAMES[h.skinId];
  for (const layer of Object.keys(set.layers) as Layer[]) for (let k = 0; k < set.frames; k++) image(frameUrl(h.skinId, layer, k));
}

// ---------- UI ----------

const hatsEl = $("hats");
for (const h of HATS) {
  const b = document.createElement("button");
  b.textContent = `${h.names.fr} (${h.skinId})`;
  b.dataset.skin = String(h.skinId);
  b.addEventListener("click", () => { hat = h; preload(h); refreshButtons(); });
  hatsEl.append(b);
}
function refreshButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.querySelectorAll<HTMLButtonElement>("[data-skin]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.skin) === hat.skinId)));
}
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.addEventListener("click", () => { mode = b.dataset.mode as "A" | "C"; refreshButtons(); }));
addEventListener("keydown", e => {
  if (e.code !== "Space" || e.target instanceof HTMLInputElement) return;
  e.preventDefault();
  mode = mode === "A" ? "C" : "A";
  refreshButtons();
});
const yaw34 = $<HTMLInputElement>("yaw34"), manual = $<HTMLInputElement>("manual"), yawSlider = $<HTMLInputElement>("yaw");
const showYaw34 = () => ($("yaw34v").textContent = yaw34.value);
yaw34.addEventListener("input", showYaw34);
manual.addEventListener("change", () => (yawSlider.disabled = !manual.checked));
showYaw34();
refreshButtons();
preload(hat);

// ---------- Camera and tracking ----------

/** ?source=<image>: a fake camera filming a still image (as in src/main.ts), to test without a webcam. */
async function imageStream(url: string): Promise<MediaStream> {
  const img = new Image();
  img.src = url;
  await loaded(img);
  const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
  const g = c.getContext("2d")!;
  setInterval(() => g.drawImage(img, 0, 0), 1000 / 30);
  g.drawImage(img, 0, 0);
  return c.captureStream(30);
}

let tracker: FaceTracker | null = null;
const smoother = new PoseSmoother();
const ovalIndices = orderedOval(FaceTracker.ovalEdges);
let repere: Repere | null = null, oval: { x: number; y: number }[] | null = null;

$("start").addEventListener("click", async () => {
  const b = $<HTMLButtonElement>("start");
  b.disabled = true;
  b.textContent = "Chargement…";
  const source = params.get("source");
  video.srcObject = source ? await imageStream(source)
    : await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  await video.play();
  tracker = await FaceTracker.create();
  b.textContent = "Caméra active";
  nextFrame(loop);
});

let lastVideoTime = -1;
function track(now: number): void {
  const lm = tracker!.detect(video, now);
  const w = video.videoWidth, h = video.videoHeight;
  if (!lm) { repere = null; oval = null; smoother.reset(); return; }
  repere = smoother.smooth(computePose(lm, w, h), now / 1000);
  oval = ovalIndices.map(i => ({ x: (1 - lm[i].x) * w, y: lm[i].y * h }));
}

// ---------- Drawing ----------

/** A: the Vue currently shown and the one it is crossfading from (as SuiviEtat in scene.ts). */
let shown: { choice: VueChoice; at: number } | null = null, previous: VueChoice | null = null;
/** C: the side the hat faces (mirrored = head turned toward screen-left). */
let mirroredC = false;

function drawImageAt(img: HTMLImageElement, c: Omit<CalqueImage, "file">, p: Placement, alpha: number): void {
  if (!img.complete || !img.naturalWidth || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.scale(p.scaleX, p.scaleY);
  ctx.drawImage(img, -c.originX, -c.originY, c.width, c.height);
  ctx.restore();
}

/** Draws a back Calque only outside the head (crown included), like Scene.drawCoiffe. */
function behindHead(draw: () => void): void {
  ctx.save();
  if (oval && oval.length > 2 && repere) {
    const poly = headOutline(oval, repere);
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(poly[0].x, poly[0].y);
    for (const p of poly.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.clip("evenodd");
  }
  draw();
  ctx.restore();
}

function drawA(r: Repere, now: number): string {
  const choice = choisirVue(r.yawDeg, shown?.choice ?? null);
  if (!shown || shown.choice.direction !== choice.direction || shown.choice.mirrored !== choice.mirrored) {
    previous = shown?.choice ?? null;
    shown = { choice, at: now };
  }
  const t = Math.min(1, (now - shown.at) / CROSSFADE_MS);
  const layers: [VueChoice, number][] = previous && t < 1 ? [[previous, 1 - t], [shown.choice, t]] : [[shown.choice, 1]];
  for (const [c, alpha] of layers) {
    const vue = hat.directions[c.direction];
    if (!vue) continue;
    const place = placer(r, c, reglagePour(reglagesParDefaut, "coiffe", hat.skinId, c.direction), hat.pxPerUnit);
    if (vue.back) behindHead(() => drawImageAt(image(calqueUrl("coiffe", hat.skinId, vue.back!)), vue.back!, place, alpha));
    if (vue.front) drawImageAt(image(calqueUrl("coiffe", hat.skinId, vue.front)), vue.front, place, alpha);
  }
  return `vue ${shown.choice.direction}${shown.choice.mirrored ? " (miroir)" : ""}`;
}

function drawC(r: Repere): string {
  const set = FRAMES[hat.skinId];
  const abs = Math.abs(r.yawDeg);
  if (abs > SIDE_HYSTERESIS_DEG) mirroredC = r.yawDeg < 0;
  const t = Math.min(1, abs / Number(yaw34.value));
  const k = Math.round(t * (set.frames - 1));
  // The Réglage moves from the face Vue's to the 3/4 Vue's along with the drawing
  const [r2, r1] = ([2, 1] as Direction[]).map(d => reglagePour(reglagesParDefaut, "coiffe", hat.skinId, d));
  const reglage: Reglage = { dx: r2.dx + (r1.dx - r2.dx) * t, dy: r2.dy + (r1.dy - r2.dy) * t, scale: r2.scale + (r1.scale - r2.scale) * t };
  const place = placer(r, { direction: t < 0.5 ? 2 : 1, mirrored: mirroredC }, reglage, hat.pxPerUnit);
  const back = set.layers.back, front = set.layers.front;
  if (back) behindHead(() => drawImageAt(image(frameUrl(hat.skinId, "back", k)), back, place, 1));
  if (front) drawImageAt(image(frameUrl(hat.skinId, "front", k)), front, place, 1);
  return `image ${k}/${set.frames - 1} (t = ${t.toFixed(2)})${mirroredC ? " miroir" : ""}`;
}

function loop(now: number): void {
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    track(now);
  }
  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
  ctx.save();
  ctx.setTransform(-1, 0, 0, 1, w, 0); // mirrored like a selfie
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  let info = "pas de visage";
  if (repere) {
    const r = manual.checked ? { ...repere, yawDeg: Number(yawSlider.value) } : repere;
    const what = mode === "A" ? drawA(r, now) : drawC(r);
    info = `méthode ${mode} · yaw ${r.yawDeg.toFixed(1)}°${manual.checked ? " (manuel)" : ""} · ${what}`;
  }
  $("info").textContent = info;
  nextFrame(loop);
}
