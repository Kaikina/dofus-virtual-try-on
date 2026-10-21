// Dev only: a Dofus character puppeted by the webcam, VTuber style, for a seated player (prototypes/character).
// The rig is the idle frame of bone_1-static (absolute matrices, no hierarchy); arms are re-posed by forward kinematics
// from two angles per arm (Pose landmarks 11-13-15 / 12-14-16), the torso leans with the shoulder line, the head rolls
// with the face and its expression comes from the face blendshapes.
import { FaceLandmarker, FilesetResolver, PoseLandmarker, type Category } from "@mediapipe/tasks-vision";
import { PoseSmoother } from "../src/domain/oneEuro";
import { choisirVue, type VueChoice } from "../src/domain/paliers";
import { computePose, computeShoulders, type Landmark, type Repere } from "../src/domain/pose";
import { loaded } from "../src/render/scene";
import puppetJson from "../prototypes/character/live/puppet.json";

// ---------- Rig data ----------

/** Affine map [a b tx c d ty]: x' = a·x + b·y + tx, y' = c·x + d·y + ty. */
type Mat = [number, number, number, number, number, number];
interface Piece { file: string; width: number; height: number; originX: number; originY: number }
/** `alpha`: a piece only one direction has, faded while turning between the two. */
interface RigNode { name: string; piece: string; m: Mat; alpha?: number }
/** `turn`: RIFE frames of each piece the two directions share (by name without the direction, e.g. "Torse"), from
 *  face (frame 0) to 3/4 (last frame), made by scripts/rife-turn.mjs. All frames of a piece share one size and origin. */
interface Turn { frames: number; pieces: Record<string, Omit<Piece, "file"> & { dir: string }> }
interface PuppetData { pxPerUnit: number; pieces: Record<string, Piece | null>; directions: Record<string, RigNode[]>; heads: Record<string, string>; turn?: Turn }
const DATA = puppetJson as unknown as PuppetData;
const LIVE = "/prototypes/character/live/";

const mul = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
  A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
const rotAbout = (ang: number, cx: number, cy: number): Mat => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy];
};
const translate = (dx: number, dy: number): Mat => [1, 0, dx, 0, 1, dy];
const pos = (m: Mat) => ({ x: m[2], y: m[5] });
const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Difference b - a of two angles in degrees, in [-180, 180). */
const angDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
/** An angle in degrees brought into [-180, 180). */
const norm180 = (a: number) => angDiff(0, a);

type Side = "D" | "G";
type Dir = 1 | 2;
const armRe = (side: Side) => new RegExp(`^(Epaule|Bras|Main)${side}`);
const find = (nodes: RigNode[], re: RegExp) => nodes.find(n => re.test(n.name))!;

/** Joints of one arm in a rig: shoulder (Epaule origin), elbow (Bras origin), wrist (Main origin). */
function joints(nodes: RigNode[], side: Side) {
  const sh = find(nodes, new RegExp(`^Epaule${side}_`)), el = find(nodes, new RegExp(`^Bras${side}_`)), wr = find(nodes, new RegExp(`^Main${side}\\d+_`));
  return { sh, el, wr, S: pos(sh.m), E: pos(el.m), W: pos(wr.m) };
}
const angleDeg = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x) / DEG;

/** Rest angles (upper arm, forearm) of each arm in each direction, from the idle frame. */
const IDLE: Record<Dir, Record<Side, [number, number]>> = { 1: { D: [0, 0], G: [0, 0] }, 2: { D: [0, 0], G: [0, 0] } };
for (const d of [1, 2] as Dir[]) for (const s of ["D", "G"] as Side[]) {
  const j = joints(DATA.directions[d], s);
  IDLE[d][s] = [angleDeg(j.S, j.E), angleDeg(j.E, j.W)];
}
/** "Hands on the desk": forearms toward the body's centre, slightly down. */
const DESK: Record<Side, [number, number]> = { D: [-100, -25], G: [-80, -155] };

