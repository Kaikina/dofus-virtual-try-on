import reglagesJson from "../data/reglages.json";
import type { Direction, Emplacement } from "./catalogue";
import type { VueChoice } from "./paliers";
import type { Repere } from "./pose";

/** Directions that have a Réglage. */
const DIRECTIONS: Direction[] = [1, 2];

/**
 * The Réglage of a Vue. Offsets are in Repère widths (face or shoulder width), along the Repère axes: dx toward the
 * side the Vue faces (so it flips with the mirrored Vue), dy upward.
 */
export interface Reglage {
  dx: number;
  dy: number;
  scale: number;
}

/** Réglages of one Skin de coiffe or de cape, per Vue. */
export type ReglagesSkin = Partial<Record<Direction, Reglage>>;

/** Every Réglage, keyed by skin id. */
export interface Reglages {
  coiffes: Record<string, ReglagesSkin>;
  capes: Record<string, ReglagesSkin>;
  ailes: Record<string, ReglagesSkin>;
  epaulieres: Record<string, ReglagesSkin>;
  costumes: Record<string, ReglagesSkin>;
}

/** Sections of Reglages, one per Emplacement. */
const SECTIONS = ["coiffes", "capes", "ailes", "epaulieres", "costumes"] as const;

/** Starting point for a Coiffe before Calibration (chosen by hand, 2026-10-15). */
export const DEFAULT_REGLAGE: Reglage = { dx: 0, dy: -0.9, scale: 2 };

/** Starting point for a Cape before Calibration (chosen by hand, 2026-10-15): hung from the shoulders. */
export const DEFAULT_REGLAGE_CAPE: Reglage = { dx: 0, dy: 0, scale: 2 };

/**
 * Starting point for shoulder pads: each part sits on its own shoulder, scaled like the cape (chosen on the test
 * portrait, 2026-10-16). Horizontal offsets push both parts outward (positive) or inward (negative), symmetrically.
 */
export const DEFAULT_REGLAGE_EPAULIERES: Reglage = { dx: 0, dy: 0.1, scale: 2 };

/** Starting point for a neck piece: a little above the shoulder line, under the chin. */
export const DEFAULT_REGLAGE_COSTUME: Reglage = { dx: 0, dy: 0.12, scale: 1.6 };

/** Starting point for wings before Calibration (chosen by hand, 2026-10-15): the root between the shoulders. */
export const DEFAULT_REGLAGE_AILES: Reglage = { dx: 0, dy: 0, scale: 2 };

/** Width of a Dofus head in game units: a hat 1.5× this wide covers 1.5 face widths at scale 1. */
export const DOFUS_HEAD_UNITS = 20;
/** Width of a Dofus character's shoulders in game units, the cape counterpart of DOFUS_HEAD_UNITS. */
export const DOFUS_SHOULDER_UNITS = 30;

export const reglagesParDefaut: Reglages = normaliser(reglagesJson);

/** Keeps the Réglages of the Directions in use; a cape Vue calibrated in two parts ({ haut, bas }) keeps its top. */
function nettoyer(vues: Record<string, unknown>): ReglagesSkin {
  const out: ReglagesSkin = {};
  for (const d of DIRECTIONS) {
    const v = vues[d] as (Reglage & { haut?: undefined }) | { haut?: Reglage } | undefined;
    const reglage = v && "haut" in v ? v.haut : (v as Reglage | undefined);
    if (reglage && "scale" in reglage) out[d] = reglage;
  }
  return out;
}

/**
 * Reads every format written so far: the first one (Coiffe Réglages only, keyed directly by skin id), capes calibrated
 * in two parts, and Réglages of the profil Vue, which no longer exists (only face and 3/4 are kept).
 */
export function normaliser(raw: unknown): Reglages {
  const r = (raw ?? {}) as Record<string, unknown>;
  const nouveau = SECTIONS.some(s => s in r);
  const clean = (m: unknown) => Object.fromEntries(Object.entries((m ?? {}) as Record<string, Record<string, unknown>>).map(([skin, vues]) => [skin, nettoyer(vues)]));
  const out = aucunReglage();
  for (const s of SECTIONS) out[s] = clean(nouveau ? r[s] : s === "coiffes" ? r : {});
  return out;
}

