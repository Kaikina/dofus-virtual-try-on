/** A landmark as returned by MediaPipe: x, y normalised to the image size, z roughly in the same scale as x. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Pose landmarks only: how likely the point is visible (not hidden or off-frame), 0..1. */
  visibility?: number;
}

/**
 * A body reference frame in the mirrored canvas (pixels, angles in radians unless stated): the Repère de tête for a
 * Coiffe, the Repère d'épaules for a Cape.
 */
export interface Repere {
  /** Where the Point d'ancrage is placed. */
  anchor: { x: number; y: number };
  /** Reference width in pixels (face width or shoulder width): Réglage offsets and scale are relative to it. */
  width: number;
  /** Rotation of the reference line (eye line or shoulder line), clockwise on screen. */
  roll: number;
  /** Degrees, positive when the face or torso turns toward screen-right. */
  yawDeg: number;
  /**
   * Repère de tête only: degrees the head is seen from above (positive: chin down, or a webcam above the face). The
   * face then looks shorter, and what sits on top of the head shows higher above the forehead.
   */
  pitchDeg?: number;
  /** Repère d'épaules only: each shoulder on screen, where a shoulder pad's part is placed. */
  epaules?: { gauche: { x: number; y: number }; droite: { x: number; y: number } };
}

/** Repère de tête: on the head's central axis, at forehead height. */
export type HeadPose = Repere;
/** Repère d'épaules: midpoint of the shoulders. */
export type BodyPose = Repere;

export const LM = {
  forehead: 10,
  chin: 152,
  faceLeft: 234,
  faceRight: 454,
  eyeOuterA: 33,
  eyeOuterB: 263,
} as const;

export const POSE_LM = {
  shoulderA: 11,
  shoulderB: 12,
} as const;

type P3 = { x: number; y: number; z: number };

/** Landmark i in mirrored canvas pixels (what the user sees); z is negated so positive means "toward the camera". */
function mirrored(lm: Landmark[], imgW: number, imgH: number) {
  return (i: number): P3 => ({ x: (1 - lm[i].x) * imgW, y: lm[i].y * imgH, z: -lm[i].z * imgW });
}

/** Orders a pair left → right on screen so angles don't depend on landmark handedness. */
const leftRight = (a: P3, b: P3): [P3, P3] => (a.x <= b.x ? [a, b] : [b, a]);

/**
 * Width, roll and yaw of a horizontal body axis (face edges or shoulders). The axis rotates around the vertical
 * when the body turns: its depth slope gives the yaw.
 */
function axis(l: P3, r: P3) {
  const width = Math.hypot(r.x - l.x, r.y - l.y, r.z - l.z);
  const roll = Math.atan2(r.y - l.y, r.x - l.x);
  const yawDeg = -(Math.atan2(r.z - l.z, Math.hypot(r.x - l.x, r.y - l.y)) * 180) / Math.PI;
  return { width, roll, yawDeg };
}

/** Repère de tête from Face Landmarker landmarks, for an image of size (imgW, imgH) drawn mirrored on the canvas. */
/** Raw pitch of a face looking straight at the camera (measured 0.1° on the test portrait): no offset needed. */
export const PITCH_FRONT_DEG = 0;

export function computePose(lm: Landmark[], imgW: number, imgH: number): HeadPose {
  const p = mirrored(lm, imgW, imgH);
  const [l, r] = leftRight(p(LM.faceLeft), p(LM.faceRight));
  const [el, er] = leftRight(p(LM.eyeOuterA), p(LM.eyeOuterB));
  const { width, yawDeg } = axis(l, r);
  const roll = Math.atan2(er.y - el.y, er.x - el.x); // the eye line is steadier than the face edges
  // The midpoint of the face edges lies on the head's vertical axis whatever the yaw; move it up the head
  // (perpendicular to the eye line) to the forehead's height.
  const f = p(LM.forehead);
  const m = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  const up = { x: Math.sin(roll), y: -Math.cos(roll) };
  const h = (f.x - m.x) * up.x + (f.y - m.y) * up.y;
  // Pitch: the forehead → chin line leans in depth when the head nods (the forehead comes closer to the camera)
  const c = p(LM.chin);
  const length = (f.x - c.x) * up.x + (f.y - c.y) * up.y;
  const pitchDeg = (Math.atan2(f.z - c.z, length) * 180) / Math.PI - PITCH_FRONT_DEG;
  return { anchor: { x: m.x + up.x * h, y: m.y + up.y * h }, width, roll, yawDeg, pitchDeg };
}

/** Below this Pose visibility a shoulder is treated as not seen (hidden, or off-frame). */
export const MIN_SHOULDER_VISIBILITY = 0.5;
/** The shoulder width is the on-screen width divided by cos(yaw), at most this many times the on-screen width. */
const MAX_WIDTH_CORRECTION = 2;