/** Re-poses one arm from world angles in degrees (y up): upper arm shoulder→elbow, forearm elbow→wrist. */
function poseArm(nodes: RigNode[], side: Side, upper: number, fore: number) {
  const j = joints(nodes, side);
  const a0 = angleDeg(j.S, j.E), b0 = angleDeg(j.E, j.W);
  const L1 = Math.hypot(j.E.x - j.S.x, j.E.y - j.S.y), L2 = Math.hypot(j.W.x - j.E.x, j.W.y - j.E.y);
  const E2 = { x: j.S.x + L1 * Math.cos(upper * DEG), y: j.S.y + L1 * Math.sin(upper * DEG) };
  const W2 = { x: E2.x + L2 * Math.cos(fore * DEG), y: E2.y + L2 * Math.sin(fore * DEG) };
  j.sh.m = mul(rotAbout((upper - a0) * DEG, j.S.x, j.S.y), j.sh.m);
  j.el.m = mul(translate(E2.x - j.E.x, E2.y - j.E.y), mul(rotAbout((fore - b0) * DEG, j.E.x, j.E.y), j.el.m));
  j.wr.m = mul(translate(W2.x - j.W.x, W2.y - j.W.y), mul(rotAbout((fore - b0) * DEG, j.W.x, j.W.y), j.wr.m));
  return W2;
}

// ---------- Inputs (from tracking or from the demo) ----------

/** Expression = a head variant of the head skin. Only the 3/4 direction has them. */
type Expression = "base" | "blink" | "sourire" | "mdr" | "peur" | "enerver" | "moqueur" | "bouche";
const EXPR_HEAD: Record<Expression, string> = { base: "Tete_1", blink: "Tete10_1", sourire: "Tete9_1", mdr: "Tete6_1", peur: "Tete8_1", enerver: "Tete3_1", moqueur: "Tete7_1", bouche: "Tete2_1" };

/** Arm targets in screen space (degrees, y up, as seen in the mirrored preview), screen-left and screen-right arm. */
/** `reach`: shoulder → wrist in shoulder widths (screen, y up), when the wrist is seen but not the elbow (sitting close
 *  to the webcam, the elbows are often below the frame while the hand is up): the elbow is then solved by IK. */
interface ArmInput { upper: number | null; fore: number | null; reach?: { x: number; y: number }; elbowHint?: { x: number; y: number } }
interface Inputs {
  /** Face yaw (degrees, positive toward screen-right) and roll (radians, clockwise), or null when no face. */
  face: { yawDeg: number; roll: number } | null;
  /** Shoulder line roll (radians, clockwise) and on-screen position, or null when the shoulders aren't seen. */
  shoulders: Repere | null;
  arms: { left: ArmInput; right: ArmInput };
  expression: Expression;
}

// ---------- UI ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas"), ctx = canvas.getContext("2d")!;
const info = $("info");
const params = new URLSearchParams(location.search);
const nextFrame = (f: (now: number) => void) => params.has("timer") ? setTimeout(() => f(performance.now()), 1000 / 30) : requestAnimationFrame(f);

let show: "vtuber" | "overlay" = params.get("show") === "overlay" ? "overlay" : "vtuber";
let dirMode: "auto" | "1" | "2" = (["1", "2"].includes(params.get("dir") ?? "") ? params.get("dir") : "auto") as "auto" | "1" | "2";
let rest: "idle" | "desk" = params.get("rest") === "desk" ? "desk" : "idle";
/**
 * Turning. A: body and head snap together between the face and 3/4 directions. C: the head follows the yaw through its
 * RIFE frames, the body snaps (later, so the head leads). CC: every piece through its RIFE frames — the body ones melt
 * into a blob mid-turn, kept only to compare.
 */
