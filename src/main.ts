import "./style.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/bricolage-grotesque";
import { Calibration } from "./calibration";
import { CATALOGUE, coiffes, EMPLACEMENTS, filtrer, iconUrl, peutVider, porteSurLeCorps, tenueVide, type Emplacement, type Lang, type Objet, type Tenue } from "./domain/catalogue";
import { PoseSmoother } from "./domain/oneEuro";
import { choisirVue, yawCape, type VueChoice } from "./domain/paliers";
import { computePose, computeShoulders, orderedOval, repereDos, type Landmark, type Repere } from "./domain/pose";
import { reglagesParDefaut } from "./domain/reglages";
import { initialLang, LANG_LABELS, LANGS, saveLang, t, type Strings } from "./i18n";
import { countdown, downloadCanvas, photoFileName } from "./photo";
import { loaded, Scene } from "./render/scene";
import { BodyTracker, type PersonMask } from "./tracking/bodyTracker";
import { FaceTracker } from "./tracking/faceTracker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("canvas");
const gate = $("gate");
const status = $("status");
const shoot = $<HTMLButtonElement>("shoot");
const useCountdown = $<HTMLInputElement>("useCountdown");
const langSelect = $<HTMLSelectElement>("lang");
const tabs = Object.fromEntries(EMPLACEMENTS.map(e => [e, $<HTMLButtonElement>(`tab-${e}`)])) as Record<Emplacement, HTMLButtonElement>;
const search = $<HTMLInputElement>("search");
const count = $("count");
const picker = $("picker");

const params = new URLSearchParams(location.search);

let lang: Lang = initialLang();
/** The picker tab on screen. */
let activeTab: Emplacement = "coiffe";
/** Starting Tenue: the Coiffe du Bouftou (item 2411), the first hat if it is ever missing. */
const tenue: Tenue = { ...tenueVide(), coiffe: coiffes.find(c => c.itemId === 2411) ?? coiffes[0] ?? null };
let frozen = false;
let busy = false;
let started = false;

/** Tracking state of one Repère (head or shoulders). */
interface Suivi {
  landmarks: Landmark[] | null;
  repere: Repere | null;
  choice: VueChoice | null;
  smoother: PoseSmoother;
}
const tete: Suivi & { tracker: FaceTracker | null } = { tracker: null, landmarks: null, repere: null, choice: null, smoother: new PoseSmoother() };
const corps: Suivi & { tracker: BodyTracker | null; loading: boolean; mask: PersonMask | null } = {
  tracker: null, loading: false, landmarks: null, repere: null, choice: null, smoother: new PoseSmoother(), mask: null,
};

const scene = new Scene(canvas, video);

/** Where the Cape and Ailes go: the shoulders, kept upright and centred on the head when the face is visible. */
const dos = (): Repere | null => (corps.repere ? repereDos(corps.repere, tete.repere) : null);
const ovalIndices = orderedOval(FaceTracker.ovalEdges);

/** "Ajuster la position", for every visitor; ?calibration adds the dev export tools. */
const calibration = new Calibration(reglagesParDefaut, {
  tenue: () => tenue,
  tete: () => tete,
  corps: () => ({ repere: dos(), choice: corps.choice }),
  canvasScale: () => canvas.width / canvas.clientWidth,
  texts: () => t(lang),
  lang: () => lang,
}, canvas, f => {
  frozen = f;
  if (f) video.pause();
  else void video.play();
}, params.has("calibration"));

// ---------- Texts and language ----------

function applyTexts(): void {
  const s = t(lang);
  document.documentElement.lang = lang;
  document.title = s.title;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => {
    el.textContent = s[el.dataset.i18n as keyof Strings];
  });
  renderPickers();
  calibration.refresh(true);
  if (!status.hidden && status.dataset.key) status.textContent = s[status.dataset.key as keyof Strings];
}

function showStatus(key: keyof Strings | null): void {
  status.hidden = !key;
  if (key && status.dataset.key !== key) {
    status.dataset.key = key;
    status.textContent = t(lang)[key];
  }
  if (!key) delete status.dataset.key;
}

langSelect.append(...LANGS.map(l => new Option(LANG_LABELS[l], l, false, l === lang)));
langSelect.addEventListener("change", () => {
  lang = langSelect.value as Lang;
  saveLang(lang);
  applyTexts();
});