/** The Réglage of a Vue; a Vue not calibrated yet borrows the face Vue's Réglage, then the default. */
function reglageDe(skin: ReglagesSkin | undefined, direction: Direction, defaut: Reglage): Reglage {
  return skin?.[direction] ?? skin?.[2] ?? defaut;
}

/** Section of Reglages holding each Emplacement's Réglages, and the default when an item has none. */
export const SECTION: Record<Emplacement, keyof Reglages> = { coiffe: "coiffes", cape: "capes", ailes: "ailes", epaulieres: "epaulieres", costume: "costumes" };
const DEFAULTS: Record<Emplacement, Reglage> = {
  coiffe: DEFAULT_REGLAGE, cape: DEFAULT_REGLAGE_CAPE, ailes: DEFAULT_REGLAGE_AILES,
  epaulieres: DEFAULT_REGLAGE_EPAULIERES, costume: DEFAULT_REGLAGE_COSTUME,
};

/** The Réglage of an item's Vue. */
export function reglagePour(reglages: Reglages, emplacement: Emplacement, skinId: number, direction: Direction): Reglage {
  return reglageDe(reglages[SECTION[emplacement]][String(skinId)], direction, DEFAULTS[emplacement]);
}

/** Where and how to draw a Calque on the canvas. */
export interface Placement {
  /** Point d'ancrage on the canvas. */
  x: number;
  y: number;
  rotation: number;
  /** Canvas pixels per PNG pixel; negative on x when mirrored. */
  scaleX: number;
  scaleY: number;
}

/**
 * Places a Calque on its Repère.
 * @param refUnits the Repère width in game units (DOFUS_HEAD_UNITS or DOFUS_SHOULDER_UNITS)
 */
/**
 * How far behind the forehead the Point d'ancrage of a Coiffe lies, in face widths: about the middle of the skull.
 * When the head is seen from above, that point shows higher on screen than a point on the face would.
 */
export const HEAD_DEPTH = 0.6;
/** Pitch beyond which the face tracker is unreliable: the correction stops growing. */
const MAX_PITCH_DEG = 35;

/**
 * Vertical offset on screen, in Repère widths, of a point dy widths above the Repère. A Repère de tête also knows the
 * head's pitch: seen from above, heights on the face look shorter and points inside the head rise (see HEAD_DEPTH).
 */
function upward(repere: Repere, dy: number): number {
  if (repere.pitchDeg === undefined) return dy;
  const p = (Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, repere.pitchDeg)) * Math.PI) / 180;
  return dy * Math.cos(p) + HEAD_DEPTH * Math.sin(p);
}

export function placer(repere: Repere, choice: VueChoice, r: Reglage, pxPerUnit: number, refUnits = DOFUS_HEAD_UNITS): Placement {
  const cos = Math.cos(repere.roll), sin = Math.sin(repere.roll);
  // Offsets follow the Repère: dx along its line (mirrored with the Vue), dy along its up axis (screen y points down)
  const ox = (choice.mirrored ? -r.dx : r.dx) * repere.width, oy = -upward(repere, r.dy) * repere.width;
  const s = (repere.width * r.scale) / refUnits / pxPerUnit;
  return {
    x: repere.anchor.x + ox * cos - oy * sin,
    y: repere.anchor.y + ox * sin + oy * cos,
    rotation: repere.roll,
    scaleX: choice.mirrored ? -s : s,
    scaleY: s,
  };
}

/** An empty set of Réglages. */
export function aucunReglage(): Reglages {
  return { coiffes: {}, capes: {}, ailes: {}, epaulieres: {}, costumes: {} };
}

/**
 * The Réglages actually used: the shipped ones, with a visitor's own adjustments on top, Vue by Vue. Adjustments are
 * stored apart, so a later fix to the shipped Réglages still reaches every Vue the visitor didn't touch.
 */
export function appliquer(base: Reglages, ajustements: Reglages): Reglages {
  const out = structuredClone(base);
  for (const section of SECTIONS) {
    for (const [skin, vues] of Object.entries(ajustements[section])) {
      out[section][skin] = { ...out[section][skin], ...vues };
    }
  }
  return out;
}