type TurnMode = "A" | "C" | "CC";
let headMode: TurnMode = !DATA.turn ? "A" : (["A", "CC"].includes(params.get("head") ?? "") ? params.get("head") : "C") as TurnMode;
/** Yaw (degrees) where the head reaches the 3/4 drawing (C, CC), and where the body does (CC) or snaps to it (C). */
const yaw34 = $<HTMLInputElement>("yaw34"), yaw34b = $<HTMLInputElement>("yaw34b");
const showYaw34 = () => { $("yaw34v").textContent = yaw34.value; $("yaw34bv").textContent = yaw34b.value; };
yaw34.addEventListener("input", showYaw34);
yaw34b.addEventListener("input", showYaw34);
showYaw34();
const manual = $<HTMLInputElement>("manual"), yawSlider = $<HTMLInputElement>("yaw");
manual.addEventListener("change", () => (yawSlider.disabled = !manual.checked));
const skeleton = $<HTMLInputElement>("skeleton");
function refreshButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-show]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.show === show)));
  document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dir === dirMode)));
  document.querySelectorAll<HTMLButtonElement>("[data-rest]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.rest === rest)));
  document.querySelectorAll<HTMLButtonElement>("[data-head]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.head === headMode)));
}
document.querySelectorAll<HTMLButtonElement>("[data-show]").forEach(b => b.addEventListener("click", () => { show = b.dataset.show as typeof show; refreshButtons(); }));
document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach(b => b.addEventListener("click", () => { dirMode = b.dataset.dir as typeof dirMode; refreshButtons(); }));
document.querySelectorAll<HTMLButtonElement>("[data-rest]").forEach(b => b.addEventListener("click", () => { rest = b.dataset.rest as typeof rest; refreshButtons(); }));
document.querySelectorAll<HTMLButtonElement>("[data-head]").forEach(b => b.addEventListener("click", () => { headMode = b.dataset.head as typeof headMode; refreshButtons(); }));
addEventListener("keydown", e => {
  if (e.code !== "Space" || e.target instanceof HTMLInputElement) return;
  e.preventDefault();
  headMode = headMode === "A" ? "C" : "A"; // CC is only a comparison: Space toggles A and C
  refreshButtons();
});
refreshButtons();

const TURN = DATA.turn;
const turnKey = (name: string, k: number) => `turn_${name}_${k}`;
if (TURN) for (const [name, p] of Object.entries(TURN.pieces))
  for (let k = 0; k < TURN.frames; k++) DATA.pieces[turnKey(name, k)] = { file: `${p.dir}${k}.webp`, width: p.width, height: p.height, originX: p.originX, originY: p.originY };
const images = new Map<string, HTMLImageElement>();
for (const [key, p] of Object.entries(DATA.pieces)) if (p) images.set(key, Object.assign(new Image(), { src: LIVE + p.file }));

// ---------- Camera and tracking ----------

const video = document.createElement("video");
video.muted = true;
video.playsInline = true;

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

let face: FaceLandmarker | null = null, pose: PoseLandmarker | null = null;
let demo = false;
async function createTrackers(): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const make = async <T>(f: (delegate: "GPU" | "CPU") => Promise<T>) => { try { return await f("GPU"); } catch { return f("CPU"); } };
  face = await make(delegate => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
  }));
  pose = await make(delegate => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate }, runningMode: "VIDEO", numPoses: 1,
  }));
}

$("start").addEventListener("click", async () => {
  const b = $<HTMLButtonElement>("start");
  b.disabled = true;
  b.textContent = "Chargement…";
  const source = params.get("source");
  video.srcObject = source ? await imageStream(source)
    : await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  await video.play();
  await createTrackers();
  b.textContent = "Caméra active";
  demo = false;
  if (!running) { running = true; nextFrame(loop); }
});
$("demo").addEventListener("click", () => { demo = true; if (!running) { running = true; nextFrame(loop); } });

/** Below this visibility (or outside the image) a Pose landmark is not trusted: it is extrapolated. */
const MIN_VISIBILITY = 0.6;
const headSmoother = new PoseSmoother(), shoulderSmoother = new PoseSmoother();
let lastLm: Landmark[] | null = null;

/** Expression from the blendshapes, with a short hold so it doesn't flicker. */
let expr: Expression = "base", exprSince = 0;
function expressionFrom(cats: Category[] | undefined, now: number): Expression {
  if (!cats) return "base";
  const b = (n: string) => cats.find(c => c.categoryName === n)?.score ?? 0;
  const smile = (b("mouthSmileLeft") + b("mouthSmileRight")) / 2, jaw = b("jawOpen");
  const wide = (b("eyeWideLeft") + b("eyeWideRight")) / 2, frown = (b("browDownLeft") + b("browDownRight")) / 2;
  let e: Expression = "base";
  if (b("tongueOut") > 0.4) e = "moqueur";
  else if (smile > 0.4 && jaw > 0.3) e = "mdr";
  else if (smile > 0.45) e = "sourire";
  else if (jaw > 0.3 && (wide > 0.3 || b("browInnerUp") > 0.5)) e = "peur";
  else if (frown > 0.45) e = "enerver";
  else if (jaw > 0.3) e = "bouche";
  // A blink is short: show it at once, over a neutral face only
  if (e === "base" && b("eyeBlinkLeft") > 0.45 && b("eyeBlinkRight") > 0.45) return "blink";
  if (e !== expr && now - exprSince > 150) { expr = e; exprSince = now; }
  return expr;
}