/**
 * Repère d'épaules from Pose Landmarker results, for an image of size (imgW, imgH) drawn mirrored on the canvas, or
 * null when a shoulder is not clearly visible. Position, width and roll come from the image landmarks; the yaw comes
 * from the metric world landmarks, whose depth is reliable (the image landmarks' z is not, on the shoulders).
 */
export function computeShoulders(lm: Landmark[], world: Landmark[], imgW: number, imgH: number): BodyPose | null {
  const ids = [POSE_LM.shoulderA, POSE_LM.shoulderB];
  if (ids.some(i => (lm[i].visibility ?? 1) < MIN_SHOULDER_VISIBILITY)) return null;
  const p = mirrored(lm, imgW, imgH);
  const [l, r] = leftRight(p(ids[0]), p(ids[1]));
  // World landmarks are in metres with x along the image: mirror x and depth the same way as image landmarks
  const w = (i: number): P3 => ({ x: -world[i].x, y: world[i].y, z: -world[i].z });
  const [wl, wr] = leftRight(w(ids[0]), w(ids[1]));
  const { yawDeg } = axis(wl, wr);
  const screenWidth = Math.hypot(r.x - l.x, r.y - l.y);
  const width = screenWidth * Math.min(MAX_WIDTH_CORRECTION, 1 / Math.max(1e-3, Math.cos((yawDeg * Math.PI) / 180)));
  return {
    anchor: { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }, width, roll: Math.atan2(r.y - l.y, r.x - l.x), yawDeg,
    epaules: { gauche: { x: l.x, y: l.y }, droite: { x: r.x, y: r.y } },
  };
}

/** Returns the face oval as an ordered polygon, from MediaPipe's FACE_OVAL edge list. */
export function orderedOval(edges: { start: number; end: number }[]): number[] {
  if (!edges.length) return [];
  const next = new Map(edges.map(e => [e.start, e.end]));
  const out = [edges[0].start];
  for (let cur = next.get(edges[0].start); cur !== undefined && cur !== edges[0].start && out.length <= edges.length; cur = next.get(cur)) {
    out.push(cur);
  }
  return out;
}

/**
 * How much taller than the face oval's upper half the skull is: the oval stops at the top of the forehead, the head
 * goes on up to the crown.
 */
export const SKULL_HEIGHT = 1.7;
/** How far the back of the skull reaches past the face oval when the head turns fully sideways, in oval half-widths. */
export const SKULL_BACK = 0.6;

/**
 * The whole head's outline on screen, from the face oval: its upper half stretched up to the crown and, when the head
 * turns, its back side stretched to the back of the skull. A Coiffe's back Calque is hidden behind it.
 */
export function headOutline(oval: { x: number; y: number }[], tete: Repere): { x: number; y: number }[] {
  if (!oval.length) return oval;
  const c = { x: oval.reduce((s, p) => s + p.x, 0) / oval.length, y: oval.reduce((s, p) => s + p.y, 0) / oval.length };
  const right = { x: Math.cos(tete.roll), y: Math.sin(tete.roll) }, up = { x: Math.sin(tete.roll), y: -Math.cos(tete.roll) };
  // Turning toward screen-right shows the back of the head on screen-left
  const backSign = tete.yawDeg > 0 ? -1 : 1;
  const back = 1 + SKULL_BACK * Math.abs(Math.sin((tete.yawDeg * Math.PI) / 180));
  return oval.map(p => {
    let v = (p.x - c.x) * right.x + (p.y - c.y) * right.y, u = (p.x - c.x) * up.x + (p.y - c.y) * up.y;
    if (u > 0) u *= SKULL_HEIGHT;
    if (Math.sign(v) === backSign) v *= back;
    return { x: c.x + v * right.x + u * up.x, y: c.y + v * right.y + u * up.y };
  });
}

/**
 * Repère used to place what is worn in the back (Cape, Ailes). The shoulders give its height and width; it stays
 * upright, as on a Dofus character, and, when the face is visible, it is centred on the head's axis extended down to
 * the shoulders. Close to a webcam Pose often sees a shoulder badly (cut off by the frame's edge), which tilts the
 * shoulder line and shifts its midpoint: the head is far more reliable for both.
 */
export function repereDos(epaules: BodyPose, tete: HeadPose | null): BodyPose {
  let x = epaules.anchor.x;
  if (tete) {
    // Follow the head's axis (perpendicular to the eye line) down to the shoulders' height
    const cos = Math.cos(tete.roll);
    if (Math.abs(cos) > 0.3) x = tete.anchor.x - Math.sin(tete.roll) * ((epaules.anchor.y - tete.anchor.y) / cos);
  }
  return { ...epaules, anchor: { x, y: epaules.anchor.y }, roll: 0 };
}
