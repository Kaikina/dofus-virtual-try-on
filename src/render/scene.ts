import { calqueUrl, rotationDe, type Ailes, type CalqueImage, type Cape, type Coiffe, type Costume, type Emplacement, type Epaulieres, type Objet, type RotationCoiffe, type Tenue } from "../domain/catalogue";
import type { VueChoice } from "../domain/paliers";
import { headOutline, type Repere } from "../domain/pose";
import { DOFUS_SHOULDER_UNITS, placer, reglagePour, type Placement, type Reglages } from "../domain/reglages";
import { imageDuTour, reglageDuTour, tourner, type Tour } from "../domain/rotation";
import type { PersonMask } from "../tracking/bodyTracker";

const CROSSFADE_MS = 90;
const LOST_FADE_MS = 300;
/** Weight of the newest frame in the person mask's running average (lower = steadier but slower edges). */
const MASK_SMOOTHING = 0.5;

/** Resolves once the image has loaded or failed (img.decode() can stall in background tabs). */
export function loaded(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise(resolve => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/** What the trackers saw for one Repère this frame (null fields when nothing was detected). */
export interface Suivi {
  repere: Repere | null;
  choice: VueChoice | null;
}

/** Everything the Scene needs to draw one frame. */
export interface FrameInput {
  now: number;
  tenue: Tenue;
  /** Réglages (the committed ones, or the Calibration draft). */
  reglages: Reglages;
  tete: Suivi & {
    /** Face oval polygon in canvas pixels: the Coiffe's back Calque is hidden behind the head it outlines (see headOutline). */
    oval: { x: number; y: number }[] | null;
    /** Whether a Coiffe with Rotation images follows the yaw through them (false: it snaps between its two Vues). */
    rotation: boolean;
  };
  corps: Suivi & { mask: PersonMask | null };
  debug?: { points: { x: number; y: number }[] } | null;
}

/** Remembers the Vue shown for one Tenue item, so Vue changes crossfade and a lost Repère fades out. */
class SuiviEtat {
  private current: { choice: VueChoice; startedAt: number } | null = null;
  private previous: { choice: VueChoice; startedAt: number } | null = null;
  repere: Repere | null = null;
  private lastSeenAt = -Infinity;

  update(s: Suivi, now: number): void {
    if (s.repere) {
      this.repere = s.repere;
      this.lastSeenAt = now;
    }
    const c = s.choice;
    if (c && (!this.current || this.current.choice.direction !== c.direction || this.current.choice.mirrored !== c.mirrored)) {
      this.previous = this.current;
      this.current = { choice: c, startedAt: now };
    }
  }

  /** Opacity while the Repère is seen (1), fading out once it is lost. */
  presence(now: number, seen: boolean): number {
    if (!this.repere) return 0;
    return seen ? 1 : Math.max(0, 1 - (now - this.lastSeenAt) / LOST_FADE_MS);
  }

  /** The Vues to draw with their opacity: the current one, plus the previous one while crossfading. */
  layers(now: number, seen: boolean): { choice: VueChoice; alpha: number }[] {
    if (!this.current || !this.repere) return [];
    const presence = this.presence(now, seen);
    if (presence <= 0) return [];
    const t = Math.min(1, (now - this.current.startedAt) / CROSSFADE_MS);
    const out = [];
    if (this.previous && t < 1) out.push({ choice: this.previous.choice, alpha: presence * (1 - t) });
    out.push({ choice: this.current.choice, alpha: presence * (this.previous ? t : 1) });
    return out;
  }
}

/** Draws the mirrored webcam and the Essayage on a canvas sized to the camera's native resolution. */
export class Scene {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private tete = new SuiviEtat();
  /** Where the Coiffe is along its Rotation (kept for the side's hysteresis). */
  private tour: Tour | null = null;
  /** The Rotation image shown (and the one it replaced, fading out), for the Coiffe worn. */
  private imageTour: { skinId: number; current: number; previous: number | null; changedAt: number } | null = null;
  private corps = new SuiviEtat();
  private capeLayer = document.createElement("canvas");
  private maskCanvas = document.createElement("canvas");
  private hasMask = false;
  private smoothedMask: Float32Array | null = null;
  private lastMask: PersonMask | null = null;

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    this.ctx = ctx;
  }

  /** Starts loading every Calque of an item (and a Coiffe's Rotation images) so turning never shows a blank frame. */
  preload(emplacement: Emplacement, item: Objet): Promise<void> {
    const calques = Object.values(item.directions).flatMap(v => Object.values(v) as CalqueImage[]);
    const rotation = emplacement === "coiffe" ? rotationDe(item as Coiffe) : null;
    if (rotation) calques.push(...[rotation.front, rotation.back].filter((c): c is CalqueImage => !!c));
    return Promise.all(calques.map(c => loaded(this.image(calqueUrl(emplacement, item.skinId, c))))).then(() => undefined);
  }

  private image(url: string): HTMLImageElement {
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      this.images.set(url, img);
    }
    return img;
  }

  private resize(): void {
    const w = this.video.videoWidth, h = this.video.videoHeight;
    if (!w || !h) return;
    for (const c of [this.canvas, this.capeLayer]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
  }

  draw(f: FrameInput): void {
    const { ctx, canvas } = this;
    this.resize();
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0); // mirror the webcam like a selfie
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    this.tete.update(f.tete, f.now);
    this.corps.update(f.corps, f.now);
    // Only a new detection updates the mask: the same one is handed over every drawn frame until then
    if (f.corps.mask && f.corps.mask !== this.lastMask) {
      this.lastMask = f.corps.mask;
      this.updateMask(f.corps.mask);
    }

    // Back to front: Ailes and Cape behind the body, the Coiffe on the head
    if (f.tenue.cape || f.tenue.ailes) this.drawDos(f);
    // In front of the body, under the hat
    if (f.tenue.epaulieres) this.drawEpaulieres(f, f.tenue.epaulieres);
    if (f.tenue.costume) this.drawCostume(f, f.tenue.costume);
    if (f.tenue.coiffe) this.drawCoiffe(f, f.tenue.coiffe);
    if (f.debug) this.drawDebug(f);
  }

  // ---------- Coiffe ----------

  private drawCoiffe(f: FrameInput, coiffe: Coiffe): void {
    const rotation = rotationDe(coiffe);
    if (f.tete.rotation && rotation && coiffe.directions[1] && coiffe.directions[2]) {
      this.drawCoiffeTournee(f, coiffe, rotation);
      return;
    }
    for (const { choice, alpha } of this.tete.layers(f.now, !!f.tete.repere)) {
      const vue = coiffe.directions[choice.direction];
      if (!vue) continue;
      const place = placer(this.tete.repere!, choice, reglagePour(f.reglages, "coiffe", coiffe.skinId, choice.direction), coiffe.pxPerUnit);
      if (vue.back) this.behindHead(f, () => this.drawCalque(this.ctx, "coiffe", coiffe.skinId, vue.back!, place, alpha));
      if (vue.front) this.drawCalque(this.ctx, "coiffe", coiffe.skinId, vue.front, place, alpha);
    }
  }

  /** Draws a back Calque behind the whole head, the crown included, not only the face. */
  private behindHead(f: FrameInput, draw: () => void): void {
    this.ctx.save();
    if (f.tete.oval && f.tete.oval.length > 2) this.clipOutside(this.ctx, headOutline(f.tete.oval, this.tete.repere!));
    draw();
    this.ctx.restore();
  }

  /** The Coiffe through its Rotation images, following the head's yaw instead of snapping at a Palier. */
  private drawCoiffeTournee(f: FrameInput, coiffe: Coiffe, rotation: RotationCoiffe): void {
    const repere = this.tete.repere, presence = this.tete.presence(f.now, !!f.tete.repere);
    if (!repere || presence <= 0) return;
    const tour = (this.tour = tourner(repere.yawDeg, this.tour?.mirrored ?? false));
    const last = rotation.frames + 1;
    // One image at a time; on a change, the previous one fades out under the new one for a moment
    let shown = this.imageTour?.skinId === coiffe.skinId ? this.imageTour : null;
    const image = imageDuTour(tour.t, rotation.frames, shown?.current ?? null);
    if (!shown || image !== shown.current) shown = { skinId: coiffe.skinId, current: image, previous: shown?.current ?? null, changedAt: f.now };
    this.imageTour = shown;
    const fade = shown.previous === null ? 1 : Math.min(1, (f.now - shown.changedAt) / CROSSFADE_MS);
    for (const layer of ["back", "front"] as const) {
      const strip = rotation[layer];
      /** Image i of this Calque, placed with the Réglage of the point it shows. */
      const draw = (i: number, alpha: number) => {
        const t = i / last;
        const r = reglageDuTour(reglagePour(f.reglages, "coiffe", coiffe.skinId, 2), reglagePour(f.reglages, "coiffe", coiffe.skinId, 1), t);
        const place = placer(repere, { direction: t < 0.5 ? 2 : 1, mirrored: tour.mirrored }, r, coiffe.pxPerUnit);
        // The Vues at both ends, the strip's cells in between. A Calque only one Vue has gets no in-between images:
        // the nearest Vue's, snapping halfway like at a Palier.
        const calque = i === 0 || i === last || !strip ? coiffe.directions[t < 0.5 ? 2 : 1]?.[layer] : strip;
        if (calque) this.drawCalque(this.ctx, "coiffe", coiffe.skinId, calque, place, alpha, calque === strip ? i - 1 : 0);
      };
      const both = () => {
        if (fade < 1 && shown.previous !== null) draw(shown.previous, presence * (1 - fade));
        draw(shown.current, presence);
      };
      if (layer === "back") this.behindHead(f, both);
      else both();
    }
  }

  /** Clips to "everything except the polygon": the back Calque only shows around the head. */
  private clipOutside(ctx: CanvasRenderingContext2D, poly: { x: number; y: number }[]): void {
    ctx.beginPath();
    ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    ctx.moveTo(poly[0].x, poly[0].y);
    for (const p of poly.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.clip("evenodd");
  }

  // ---------- Épaulières: one part on each shoulder ----------

  private drawEpaulieres(f: FrameInput, item: Epaulieres): void {
    const points = this.corps.repere?.epaules;
    if (!points) return;
    for (const { choice, alpha } of this.corps.layers(f.now, !!f.corps.repere)) {
      const vue = item.directions[choice.direction];
      if (!vue) continue;
      const r = reglagePour(f.reglages, "epaulieres", item.skinId, choice.direction);
      const s = (this.corps.repere!.width * r.scale) / DOFUS_SHOULDER_UNITS / item.pxPerUnit;
      for (const part of ["gauche", "droite"] as const) {
        const calque = vue[part];
        if (!calque) continue;
        // "gauche" is the character's left shoulder, on screen-right when it faces us; a mirrored Vue flips both
        // drawings, so each one moves to the other shoulder
        const onLeft = (part === "droite") !== choice.mirrored;
        const point = onLeft ? points.gauche : points.droite, outward = onLeft ? -1 : 1;
        this.drawCalque(this.ctx, "epaulieres", item.skinId, calque, {
          x: point.x + outward * r.dx * this.corps.repere!.width,
          y: point.y - r.dy * this.corps.repere!.width,
          rotation: 0,
          scaleX: choice.mirrored ? -s : s,
          scaleY: s,
        }, alpha);
      }
    }
  }

  // ---------- Costume: a neck piece under the chin ----------

  private drawCostume(f: FrameInput, item: Costume): void {
    for (const { choice, alpha } of this.corps.layers(f.now, !!f.corps.repere)) {
      const calque = item.directions[choice.direction]?.front;
      if (!calque) continue;
      const r = reglagePour(f.reglages, "costume", item.skinId, choice.direction);
      this.ctx.save();
      // Never over the face: a collar stops at the chin
      if (f.tete.oval && f.tete.oval.length > 2) this.clipOutside(this.ctx, f.tete.oval);
      this.drawCalque(this.ctx, "costume", item.skinId, calque, placer(this.corps.repere!, choice, r, item.pxPerUnit, DOFUS_SHOULDER_UNITS), alpha);
      this.ctx.restore();
    }
  }

  // ---------- Cape and Ailes (worn in the back) ----------

  private drawDos(f: FrameInput): void {
    const layers = this.corps.layers(f.now, !!f.corps.repere);
    if (!layers.length) return;
    const lc = this.capeLayer.getContext("2d")!;
    lc.clearRect(0, 0, this.capeLayer.width, this.capeLayer.height);
    // The wings come out from under the cape: draw them first
    const items: [Emplacement, Cape | Ailes | null][] = [["ailes", f.tenue.ailes], ["cape", f.tenue.cape]];
    for (const [emplacement, item] of items) {
      if (!item) continue;
      for (const { choice, alpha } of layers) {
        const calque = item.directions[choice.direction]?.front;
        if (!calque) continue;
        const r = reglagePour(f.reglages, emplacement, item.skinId, choice.direction);
        this.drawCalque(lc, emplacement, item.skinId, calque, placer(this.corps.repere!, choice, r, item.pxPerUnit, DOFUS_SHOULDER_UNITS), alpha);
      }
    }
    if (this.hasMask) {
      // Keep them only where the person is not: they hang behind the body
      lc.save();
      lc.globalCompositeOperation = "destination-in";
      lc.setTransform(-1, 0, 0, 1, this.capeLayer.width, 0);
      lc.drawImage(this.maskCanvas, 0, 0, this.capeLayer.width, this.capeLayer.height);
      lc.restore();
    }
    this.ctx.drawImage(this.capeLayer, 0, 0);
  }

  /**
   * Turns the person mask into an alpha mask that is opaque outside the person, averaged with the previous frames so
   * the silhouette's edge doesn't flicker.
   */
  private updateMask(m: PersonMask): void {
    if (this.maskCanvas.width !== m.width || this.maskCanvas.height !== m.height || this.smoothedMask?.length !== m.data.length) {
      this.maskCanvas.width = m.width;
      this.maskCanvas.height = m.height;
      this.smoothedMask = Float32Array.from(m.data);
    }
    const s = this.smoothedMask;
    const mc = this.maskCanvas.getContext("2d")!;
    const img = mc.createImageData(m.width, m.height);
    for (let i = 0; i < m.data.length; i++) {
      s[i] += MASK_SMOOTHING * (m.data[i] - s[i]);
      img.data[i * 4 + 3] = Math.round((1 - s[i]) * 255);
    }
    mc.putImageData(img, 0, 0);
    this.hasMask = true;
  }

  // ---------- Shared ----------

  /** Draws a Calque, or cell `cell` of a strip of same-sized images (a Coiffe's Rotation images). */
  private drawCalque(ctx: CanvasRenderingContext2D, emplacement: Emplacement, skinId: number, c: CalqueImage, p: Placement, alpha: number, cell = 0): void {
    const img = this.image(calqueUrl(emplacement, skinId, c));
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.scale(p.scaleX, p.scaleY);
    ctx.drawImage(img, cell * c.width, 0, c.width, c.height, -c.originX, -c.originY, c.width, c.height);
    ctx.restore();
  }

  private drawDebug(f: FrameInput): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "rgba(0, 255, 160, 0.8)";
    for (const p of f.debug!.points) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    if (f.tete.oval) {
      ctx.strokeStyle = "rgba(255, 200, 0, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const outlines = [f.tete.oval, ...(this.tete.repere ? [headOutline(f.tete.oval, this.tete.repere)] : [])];
      for (const poly of outlines) {
        ctx.beginPath();
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
    }
    const lines: string[] = [];
    for (const [label, s] of [["tête", f.tete], ["épaules", f.corps]] as const) {
      if (!s.repere) continue;
      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.repere.anchor.x - 12, s.repere.anchor.y);
      ctx.lineTo(s.repere.anchor.x + 12, s.repere.anchor.y);
      ctx.moveTo(s.repere.anchor.x, s.repere.anchor.y - 12);
      ctx.lineTo(s.repere.anchor.x, s.repere.anchor.y + 12);
      ctx.stroke();
      const c = s.choice;
      lines.push(`${label} : yaw ${s.repere.yawDeg.toFixed(0)}°  roll ${((s.repere.roll * 180) / Math.PI).toFixed(0)}°  vue ${c ? c.direction + (c.mirrored ? " (miroir)" : "") : "-"}`);
      if (label === "tête" && f.tenue.coiffe) {
        const rotation = rotationDe(f.tenue.coiffe);
        lines.push(!rotation ? "rotation : aucune (paliers)"
          : !f.tete.rotation ? "rotation : coupée (Ajustement en cours)"
          : `rotation : image ${this.imageTour?.current ?? "-"}/${rotation.frames + 1}${this.tour?.mirrored ? " (miroir)" : ""}`);
      }
    }
    ctx.fillStyle = "white";
    ctx.font = "bold 22px system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, 16, 32 + i * 28));
    ctx.restore();
  }
}