function track(now: number): Inputs {
  const w = video.videoWidth, h = video.videoHeight;
  const fr = face!.detectForVideo(video, now), pr = pose!.detectForVideo(video, now);
  const flm = fr.faceLandmarks[0];
  const head = flm ? headSmoother.smooth(computePose(flm, w, h), now / 1000) : null;
  if (!flm) headSmoother.reset();
  const lm = pr.landmarks[0], world = pr.worldLandmarks[0];
  lastLm = lm ?? null;
  const sh = lm && world ? computeShoulders(lm, world, w, h) : null;
  const shoulders = sh ? shoulderSmoother.smooth(sh, now / 1000) : null;
  if (!sh) shoulderSmoother.reset();
  const arms = { left: { upper: null, fore: null } as ArmInput, right: { upper: null, fore: null } as ArmInput };
  if (lm) {
    const ok = (i: number) => (lm[i].visibility ?? 1) > MIN_VISIBILITY && lm[i].x > 0.01 && lm[i].x < 0.99 && lm[i].y > 0.01 && lm[i].y < 0.99;
    // Shoulders on the bottom edge of the frame are common when seated: Pose still places them well from the rest of
    // the body, so take them unless they're far off-frame
    const shoulderOk = (i: number) => (lm[i].visibility ?? 1) > 0.2 || (lm[i].y < 1.1 && lm[i].x > -0.05 && lm[i].x < 1.05);
    const P = (i: number) => ({ x: (1 - lm[i].x) * w, y: -lm[i].y * h }); // mirrored, y up
    // The arm whose shoulder is on screen-left drives the character's screen-left arm, like a mirror
    const sets = [[11, 13, 15], [12, 14, 16]].sort((a, b) => P(a[0]).x - P(b[0]).x);
    for (const [k, [s, e, wr]] of sets.entries()) {
      const arm = k === 0 ? arms.left : arms.right;
      if (!shoulderOk(s)) continue;
      if (ok(e)) {
        arm.upper = angleDeg(P(s), P(e));
        if (ok(wr)) arm.fore = angleDeg(P(e), P(wr));
      } else if (ok(wr)) {
        const [a, b] = sets.map(set => P(set[0])), width = Math.hypot(b.x - a.x, b.y - a.y);
        if (width > 1) {
          arm.reach = { x: (P(wr).x - P(s).x) / width, y: (P(wr).y - P(s).y) / width };
          // Pose still guesses the off-frame elbow: too rough to place it, good enough to tell which way it bends
          arm.elbowHint = { x: (P(e).x - P(s).x) / width, y: (P(e).y - P(s).y) / width };
        }
      }
    }
  }
  return {
    face: head && { yawDeg: head.yawDeg, roll: head.roll }, shoulders, arms,
    expression: expressionFrom(fr.faceBlendshapes?.[0]?.categories, now),
  };
}

/** Demo: a scripted performance, to check the rig without a camera (?demo, or ?demo=turn). */
function demoInputs(now: number): Inputs {
  const t = now / 1000;
  // ?demo=turn: a neutral face turning slowly from one side to the other, arms at rest (to judge the head turn)
  if (params.get("demo") === "turn") {
    return { face: { yawDeg: Math.sin(t * 0.6) * 40, roll: 0 }, shoulders: null, arms: { left: { upper: null, fore: null }, right: { upper: null, fore: null } }, expression: "base" };
  }
  const cycle = Math.floor(t / 4) % 5;
  const wave = Math.sin(t * 6) * 20;
  const arms = [
    { left: { upper: 205, fore: 95 + wave }, right: { upper: null, fore: null } },
    { left: { upper: -80, fore: 8 }, right: { upper: -100, fore: 172 } },
    { left: { upper: 150, fore: 100 }, right: { upper: 30, fore: 80 } },
    { left: { upper: -110, fore: null }, right: { upper: null, fore: null } },
    // Elbows below the frame, only the right hand seen (shoulder → wrist in shoulder widths, no elbow hint): just above
    // the shoulder for 2 s, then waving beside the head
    { left: { upper: null, fore: null }, right: { upper: null, fore: null, reach: t % 4 < 2 ? { x: 0.3, y: 0.35 } : { x: 0.35 + Math.sin(t * 6) * 0.15, y: 0.9 } } },
  ][cycle];
  const exprs: Expression[] = ["sourire", "base", "mdr", "peur", "base"];
  return {
    face: { yawDeg: Math.sin(t * 0.5) * 30, roll: Math.sin(t * 1.3) * 0.15 },
    shoulders: { anchor: { x: 0, y: 0 }, width: 0, roll: Math.sin(t * 0.9) * 0.08, yawDeg: 0 },
    arms, expression: Math.sin(t * 3) > 0.97 ? "blink" : exprs[cycle],
  };
}

