import type { Direction, Emplacement, Lang, Tenue } from "./domain/catalogue";
import type { VueChoice } from "./domain/paliers";
import type { Repere } from "./domain/pose";
import { appliquer, aucunReglage, normaliser, reglagePour, SECTION, type Reglage, type Reglages } from "./domain/reglages";
import type { Strings } from "./i18n";

/** A visitor's own adjustments, kept in their browser only and never shared. */
const STORAGE_KEY = "dofus-try-on.ajustements.v1";
/** How long after the last adjustment the Coiffe keeps showing the adjusted Vue as it is (no Rotation image). */
const ADJUSTING_MS = 1500;
const DIRECTIONS: Direction[] = [2, 1];

/** What the panel adjusts: one item of the Tenue. */
type Cible = Emplacement;
const CIBLES: Cible[] = ["coiffe", "cape", "ailes", "epaulieres", "costume"];

type Field = keyof Reglage;
const FIELDS: { key: Field; label: keyof Strings; min: number; max: number; step: number }[] = [
  { key: "scale", label: "size", min: 0.3, max: 4, step: 0.01 },
  { key: "dx", label: "horizontal", min: -1.5, max: 1.5, step: 0.005 },
  { key: "dy", label: "vertical", min: -3, max: 1.5, step: 0.005 },
];

export interface CalibrationContext {
  tenue: () => Tenue;
  tete: () => { repere: Repere | null; choice: VueChoice | null };
  corps: () => { repere: Repere | null; choice: VueChoice | null };
  /** Canvas pixels per CSS pixel, to convert pointer drags. */
  canvasScale: () => number;
  texts: () => Strings;
  lang: () => Lang;
}

/**
 * "Ajuster la position": lets a visitor fix an item that sits wrong with the default Réglage, Vue by Vue (face, 3/4),
 * with sliders or by dragging it on the image. Adjustments stay in the visitor's browser (localStorage), on top of the
 * shipped Réglages. With ?calibration (dev mode), the panel also exports everything to commit as src/data/reglages.json.
 */
export class Calibration {
  private base: Reglages;
  private ajustements: Reglages;
  private effectifs: Reglages;
  private cible: Cible = "coiffe";
  private root: HTMLDetailsElement;
  private inputs = new Map<Field, HTMLInputElement>();
  private outputs = new Map<Field, HTMLOutputElement>();
  private cibleButtons = new Map<Cible, HTMLButtonElement>();
  private targetLabel!: HTMLElement;
  private statusLabel!: HTMLElement;
  private freezeButton!: HTMLButtonElement;
  private shown = "";
  private lastEditAt = -Infinity;
  frozen = false;