// ---------- Tenue picker ----------

function tile(label: string, pressed: boolean, disabled: boolean, icon: HTMLElement, onClick: () => void): HTMLLIElement {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.disabled = disabled;
  b.setAttribute("aria-pressed", String(pressed));
  b.append(icon, label);
  b.addEventListener("click", onClick);
  li.append(b);
  return li;
}

/** Items of each Emplacement, sorted by name in the current language. */
function itemsOf(emplacement: Emplacement): Objet[] {
  const list = CATALOGUE[emplacement];
  return [...list].sort((a, b) => a.names[lang].localeCompare(b.names[lang], lang, { numeric: true }));
}

function renderPickers(): void {
  const s = t(lang);
  for (const emplacement of EMPLACEMENTS) {
    const tab = tabs[emplacement];
    const current = tenue[emplacement];
    tab.setAttribute("aria-selected", String(emplacement === activeTab));
    tab.replaceChildren(s[emplacement], Object.assign(document.createElement("small"), { textContent: current ? current.names[lang] : s.none }));
  }
  search.placeholder = s.search;
  search.setAttribute("aria-label", s.search.replace("…", ""));

  const emplacement = activeTab;
  const current = tenue[emplacement];
  const found = filtrer(itemsOf(emplacement), search.value, lang);
  count.textContent = !found.length ? s.noResults : found.length === 1 ? s.countOne : s.count.replace("{n}", String(found.length));
  const none = document.createElement("span");
  none.className = "none-tile";
  none.textContent = "∅";
  picker.replaceChildren(
    ...(search.value.trim() ? [] : [tile(s.none, current === null, current !== null && !peutVider(tenue, emplacement), none, () => select(emplacement, null))]),
    ...found.map(item => {
      const img = new Image(64, 64);
      img.loading = "lazy"; // hundreds of icons: only load the ones scrolled into view
      img.decoding = "async";
      img.src = iconUrl(emplacement, item.skinId);
      img.alt = "";
      return tile(item.names[lang], item === current, false, img, () => select(emplacement, item));
    }),
  );
}

for (const emplacement of EMPLACEMENTS) {
  tabs[emplacement].addEventListener("click", () => {
    activeTab = emplacement;
    picker.scrollTop = 0;
    renderPickers();
  });
}
search.addEventListener("input", () => {
  picker.scrollTop = 0;
  renderPickers();
});

function select(emplacement: Emplacement, item: Objet | null): void {
  if (!item && !peutVider(tenue, emplacement)) return;
  (tenue as Record<Emplacement, Objet | null>)[emplacement] = item;
  if (item) void scene.preload(emplacement, item);
  if (porteSurLeCorps(tenue) && started) void ensureBodyTracker();
  renderPickers();
  calibration.refresh(true); // the worn items changed: re-enable the matching calibration targets
}

// ---------- Camera and tracking ----------

async function start(): Promise<void> {
  gate.hidden = true;
  showStatus("loading");
  try {
    const devSource = import.meta.env.DEV ? params.get("source") : null;
    const stream = devSource ? await imageStream(devSource) : await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    showStatus(e instanceof DOMException && e.name === "NotAllowedError" ? "cameraDenied" : "cameraUnavailable");
    return;
  }
  try {
    tete.tracker = await FaceTracker.create();
  } catch {
    showStatus("trackerFailed");
    return;
  }
  started = true;
  if (porteSurLeCorps(tenue)) void ensureBodyTracker();
  showStatus(null);
  shoot.disabled = false;
  requestAnimationFrame(loop);
}

/** The body tracker (shoulders + silhouette) is only loaded once a Cape is worn. */
async function ensureBodyTracker(): Promise<void> {
  if (corps.tracker || corps.loading) return;
  corps.loading = true;
  try {
    corps.tracker = await BodyTracker.create();
  } catch {
    showStatus("trackerFailed");
  } finally {
    corps.loading = false;
  }
}

/** Dev only (?source=<image url>): a fake camera that films a still image, to test without a webcam. */
async function imageStream(url: string): Promise<MediaStream> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await loaded(img);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  setInterval(() => g.drawImage(img, 0, 0), 1000 / 30);
  g.drawImage(img, 0, 0);
  return c.captureStream(30);
}

