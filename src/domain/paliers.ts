import type { Direction } from "./catalogue";

/** The Vue to show: a Dofus direction, possibly mirrored for a head turned toward screen-left. */
export interface VueChoice {
  direction: Direction;
  mirrored: boolean;
}

export interface PalierThresholds {
  /** |yaw| below this shows the face Vue, above it the 3/4 Vue (degrees). */
  face: number;
  /** Extra degrees needed to leave the current Palier, so the Vue doesn't flicker at the boundary. */
  hysteresis: number;
}

export const DEFAULT_PALIERS: PalierThresholds = { face: 15, hysteresis: 3 };

/**
 * Picks the Vue for a head yaw: face, or 3/4 once the head is turned. There is no profil Vue: face tracking is lost
 * before the head is in profile (ADR 0001).
 * @param yawDeg yaw in degrees, positive when the face turns toward screen-right (as seen in the mirrored preview)
 * @param previous the Vue currently shown, used for hysteresis
 */
export function choisirVue(yawDeg: number, previous: VueChoice | null, t: PalierThresholds = DEFAULT_PALIERS): VueChoice {
  const abs = Math.abs(yawDeg);
  let direction: Direction = abs < t.face ? 2 : 1;
  // Only switch once the yaw is clearly past the boundary
  if (previous && previous.direction !== direction && Math.abs(abs - t.face) < t.hysteresis) direction = previous.direction;

  // The 3/4 Vue (direction 1) faces screen-right: mirror it for a head turned toward screen-left.
  // The face Vue keeps the previous side to avoid a flip when looking straight ahead.
  const mirrored = direction === 2 ? (previous?.mirrored ?? false) : yawDeg < 0;
  return { direction, mirrored };
}

/**
 * Yaw that picks the Cape's Vue: the head's when the face is visible, like a Dofus character who turns as a whole.
 * The torso's yaw is only a fallback: at webcam distance Pose often sees one shoulder poorly and overestimates it.
 */
export function yawCape(tete: { yawDeg: number } | null, epaules: { yawDeg: number }): number {
  return tete?.yawDeg ?? epaules.yawDeg;
}