// ---------- Puppet state ----------

let vue: VueChoice = { direction: 1, mirrored: false };
/** C: the side the character faces (true = toward screen-left), kept while looking straight ahead (asymmetric drawings). */
let facesLeft = false;
const SIDE_HYSTERESIS_DEG = 3;
/** Smoothed angles of each character arm, in the character's own (unmirrored) space. */
const armState: Record<Side, { upper: number; fore: number; tracked: string; front: boolean }> = {
  D: { upper: IDLE[1].D[0], fore: IDLE[1].D[1], tracked: "repos", front: false },
  G: { upper: IDLE[1].G[0], fore: IDLE[1].G[1], tracked: "repos", front: false },
};
let lastNow = 0;

/** How far the body and the head are turned, from face (0) to 3/4 (1), and the direction they're nearest to. */
interface Turning { d: Dir; mirrored: boolean; tBody: number; tHead: number; label: string }

function turning(inp: Inputs): Turning {
  const yaw = inp.face?.yawDeg ?? 0;
  if (headMode === "A" || !TURN) {
    if (dirMode === "auto") vue = inp.face ? choisirVue(yaw, vue) : vue;
    // Forced 3/4: still face the side the head turns to (kept while looking straight ahead)
    else vue = { direction: Number(dirMode) as Dir, mirrored: dirMode === "1" ? (Math.abs(yaw) > SIDE_HYSTERESIS_DEG ? yaw < 0 : vue.mirrored) : false };
    const d = vue.direction as Dir;
    return { d, mirrored: vue.mirrored, tBody: d === 1 ? 1 : 0, tHead: d === 1 ? 1 : 0, label: `A · direction ${d}` };
  }
  if (Math.abs(yaw) > SIDE_HYSTERESIS_DEG) facesLeft = yaw < 0;
  const at = (limit: HTMLInputElement) => dirMode === "auto" ? clamp(Math.abs(yaw) / Number(limit.value), 0, 1) : dirMode === "1" ? 1 : 0;
  const tHead = at(yaw34);
  const f = (t: number) => `${Math.round(t * (TURN.frames - 1))}/${TURN.frames - 1}`;
  if (headMode === "CC") {
    const tBody = at(yaw34b);
    return { d: tBody < 0.5 ? 2 : 1, mirrored: facesLeft, tBody, tHead, label: `CC · corps ${f(tBody)}, tête ${f(tHead)}` };
  }
  // C: the body snaps at its own threshold; head and body face the same side (the face body is nearly symmetric)
  if (dirMode === "auto") vue = inp.face ? choisirVue(yaw, vue, { face: Number(yaw34b.value), hysteresis: SIDE_HYSTERESIS_DEG }) : vue;
  else vue = { direction: Number(dirMode) as Dir, mirrored: facesLeft };
  const d = vue.direction as Dir;
  return { d, mirrored: facesLeft, tBody: d === 1 ? 1 : 0, tHead, label: `C · corps direction ${d}, tête ${f(tHead)}` };
}

const baseName = (name: string) => name.replace(/_\d$/, "");
/**
 * The idle rig at turn t (A: t is 0 or 1). In between, the pieces both directions have get a lerped matrix (the idle
 * rigs are close enough for that) and their RIFE frame nearest t; pieces only one direction has fade out or in; the
 * draw order switches at t = 0.5.
 */
function rigAt(t: number): RigNode[] {
  const A = DATA.directions[2], B = DATA.directions[1];
  if (!TURN || t <= 0 || t >= 1) return (t >= 1 ? B : A).map(n => ({ ...n, m: [...n.m] as Mat }));
  const k = Math.round(t * (TURN.frames - 1));
  const inA = new Map(A.map(n => [baseName(n.name), n])), inB = new Map(B.map(n => [baseName(n.name), n]));
  const [main, other] = t < 0.5 ? [A, B] : [B, A];
  const place = (n: RigNode): RigNode => {
    const name = baseName(n.name), a = inA.get(name), b = inB.get(name);
    // Fading them in and out showed both belts half-transparent at once (a grey halo): switch at halfway instead
    if (!a || !b) return { ...n, m: [...n.m] as Mat, alpha: (a ? t < 0.5 : t >= 0.5) ? 1 : 0 };
    return { name: n.name, piece: TURN.pieces[name] ? turnKey(name, k) : (t < 0.5 ? a : b).piece, m: a.m.map((v, i) => v + (b.m[i] - v) * t) as Mat };
  };
  const out = main.map(place);
  // Pieces of the other direction that this one lacks: insert them after the piece that precedes them over there
  const shared = other === A ? inB : inA;
  for (const [i, n] of other.entries()) {
    if (shared.has(baseName(n.name))) continue;
    const prev = other.slice(0, i).reverse().find(p => out.some(o => baseName(o.name) === baseName(p.name)));
    const at = prev ? out.findIndex(o => baseName(o.name) === baseName(prev.name)) + 1 : 0;
    out.splice(at, 0, place(n));
  }
  return out;
}

