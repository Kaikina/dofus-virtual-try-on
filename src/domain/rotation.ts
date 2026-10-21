import type { Reglage } from "./reglages";

/**
 * Rotation of a Coiffe: instead of snapping from the face Vue to the 3/4 Vue at a Palier, the hat goes through
 * in-between images (generated offline with RIFE, tools/extraction/rife-coiffes.mjs) as the head turns.
 * Image 0 is the face Vue, image frames + 1 the 3/4 Vue, the in-between images sit at 1..frames.
 */

/** |yaw| (degrees) under which the face Vue shows as it is: a head held still wobbles by a few degrees. */
export const YAW_FACE = 5;
/** Head yaw (degrees) at which the 3/4 Vue is reached; beyond it the hat stays on the 3/4 Vue (no profil Vue). */
export const YAW_TROIS_QUARTS = 35;
/** |yaw| under which the side doesn't change, so an asymmetric face drawing doesn't flip back and forth at 0°. */
export const SIDE_HYSTERESIS_DEG = 3;
/**
 * How far past the halfway point between two images the turn must go before the image changes (in image steps), so
 * the yaw's wobble doesn't flicker between two neighbours.
 */
export const IMAGE_HYSTERESIS = 0.25;

/** How far the hat is turned: t from 0 (face Vue) to 1 (3/4 Vue), and whether it is mirrored (head toward screen-left). */
export interface Tour {
  t: number;
  mirrored: boolean;
}

/** The Tour for a head yaw (degrees, positive toward screen-right), keeping the previous side near 0°. */
export function tourner(yawDeg: number, previousMirrored: boolean): Tour {
  const mirrored = Math.abs(yawDeg) > SIDE_HYSTERESIS_DEG ? yawDeg < 0 : previousMirrored;
  return { t: Math.max(0, Math.min(1, (Math.abs(yawDeg) - YAW_FACE) / (YAW_TROIS_QUARTS - YAW_FACE))), mirrored };
}

/**
 * The one image to show for t (0..frames + 1). Never two at once: neighbouring images can differ a lot, and drawing
 * both shows a double exposure. The current image stays until t is clearly nearer another one.
 */
export function imageDuTour(t: number, frames: number, current: number | null): number {
  const p = Math.max(0, Math.min(1, t)) * (frames + 1);
  if (current !== null && Math.abs(p - current) < 0.5 + IMAGE_HYSTERESIS) return current;
  return Math.round(p);
}

/** The Réglage along the Rotation: from the face Vue's to the 3/4 Vue's, so the placement moves with the drawing. */
export function reglageDuTour(face: Reglage, troisQuarts: Reglage, t: number): Reglage {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return { dx: lerp(face.dx, troisQuarts.dx), dy: lerp(face.dy, troisQuarts.dy), scale: lerp(face.scale, troisQuarts.scale) };
}