  constructor(base: Reglages, private ctx: CalibrationContext, canvas: HTMLCanvasElement, private onFreeze: (frozen: boolean) => void, private dev = false) {
    this.base = base;
    this.ajustements = aucunReglage();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) this.ajustements = normaliser(JSON.parse(saved));
    } catch {
      // storage blocked or unreadable: start without adjustments
    }
    this.effectifs = appliquer(this.base, this.ajustements);
    this.root = this.build();
    document.getElementById("below-stage")!.append(this.root);
    this.bindCanvas(canvas);
    this.refresh(true);
  }

  /** The Réglages to draw with: shipped ones plus this visitor's adjustments. */
  get values(): Reglages {
    return this.effectifs;
  }

  private get open(): boolean {
    return this.root.open;
  }

  /**
   * Whether the visitor is adjusting right now (or just did): the Coiffe then shows the Vue being adjusted as it is,
   * not a Rotation image between two Vues. Merely leaving the panel open keeps the Rotation.
   */
  get adjusting(): boolean {
    return this.open && performance.now() - this.lastEditAt < ADJUSTING_MS;
  }

  private build(): HTMLDetailsElement {
    const box = document.createElement("details");
    box.className = "calibration";
    box.open = this.dev;
    box.innerHTML = `
      <summary><span data-i18n="adjust"></span></summary>
      <p class="hint" data-i18n="adjustHint"></p>
      <div class="cal-grid">
        <div class="cal-col">
          <div class="seg" role="group" data-group="cible"></div>
          <p class="target"></p>
          <p class="hint vue-status"></p>
        </div>
        <div class="cal-col fields"></div>
        <div class="cal-col">
          <div class="row">
            <button type="button" data-act="freeze"></button>
            <button type="button" data-act="reset" data-i18n="resetView"></button>
          </div>
          ${this.dev ? `
          <button type="button" data-act="copy">Copier vers les Vues non réglées</button>
          <button type="button" class="primary" data-act="export">Exporter reglages.json</button>` : ""}
        </div>
      </div>`;
    this.targetLabel = box.querySelector(".target")!;
    this.statusLabel = box.querySelector(".vue-status")!;
    this.freezeButton = box.querySelector('[data-act="freeze"]')!;
    const seg = box.querySelector('[data-group="cible"]')!;
    for (const c of CIBLES) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.i18n = c;
      b.addEventListener("click", () => {
        this.cible = c;
        this.refresh(true);
      });
      this.cibleButtons.set(c, b);
      seg.append(b);
    }
    const fields = box.querySelector(".fields")!;
    for (const f of FIELDS) {
      const row = document.createElement("label");
      row.className = "field";
      row.innerHTML = `<span data-i18n="${f.label}"></span><output></output><input type="range" min="${f.min}" max="${f.max}" step="${f.step}">`;
      const input = row.querySelector("input")!;
      input.addEventListener("input", () => this.set({ [f.key]: +input.value }));
      this.inputs.set(f.key, input);
      this.outputs.set(f.key, row.querySelector("output")!);
      fields.append(row);
    }
    this.freezeButton.addEventListener("click", () => {
      this.frozen = !this.frozen;
      this.onFreeze(this.frozen);
      this.refresh(true);
    });
    box.addEventListener("toggle", () => {
      // Closing the panel never leaves the video frozen
      if (!box.open && this.frozen) this.freezeButton.click();
    });
    box.querySelector('[data-act="reset"]')!.addEventListener("click", () => this.reset());
    box.querySelector('[data-act="copy"]')?.addEventListener("click", () => this.copyToOthers());
    box.querySelector('[data-act="export"]')?.addEventListener("click", () => this.export());
    return box;
  }

  private bindCanvas(canvas: HTMLCanvasElement): void {
    let last: { x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", e => {
      if (!this.open) return; // dragging only adjusts while the panel is open
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointerup", () => (last = null));
    canvas.addEventListener("pointercancel", () => (last = null));
    canvas.addEventListener("pointermove", e => {
      const { repere, choice } = this.suivi();
      const r = this.current();
      if (!last || !repere || !choice || !r) return;
      const k = this.ctx.canvasScale();
      const sx = (e.clientX - last.x) * k, sy = (e.clientY - last.y) * k;
      last = { x: e.clientX, y: e.clientY };
      // Express the screen drag in Repère axes, in Repère widths; dx is stored for the unmirrored Vue
      const cos = Math.cos(repere.roll), sin = Math.sin(repere.roll);
      const along = (sx * cos + sy * sin) / repere.width;
      const up = -(-sx * sin + sy * cos) / repere.width;
      this.set({ dx: r.dx + (choice.mirrored ? -along : along), dy: r.dy + up });
    });
    canvas.addEventListener("wheel", e => {
      const r = this.current();
      if (!this.open || !r) return;
      e.preventDefault();
      this.set({ scale: r.scale * (e.deltaY < 0 ? 1.02 : 1 / 1.02) });
    }, { passive: false });
  }

  /** The Cible actually editable: the chosen one if its item is worn, else the first worn one. */
  private cibleActive(): Cible | null {
    const tenue = this.ctx.tenue();
    const worn = (c: Cible) => !!tenue[c];
    return worn(this.cible) ? this.cible : CIBLES.find(worn) ?? null;
  }

  private suivi(): { repere: Repere | null; choice: VueChoice | null } {
    const c = this.cibleActive();
    return c === "coiffe" ? this.ctx.tete() : c ? this.ctx.corps() : { repere: null, choice: null };
  }

  private skinId(): number | null {
    const c = this.cibleActive(), tenue = this.ctx.tenue();
    return c ? tenue[c]?.skinId ?? null : null;
  }

  /** The Réglage of the Cible in the Vue on screen. */
  private current(): Reglage | null {
    const c = this.cibleActive(), skinId = this.skinId(), { choice } = this.suivi();
    if (!c || skinId === null || !choice) return null;
    return reglagePour(this.effectifs, c, skinId, choice.direction);
  }

  /** The visitor's own adjustment of the Cible in Vue d, if any. */
  private ajuste(c: Cible, skinId: number, d: Direction): Reglage | undefined {
    return this.ajustements[SECTION[c]][skinId]?.[d];
  }

  private ecrire(c: Cible, skinId: number, d: Direction, r: Reglage | undefined): void {
    const skin = (this.ajustements[SECTION[c]][skinId] ??= {});
    if (r) skin[d] = r;
    else delete skin[d];
    if (!Object.keys(skin).length) delete this.ajustements[SECTION[c]][skinId];
    this.effectifs = appliquer(this.base, this.ajustements);
    this.save();
    this.refresh(true);
  }

  private set(patch: Partial<Reglage>): void {
    this.lastEditAt = performance.now();
    const c = this.cibleActive(), skinId = this.skinId(), { choice } = this.suivi();
    const r = this.current();
    if (!c || skinId === null || !choice || !r) return;
    const next = { ...r, ...patch };
    for (const k of Object.keys(next) as Field[]) next[k] = Math.round(next[k] * 1000) / 1000;
    this.ecrire(c, skinId, choice.direction, next);
  }

  /** Drops the visitor's adjustment of the Vue on screen: back to the shipped Réglage. */
  private reset(): void {
    this.lastEditAt = performance.now();
    const c = this.cibleActive(), skinId = this.skinId(), { choice } = this.suivi();
    if (!c || skinId === null || !choice) return;
    this.ecrire(c, skinId, choice.direction, undefined);
  }

  private copyToOthers(): void {
    const c = this.cibleActive(), skinId = this.skinId();
    const r = this.current();
    if (!c || skinId === null || !r) return;
    for (const d of DIRECTIONS) if (!this.ajuste(c, skinId, d)) this.ecrire(c, skinId, d, { ...r });
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.ajustements));
    } catch {
      // storage blocked: adjustments last until the page is closed
    }
  }

  /** Updates the panel to the Cible and Vue on screen. Cheap to call every frame: it only touches the DOM on change. */
  refresh(force = false): void {
    const c = this.cibleActive(), skinId = this.skinId(), { choice } = this.suivi();
    const lang = this.ctx.lang();
    const key = `${c}:${skinId}:${choice?.direction}:${lang}`;
    if (!force && key === this.shown) return;
    this.shown = key;
    const s = this.ctx.texts(), tenue = this.ctx.tenue();
    this.freezeButton.textContent = this.frozen ? s.resume : s.freeze;
    for (const [k, b] of this.cibleButtons) {
      b.setAttribute("aria-pressed", String(k === c));
      b.disabled = !tenue[k];
    }
    const item = c ? tenue[c] : null;
    const hasVue = !!(c && item && skinId !== null && choice);
    for (const input of this.inputs.values()) input.disabled = !hasVue;
    if (!hasVue) {
      this.targetLabel.textContent = item ? `${item.names[lang]} · ${s.waiting}` : "—";
      this.statusLabel.textContent = "";
      return;
    }
    const vue = choice!.direction === 2 ? s.viewFace : s.view34;
    this.targetLabel.textContent = `${item!.names[lang]} · ${vue}`;
    this.statusLabel.textContent = this.dev
      ? `skin ${skinId} · ` + DIRECTIONS.map(d => `${d === 2 ? "face" : "3/4"} ${this.ajuste(c!, skinId!, d) ? "✓" : "·"}`).join("   ")
      : this.ajuste(c!, skinId!, choice!.direction) ? s.adjusted : "";
    const r = this.current()!;
    for (const f of FIELDS) {
      this.inputs.get(f.key)!.value = String(r[f.key]);
      this.outputs.get(f.key)!.textContent = f.key === "scale" ? `×${r.scale.toFixed(2)}` : (r[f.key] >= 0 ? "+" : "") + r[f.key].toFixed(2);
    }
  }

  /** Dev mode: the shipped Réglages with this browser's adjustments, to commit as src/data/reglages.json. */
  private export(): void {
    const json = JSON.stringify(this.effectifs, null, 2) + "\n";
    navigator.clipboard?.writeText(json).catch(() => undefined);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = "reglages.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
