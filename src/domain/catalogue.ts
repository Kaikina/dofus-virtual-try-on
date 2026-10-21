import ailesJson from "../data/ailes.json";
import capesJson from "../data/capes.json";
import costumesJson from "../data/costumes.json";
import epaulieresJson from "../data/epaulieres.json";
import coiffesJson from "../data/coiffes.json";
import rotationsJson from "../data/tours.json";

export type Lang = "fr" | "en" | "es" | "pt";

/** One rendered Calque or Partie of a Vue: a PNG whose (originX, originY) pixel is the Point d'ancrage. */
export interface CalqueImage {
  file: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

/** Dofus drawing directions we use: 2 = face, 1 = 3/4 (facing screen-right). No profil: face tracking is lost before. */
export type Direction = 1 | 2;

/** A Vue of a Skin de coiffe: front Calque and (optional) back Calque. */
export interface VueCoiffe {
  front?: CalqueImage;
  back?: CalqueImage;
}

/** A Vue of a Skin de cape or of wings: a single Calque, hanging from the shoulders. */
export interface VueCape {
  front?: CalqueImage;
}

interface Equipement<V> {
  itemId: number;
  skinId: number;
  names: Record<Lang, string>;
  /** Pixels per game unit in the rendered PNGs. */
  pxPerUnit: number;
  directions: Partial<Record<Direction, V>>;
}

export type Coiffe = Equipement<VueCoiffe>;
export type Cape = Equipement<VueCape>;
/** A pair of wings, worn in the back like a Cape: the two wings are composed into one Calque. */
export type Ailes = Equipement<VueCape>;

/** A Vue of shoulder pads: one Calque per shoulder ("gauche", the character's left, goes on the screen-right shoulder). */
export interface VueEpaulieres {
  gauche?: CalqueImage;
  droite?: CalqueImage;
}
export type Epaulieres = Equipement<VueEpaulieres>;
/** A costume piece worn at the neck (scarf, collar): one Calque. */
export type Costume = Equipement<VueCape>;

export type Emplacement = "coiffe" | "cape" | "ailes" | "epaulieres" | "costume";
export const EMPLACEMENTS: Emplacement[] = ["coiffe", "cape", "ailes", "epaulieres", "costume"];
/** Any item of the catalogue. */
export type Objet = Coiffe | Cape | Ailes | Epaulieres | Costume;

/** The Tenue being tried on: at most one item per Emplacement, at least one item in all. */
export interface Tenue {
  coiffe: Coiffe | null;
  cape: Cape | null;
  ailes: Ailes | null;
  epaulieres: Epaulieres | null;
  costume: Costume | null;
}

/** A Tenue with nothing worn. */
export const tenueVide = (): Tenue => ({ coiffe: null, cape: null, ailes: null, epaulieres: null, costume: null });

/**
 * The Rotation images of a Coiffe (see rotation.ts): for each Calque that both Vues have, `frames` in-between images
 * side by side in one strip; `width`/`height` and the Point d'ancrage (`originX`, `originY`) are those of one image.
 */
export interface RotationCoiffe {
  frames: number;
  front?: CalqueImage;
  back?: CalqueImage;
}

const rotations = rotationsJson as Record<string, RotationCoiffe>;

/** The Rotation images of a Coiffe, or null when it has none (it then snaps from one Vue to the other). */
export function rotationDe(coiffe: Coiffe): RotationCoiffe | null {
  return rotations[String(coiffe.skinId)] ?? null;
}

export const coiffes = coiffesJson as Coiffe[];
export const capes = capesJson as Cape[];
export const ailes = ailesJson as Ailes[];
export const epaulieres = epaulieresJson as Epaulieres[];
export const costumes = costumesJson as Costume[];

/** Every item of an Emplacement. */
export const CATALOGUE: Record<Emplacement, Objet[]> = { coiffe: coiffes, cape: capes, ailes, epaulieres, costume: costumes };

/** Public folder of each Emplacement's assets. */
const FOLDER: Record<Emplacement, string> = { coiffe: "coiffes", cape: "capes", ailes: "ailes", epaulieres: "epaulieres", costume: "costumes" };

export function calqueUrl(emplacement: Emplacement, skinId: number, calque: CalqueImage): string {
  return `${import.meta.env.BASE_URL}${FOLDER[emplacement]}/${skinId}/${calque.file}`;
}

export function iconUrl(emplacement: Emplacement, skinId: number): string {
  return `${import.meta.env.BASE_URL}${FOLDER[emplacement]}/${skinId}/icon.webp`;
}

/** Lower-case, accent-free form of a name or a query, so "seculaire" finds "Séculaire". */
export function pourRecherche(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Items whose name, in the given language, contains every word of the query (in any order). */
export function filtrer<T extends { names: Record<Lang, string> }>(items: T[], query: string, lang: Lang): T[] {
  const words = pourRecherche(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter(i => {
    const name = pourRecherche(i.names[lang]);
    return words.every(w => name.includes(w));
  });
}

/** Whether an Emplacement can be emptied: only if another one stays filled, so the Tenue is never empty. */
export function peutVider(tenue: Tenue, emplacement: Emplacement): boolean {
  return EMPLACEMENTS.some(e => e !== emplacement && tenue[e] !== null);
}

/** Whether the Tenue has something placed on the body (Cape, Ailes, Épaulières, Costume), which needs the body tracker. */
export function porteSurLeCorps(tenue: Tenue): boolean {
  return EMPLACEMENTS.some(e => e !== "coiffe" && tenue[e] !== null);
}