/** How long the shoulders may go undetected before the Cape is treated as lost (Pose often drops one for a frame). */
const SHOULDERS_GRACE_MS = 250;
let shouldersSeenAt = -Infinity;
const devYaw = import.meta.env.DEV && params.has("yaw") ? Number(params.get("yaw")) : null;
const devDebug = import.meta.env.DEV && params.has("debug");

function track(now: number): void {
  const w = video.videoWidth, h = video.videoHeight;
  // The face also drives the Cape's Vue, so it is tracked whenever anything is worn
  if (tete.tracker) {
    tete.landmarks = tete.tracker.detect(video, now);
    if (tete.landmarks) {
      tete.repere = tete.smoother.smooth(computePose(tete.landmarks, w, h), now / 1000);
      // Dev only: ?yaw=<degrees> forces the head's yaw, to check a Coiffe's Rotation on a still ?source image
      if (devYaw !== null) tete.repere = { ...tete.repere, yawDeg: devYaw };
      tete.choice = choisirVue(tete.repere.yawDeg, tete.choice);
    } else {
      tete.repere = null;
      tete.smoother.reset();
    }
  }
  if (porteSurLeCorps(tenue) && corps.tracker) {
    const d = corps.tracker.detect(video, now);
    corps.landmarks = d?.landmarks ?? null;
    const shoulders = d ? computeShoulders(d.landmarks, d.worldLandmarks, w, h) : null;
    if (d?.mask) corps.mask = d.mask;
    if (shoulders) {
      corps.repere = corps.smoother.smooth(shoulders, now / 1000);
      shouldersSeenAt = now;
    } else if (now - shouldersSeenAt > SHOULDERS_GRACE_MS) {
      corps.repere = null;
      corps.smoother.reset();
    }
    if (corps.repere) {
      corps.choice = choisirVue(yawCape(tete.repere, corps.repere), corps.choice);
    }
  }
  calibration.refresh();
  showStatus(
    tenue.coiffe && !tete.repere ? "noFace"
    : porteSurLeCorps(tenue) && (corps.loading || !corps.tracker) ? "loadingBody"
    : porteSurLeCorps(tenue) && !corps.repere ? "noBody"
    : null,
  );
}

let lastVideoTime = -1;

function loop(now: number): void {
  if (!frozen && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    track(now);
  }

  const w = video.videoWidth, h = video.videoHeight;
  const toCanvas = (p: Landmark) => ({ x: (1 - p.x) * w, y: p.y * h });
  const face = tenue.coiffe ? tete.landmarks : null;
  const body = porteSurLeCorps(tenue) ? corps.landmarks : null;
  scene.draw({
    now,
    tenue,
    reglages: calibration.values,
    // The adjust panel shows each Vue as it is, so the visitor adjusts a definite one
    tete: { repere: face ? tete.repere : null, choice: tete.choice, oval: face ? ovalIndices.map(i => toCanvas(face[i])) : null, rotation: !calibration.adjusting },
    corps: { repere: body ? dos() : null, choice: corps.choice, mask: porteSurLeCorps(tenue) ? corps.mask : null },
    // Dev only: ?debug shows the Repères, the Vue and the Coiffe's Rotation image over the video
    debug: devDebug ? { points: [] } : null,
  });
  requestAnimationFrame(loop);
}

// ---------- Photo ----------

async function takePhoto(): Promise<void> {
  if (busy) return;
  busy = true;
  shoot.disabled = true;
  try {
    if (useCountdown.checked) await countdown($("countdown"));
    const flash = $("flash");
    flash.classList.remove("on");
    void flash.offsetWidth; // restart the animation
    flash.classList.add("on");
    const names = EMPLACEMENTS.map(e => tenue[e]).filter(i => i !== null).map(i => i.names[lang]);
    await downloadCanvas(canvas, photoFileName(t(lang).photoFile, names, new Date()));
  } finally {
    busy = false;
    shoot.disabled = false;
  }
}

$("start").addEventListener("click", () => void start());
shoot.addEventListener("click", () => void takePhoto());

applyTexts();
if (tenue.coiffe) void scene.preload("coiffe", tenue.coiffe);