/** Rest angles (upper arm, forearm) of one arm in a rig. */
function restOf(nodes: RigNode[], side: Side): [number, number] {
  const j = joints(nodes, side);
  return [angleDeg(j.S, j.E), angleDeg(j.E, j.W)];
}

/**
 * Two-bone IK: the (upper arm, forearm) angles that put this arm's wrist at `reach` from its shoulder (in shoulder
 * widths, screen space). Of the two elbow solutions, the one nearest Pose's guess of the off-frame elbow (`hint`), or
 * else the lower one (elbows hang down: a hand raised near the shoulder has its elbow below, not up by the head).
 * Out of reach: the arm points straight at the wrist.
 */
function solveElbow(nodes: RigNode[], side: Side, reach: { x: number; y: number }, mirrored: boolean, hint?: { x: number; y: number }): [number, number] {
  const j = joints(nodes, side), other = joints(nodes, side === "D" ? "G" : "D");
  const L1 = Math.hypot(j.E.x - j.S.x, j.E.y - j.S.y), L2 = Math.hypot(j.W.x - j.E.x, j.W.y - j.E.y);
  // The player's shoulder width maps onto the front rig's (a 3/4 rig looks narrower, but its arms keep their length)
  const f = joints(DATA.directions[2], "D").S, g = joints(DATA.directions[2], "G").S, scale = Math.hypot(g.x - f.x, g.y - f.y);
  const tx = (mirrored ? -reach.x : reach.x) * scale, ty = reach.y * scale;
  const d = clamp(Math.hypot(tx, ty), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const theta = Math.atan2(ty, tx), alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  // The two elbow solutions mirror each other across the shoulder→wrist line
  const cands = [theta + alpha, theta - alpha].map(u => ({ u, ex: L1 * Math.cos(u), ey: L1 * Math.sin(u) }));
  const hintAngle = hint && Math.atan2(hint.y, mirrored ? -hint.x : hint.x);
  const outward = Math.sign(j.S.x - other.S.x) || -1;
  const [best] = hintAngle !== undefined
    ? cands.sort((p, q) => Math.abs(angDiff(p.u / DEG, hintAngle / DEG)) - Math.abs(angDiff(q.u / DEG, hintAngle / DEG)))
    : cands.sort((p, q) => (p.ey - q.ey) || (q.ex * outward - p.ex * outward));
  return [best.u / DEG, angleDeg({ x: best.ex, y: best.ey }, { x: d * Math.cos(theta), y: d * Math.sin(theta) })];
}

function updateArms(inp: Inputs, nodes: RigNode[], mirrored: boolean, dt: number): void {
  // Screen angle → character angle: the mirrored character sees the scene flipped left-right
  const toChar = (a: number) => (mirrored ? 180 - a : a);
  const screenToSide: Record<"left" | "right", Side> = mirrored ? { left: "G", right: "D" } : { left: "D", right: "G" };
  for (const which of ["left", "right"] as const) {
    const side = screenToSide[which], st = armState[side], target = inp.arms[which];
    const idle = restOf(nodes, side);
    let up: number, fo: number;
    const ik = target.upper === null && target.reach ? solveElbow(nodes, side, target.reach, mirrored, target.elbowHint) : null;
    if (ik) {
      [up, fo] = ik;
      st.tracked = "poignet suivi, coude hors champ → IK";
    } else if (target.upper !== null) {
      up = toChar(target.upper);
      // Wrist unseen: keep the rest bend of the elbow
      fo = target.fore !== null ? toChar(target.fore) : up + angDiff(idle[0], idle[1]);
      st.tracked = target.fore !== null ? "suivi" : "coude suivi, poignet hors champ";
    } else {
      [up, fo] = rest === "desk" ? DESK[side] : idle;
      st.tracked = "hors champ → repos";
    }
    // Follow quickly while tracked, ease back slowly to rest
    const tau = target.upper !== null || ik ? 0.06 : 0.3, k = 1 - Math.exp(-dt / tau);
    st.upper = norm180(st.upper + angDiff(st.upper, up) * k);
    st.fore = norm180(st.fore + angDiff(st.fore, fo) * k);
  }
}

/** Poses the idle rig `nodes` (from rigAt): lean, head roll and drawing, arms, draw order. */
function buildRig(inp: Inputs, nodes: RigNode[], turn: Turning): RigNode[] {
  const { d, mirrored } = turn;
  const idle = { D: restOf(nodes, "D"), G: restOf(nodes, "G") };
  const sign = mirrored ? 1 : -1; // a clockwise roll on screen is a negative rotation in the y-up character space
  const pelvis = pos(find(nodes, /^Bassin_/).m);
  const shoulderRoll = inp.shoulders?.roll ?? 0;
  const lean = clamp(sign * shoulderRoll, -20 * DEG, 20 * DEG);
  const R = rotAbout(lean, pelvis.x, pelvis.y);
  for (const n of nodes) if (!/^(Bassin|Jupe|Ceinture)/.test(n.name)) n.m = mul(R, n.m);
  const head = find(nodes, /^Tete_\d$/), hp = pos(head.m);
  const headRoll = clamp(sign * ((inp.face?.roll ?? shoulderRoll) - shoulderRoll), -25 * DEG, 25 * DEG);
  head.m = mul(rotAbout(headRoll, hp.x, hp.y), head.m);
  const frontHead = inp.expression === "bouche" || inp.expression === "mdr" ? "Tete2_2" : "Tete_2";
  if (headMode !== "A" && TURN?.pieces.Tete) {
    // The head turns on its own (it may lead the body). RIFE frames exist for the neutral face only: an expression
    // shows the face or 3/4 head it has, whichever is nearer.
    head.piece = inp.expression === "base" ? turnKey("Tete", Math.round(turn.tHead * (TURN.frames - 1)))
      : DATA.heads[turn.tHead < 0.5 ? frontHead : EXPR_HEAD[inp.expression]] ?? head.piece;
  } else head.piece = DATA.heads[d === 1 ? EXPR_HEAD[inp.expression] : frontHead] ?? head.piece;

  // Arms: angles are world angles, so the lean only moves the shoulders
  const sx = [joints(nodes, "D").S.x, joints(nodes, "G").S.x], tl = Math.min(...sx), tr = Math.max(...sx);
  for (const side of ["D", "G"] as Side[]) {
    const st = armState[side];
    const W = poseArm(nodes, side, st.upper, st.fore);
    // In front of the torso when the hand is over it (with hysteresis); the near arm also when raised away from rest
    const margin = st.front ? -3 : 3;
    const overTorso = W.x > tl + margin && W.x < tr - margin;
    const raised = Math.abs(angDiff(idle[side][0], st.upper)) > (st.front ? 25 : 35);
    const near = d === 2 || side === "D";
    st.front = overTorso || (near && raised);
  }
  const isArm = (n: RigNode) => (["D", "G"] as Side[]).some(s => armState[s].front && armRe(s).test(n.name));
  const arms = nodes.filter(isArm), others = nodes.filter(n => !isArm(n));
  const i = others.findIndex(n => /^Tete_\d$/.test(n.name));
  return [...others.slice(0, i), ...arms, ...others.slice(i)];
}

// ---------- Drawing ----------

/** Bone units of the character's upper body framed in VTuber mode (y up). */
const FRAME = { y0: 58, y1: 172 };
/** Shoulder spacing of the front rig, in bone units, to match the player's shoulders in overlay mode. */
const RIG_SHOULDERS = 28;

function drawRig(nodes: RigNode[], view: Mat): void {
  for (const n of nodes) {
    const p = DATA.pieces[n.piece], img = images.get(n.piece);
    if (!p || !img?.complete || !img.naturalWidth) continue;
    const P = DATA.pxPerUnit;
    // image pixel → skin units (y up) → bone units (the node's matrix includes the ×3) → canvas
    const F = mul(view, mul(n.m, [1 / P, 0, -p.originX / P, 0, -1 / P, p.originY / P]));
    ctx.setTransform(F[0], F[3], F[1], F[4], F[2], F[5]);
    ctx.globalAlpha = n.alpha ?? 1;
    ctx.drawImage(img, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawSkeleton(lm: Landmark[], x0: number, y0: number, w: number, h: number): void {
  const P = (i: number) => [x0 + (1 - lm[i].x) * w, y0 + lm[i].y * h];
  ctx.lineWidth = 3;
  for (const [a, b] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]) {
    const good = Math.min(lm[a].visibility ?? 1, lm[b].visibility ?? 1) > MIN_VISIBILITY;
    ctx.strokeStyle = good ? "#2a9d8f" : "#e63946";
    ctx.beginPath();
    ctx.moveTo(...(P(a) as [number, number]));
    ctx.lineTo(...(P(b) as [number, number]));
    ctx.stroke();
  }
}

let running = false;
let lastVideoTime = -1, inputs: Inputs | null = null;
function loop(now: number): void {
  const dt = clamp((now - (lastNow || now)) / 1000, 0, 0.1);
  lastNow = now;
  if (demo) inputs = demoInputs(now);
  else if (video.readyState >= 2 && video.currentTime !== lastVideoTime && face && pose) {
    lastVideoTime = video.currentTime;
    inputs = track(now);
  }
  if (inputs && manual.checked) inputs = { ...inputs, face: { roll: inputs.face?.roll ?? 0, yawDeg: Number(yawSlider.value) } };
  if (inputs) {
    const turn = turning(inputs), d = turn.d;
    const idleRig = rigAt(turn.tBody);
    const rigMid = { x: (joints(idleRig, "D").S.x + joints(idleRig, "G").S.x) / 2, y: joints(idleRig, "D").S.y };
    updateArms(inputs, idleRig, turn.mirrored, dt);
    const nodes = buildRig(inputs, idleRig, turn);
    const W = canvas.width, H = canvas.height, vw = video.videoWidth, vh = video.videoHeight;
    const flip = turn.mirrored ? -1 : 1;
    let view: Mat;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (show === "overlay" && !demo && vw) {
      // Video drawn mirrored to fill the canvas height; the rig's shoulders go on the player's shoulders
      const s = H / vh, ox = (W - vw * s) / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(-s, 0, 0, s, ox + vw * s, 0);
      ctx.drawImage(video, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sh = inputs.shoulders;
      const k = sh ? (sh.width * s) / RIG_SHOULDERS : H / (FRAME.y1 - FRAME.y0);
      const mid = sh ? { x: ox + sh.anchor.x * s, y: sh.anchor.y * s } : { x: W / 2, y: H * 0.6 };
      view = [flip * k, 0, mid.x - flip * k * rigMid.x, 0, -k, mid.y + k * rigMid.y];
    } else {
      ctx.fillStyle = "#3b6e8f";
      ctx.fillRect(0, 0, W, H);
      const k = H / (FRAME.y1 - FRAME.y0);
      // A little sway with the player's shoulders, VTuber style
      const sway = inputs.shoulders && vw ? (inputs.shoulders.anchor.x / vw - 0.5) * W * 0.3 : 0;
      view = [flip * k, 0, W / 2 + sway, 0, -k, FRAME.y1 * k];
    }
    drawRig(nodes, view);
    if (show === "vtuber" && !demo && vw) {
      // Webcam inset with the arm skeleton
      const iw = 256, ih = (iw * vh) / vw, ix = W - iw - 12, iy = H - ih - 12;
      ctx.setTransform(-iw / vw, 0, 0, ih / vh, ix + iw, iy);
      ctx.drawImage(video, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (skeleton.checked && lastLm) drawSkeleton(lastLm, ix, iy, iw, ih);
    } else if (skeleton.checked && lastLm && vw) {
      const s = H / vh;
      drawSkeleton(lastLm, (W - vw * s) / 2, 0, vw * s, vh * s);
    }
    const side = (s: Side) => `${s} ${armState[s].tracked}, haut ${armState[s].upper.toFixed(0)}°, avant-bras ${armState[s].fore.toFixed(0)}°${armState[s].front ? ", devant" : ""}`;
    const headTurned = headMode !== "A" ? turn.tHead >= 0.5 : d === 1;
    info.textContent = `${demo ? "démo" : "caméra"} · ${turn.label}${turn.mirrored ? " (miroir)" : ""} · expression ${inputs.expression}`
      + `${!headTurned && !["base", "bouche", "mdr"].includes(inputs.expression) ? " (pas de face → base)" : ""}`
      + ` · yaw ${(inputs.face?.yawDeg ?? 0).toFixed(0)}°\n${side("D")}\n${side("G")}`;
  }
  nextFrame(loop);
}

if (params.has("demo")) $("demo").click();
