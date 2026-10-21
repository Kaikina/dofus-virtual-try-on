import { ailes, capes, coiffes, costumes, EMPLACEMENTS, epaulieres, tenueVide, type Tenue } from "../src/domain/catalogue";
import { choisirVue, type VueChoice } from "../src/domain/paliers";
import { computePose, computeShoulders, orderedOval, repereDos, type Repere } from "../src/domain/pose";
import { reglagesParDefaut } from "../src/domain/reglages";
import { loaded, Scene } from "../src/render/scene";
import { BodyTracker } from "../src/tracking/bodyTracker";
import { FaceTracker } from "../src/tracking/faceTracker";

const log = (s: string) => (document.getElementById("log")!.textContent += s + "\n");
addEventListener("unhandledrejection", e => log(`error: ${e.reason}`));
const params = new URLSearchParams(location.search);

async function snapshot(canvas: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), "image/png"));
  await fetch(`/__dev/snapshot?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
}

const img = new Image();
img.src = params.get("source") ?? "/dev/fixtures/portrait.jpg";
await loaded(img);
// The Scene draws from a <video>; a still image with the same size fields is enough here
Object.defineProperties(img, { videoWidth: { value: img.naturalWidth }, videoHeight: { value: img.naturalHeight } });
const video = img as unknown as HTMLVideoElement;
const W = img.naturalWidth, H = img.naturalHeight;

const face = await FaceTracker.create();
const lm = face.detect(video, performance.now());
if (!lm) throw new Error("no face");
const head = computePose(lm, W, H);
const oval = orderedOval(FaceTracker.ovalEdges).map(i => ({ x: (1 - lm[i].x) * W, y: lm[i].y * H }));

const body = await BodyTracker.create();
const d = body.detect(video, performance.now() + 1);
if (!d) throw new Error("no body");
const epaules = computeShoulders(d.landmarks, d.worldLandmarks, W, H);
if (!epaules) throw new Error("shoulders not visible");
const shoulders = repereDos(epaules, head); // as in the app: upright, centred on the head
log(`head: ${JSON.stringify(head)}\nshoulders: ${JSON.stringify(shoulders)}\nmask: ${d.mask ? `${d.mask.width}x${d.mask.height}` : "none"}`);

const which = params.get("only"); // "coiffes" | "capes" | null for both
const ids = params.get("ids")?.split(",").map(Number); // only these skin ids
const tenues: [string, Tenue][] = ([
  ...(!which || which === "coiffes" ? coiffes.map(c => [`c${c.skinId}`, { ...tenueVide(), coiffe: c }] as [string, Tenue]) : []),
  ...(!which || which === "capes" ? capes.map(c => [`k${c.skinId}`, { ...tenueVide(), cape: c }] as [string, Tenue]) : []),
  ...(!which || which === "ailes" ? ailes.map(a => [`a${a.skinId}`, { ...tenueVide(), ailes: a }] as [string, Tenue]) : []),
  ...(!which || which === "epaulieres" ? epaulieres.map(a => [`e${a.skinId}`, { ...tenueVide(), epaulieres: a }] as [string, Tenue]) : []),
  ...(!which || which === "costumes" ? costumes.map(a => [`o${a.skinId}`, { ...tenueVide(), costume: a }] as [string, Tenue]) : []),
  // ?combo=<capeSkin>,<ailesSkin>: a Cape worn over wings
  ...(params.get("combo") ? [(() => {
    const [k, a] = params.get("combo")!.split(",").map(Number);
    return [`combo${k}-${a}`, { ...tenueVide(), cape: capes.find(c => c.skinId === k) ?? null, ailes: ailes.find(x => x.skinId === a) ?? null }] as [string, Tenue];
  })()] : []),
] as [string, Tenue][]).filter(([tag, t]) => tag.startsWith("combo") || !ids || ids.includes(EMPLACEMENTS.map(e => t[e]).find(Boolean)!.skinId));

const forced: (VueChoice | null)[] = [null, { direction: 1, mirrored: false }, { direction: 1, mirrored: true }];
const canvas = document.createElement("canvas");
for (const [tag, tenue] of tenues) {
  for (const f of forced) {
    // A fresh Scene per frame so there is no crossfade from the previous Vue
    const s = new Scene(canvas, video);
    for (const e of EMPLACEMENTS) { const item = tenue[e]; if (item) await s.preload(e, item); }
    const choice = (r: Repere) => f ?? choisirVue(r.yawDeg, null);
    s.draw({
      now: 0,
      tenue,
      reglages: reglagesParDefaut,
      tete: { repere: head, choice: choice(head), oval, rotation: false },
      corps: { repere: shoulders, choice: choice(shoulders), mask: params.has("nomask") ? null : d.mask },
      debug: params.has("debug") ? { points: [] } : null,
    });
    const c = choice(head);
    const name = `${tag}-d${c.direction}${c.mirrored ? "m" : ""}`;
    await snapshot(canvas, name);
    log(`saved ${name}`);
  }
}
log("done");
