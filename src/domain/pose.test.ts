import { describe, expect, it } from "vitest";
import { computePose, computeShoulders, headOutline, LM, orderedOval, POSE_LM, repereDos, SKULL_HEIGHT, type Landmark } from "./pose";

/** Builds a minimal landmark array for a face centred in a 1000×1000 image. */
function face(opts: { yawDeg?: number; rollDeg?: number; pitchDeg?: number } = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const yaw = ((opts.yawDeg ?? 0) * Math.PI) / 180, roll = ((opts.rollDeg ?? 0) * Math.PI) / 180;
  const pitch = ((opts.pitchDeg ?? 0) * Math.PI) / 180;
  // A point on the head, in image coordinates (x to the image right, z away from the camera), rotated by pitch (chin
  // down: what is above the centre comes toward the camera), then yaw, then roll
  const put = (i: number, hx: number, y0: number, z0 = 0) => {
    const hy = y0 * Math.cos(pitch) - z0 * Math.sin(pitch), hz = y0 * Math.sin(pitch) + z0 * Math.cos(pitch);
    const x1 = hx * Math.cos(yaw) + hz * Math.sin(yaw), z1 = -hx * Math.sin(yaw) + hz * Math.cos(yaw);
    const x2 = x1 * Math.cos(roll) - hy * Math.sin(roll), y2 = x1 * Math.sin(roll) + hy * Math.cos(roll);
    lm[i] = { x: 0.5 + x2, y: 0.5 + y2, z: z1 };
  };
  put(LM.faceLeft, -0.1, 0);
  put(LM.faceRight, 0.1, 0);
  put(LM.eyeOuterA, -0.06, -0.03);
  put(LM.eyeOuterB, 0.06, -0.03);
  put(LM.forehead, 0, -0.12, -0.08); // the forehead sits in front of the face edges (closer to the camera)
  put(LM.chin, 0, 0.12, -0.08);
  return lm;
}

describe("computePose", () => {
  it("measures the face width and anchors at forehead height on the head axis", () => {
    const p = computePose(face(), 1000, 1000);
    expect(p.width).toBeCloseTo(200);
    expect(p.anchor.x).toBeCloseTo(500);
    expect(p.anchor.y).toBeCloseTo(380);
    expect(p.yawDeg).toBeCloseTo(0);
    expect(p.roll).toBeCloseTo(0);
  });

  it("keeps the anchor centred on the head when it turns, although the forehead moves sideways", () => {
    const lm = face({ yawDeg: 40 });
    expect(Math.abs((1 - lm[LM.forehead].x) * 1000 - 500)).toBeGreaterThan(40);
    const p = computePose(lm, 1000, 1000);
    expect(p.anchor.x).toBeCloseTo(500);
    expect(p.anchor.y).toBeCloseTo(380);
  });

  it("follows the head's up axis when it tilts", () => {
    const p = computePose(face({ rollDeg: 90 }), 1000, 1000);
    // In the image the head's up points to image-right; mirrored, the anchor is 120 px to the screen-left of centre
    expect(p.anchor.x).toBeCloseTo(380);
    expect(p.anchor.y).toBeCloseTo(500);
  });

  it("gives opposite yaw signs for opposite head turns, and keeps the face width", () => {
    const a = computePose(face({ yawDeg: 30 }), 1000, 1000);
    const b = computePose(face({ yawDeg: -30 }), 1000, 1000);
    expect(Math.abs(a.yawDeg)).toBeCloseTo(30);
    expect(b.yawDeg).toBeCloseTo(-a.yawDeg);
    expect(a.width).toBeCloseTo(200);
  });

  it("gives a positive yaw when the face turns toward screen-right in the mirrored preview", () => {
    // yawDeg > 0 in the fixture brings the image-right edge of the face closer to the camera: the nose points to
    // image-left, which is screen-right once mirrored. Dofus directions 0 and 1 face screen-right, unmirrored.
    expect(computePose(face({ yawDeg: 30 }), 1000, 1000).yawDeg).toBeGreaterThan(0);
  });

  it("reports the roll of the eye line as seen in the mirrored preview", () => {
    // Tilting in the image by +10° appears as -10° once mirrored
    expect((computePose(face({ rollDeg: 10 }), 1000, 1000).roll * 180) / Math.PI).toBeCloseTo(-10);
  });
});

describe("computePose · pitch", () => {
  it("is zero for a level head", () => {
    expect(computePose(face(), 1000, 1000).pitchDeg).toBeCloseTo(0);
  });
  it("is positive when the head is seen from above (chin down)", () => {
    expect(computePose(face({ pitchDeg: 20 }), 1000, 1000).pitchDeg).toBeCloseTo(20);
    expect(computePose(face({ pitchDeg: -15 }), 1000, 1000).pitchDeg).toBeCloseTo(-15);
  });
  it("is still measured when the head also turns", () => {
    expect(computePose(face({ pitchDeg: 20, yawDeg: 30 }), 1000, 1000).pitchDeg).toBeGreaterThan(15);
  });
});

describe("orderedOval", () => {
  it("chains the edge list into a polygon", () => {
    expect(orderedOval([{ start: 1, end: 2 }, { start: 3, end: 1 }, { start: 2, end: 3 }])).toEqual([1, 2, 3]);
  });
});

describe("computeShoulders", () => {
  /**
   * Pose results for shoulders 0.3 image widths apart (0.4 m in the world), the torso turned by yawDeg.
   * `imageZ` lets a test put a wildly wrong depth in the image landmarks, as Pose does on the shoulders.
   */
  function body(yawDeg = 0, opts: { imageZ?: number; visibility?: number } = {}) {
    const yaw = (yawDeg * Math.PI) / 180;
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    lm[POSE_LM.shoulderA] = { x: 0.5 + 0.15 * Math.cos(yaw), y: 0.7, z: opts.imageZ ?? 0, visibility: opts.visibility ?? 1 };
    lm[POSE_LM.shoulderB] = { x: 0.5 - 0.15 * Math.cos(yaw), y: 0.7, z: -(opts.imageZ ?? 0), visibility: 1 };
    world[POSE_LM.shoulderA] = { x: 0.2 * Math.cos(yaw), y: -0.4, z: -0.2 * Math.sin(yaw), visibility: 1 };
    world[POSE_LM.shoulderB] = { x: -0.2 * Math.cos(yaw), y: -0.4, z: 0.2 * Math.sin(yaw), visibility: 1 };
    return { lm, world };
  }

  it("anchors between the shoulders and measures their width", () => {
    const { lm, world } = body();
    const p = computeShoulders(lm, world, 1000, 1000)!;
    expect(p.anchor).toEqual({ x: 500, y: 700 });
    expect(p.width).toBeCloseTo(300);
    expect(p.roll).toBeCloseTo(0);
    expect(p.yawDeg).toBeCloseTo(0);
  });

  it("takes the yaw from the world landmarks, with the same convention as the head", () => {
    // Same fixture logic as face(): yawDeg > 0 brings the image-right shoulder closer to the camera
    const right = body(30, { imageZ: 0.4 }); // a misleading image depth must not matter
    expect(computeShoulders(right.lm, right.world, 1000, 1000)!.yawDeg).toBeCloseTo(30);
    const left = body(-30);
    expect(computeShoulders(left.lm, left.world, 1000, 1000)!.yawDeg).toBeCloseTo(-30);
  });

  it("recovers the real width of a turned torso, but never more than twice the on-screen width", () => {
    const turned = body(30);
    expect(computeShoulders(turned.lm, turned.world, 1000, 1000)!.width).toBeCloseTo(300);
    const profile = body(85);
    const onScreen = 300 * Math.cos((85 * Math.PI) / 180);
    expect(computeShoulders(profile.lm, profile.world, 1000, 1000)!.width).toBeCloseTo(onScreen * 2);
  });

  it("ignores shoulders Pose is not confident about", () => {
    const { lm, world } = body(0, { visibility: 0.2 });
    expect(computeShoulders(lm, world, 1000, 1000)).toBeNull();
  });
});

describe("repereDos", () => {
  const epaules = { anchor: { x: 700, y: 800 }, width: 300, roll: 0.3, yawDeg: 10 };

  it("stays upright and keeps the shoulders' height, width and yaw", () => {
    const r = repereDos(epaules, null);
    expect(r).toEqual({ anchor: { x: 700, y: 800 }, width: 300, roll: 0, yawDeg: 10 });
  });

  it("is centred under the head when the face is visible", () => {
    const tete = { anchor: { x: 500, y: 300 }, width: 200, roll: 0, yawDeg: 0 };
    expect(repereDos(epaules, tete).anchor).toEqual({ x: 500, y: 800 });
  });

  it("follows a tilted head's axis down to the shoulders", () => {
    // Head tilted 10° clockwise: its axis goes down and to the left on screen
    const tete = { anchor: { x: 500, y: 300 }, width: 200, roll: (10 * Math.PI) / 180, yawDeg: 0 };
    expect(repereDos(epaules, tete).anchor.x).toBeCloseTo(500 - Math.tan((10 * Math.PI) / 180) * 500);
  });
});

describe("computeShoulders · each shoulder", () => {
  it("gives the screen-left and screen-right shoulders, for shoulder pads", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    lm[POSE_LM.shoulderA] = { x: 0.65, y: 0.7, z: 0, visibility: 1 };
    lm[POSE_LM.shoulderB] = { x: 0.35, y: 0.72, z: 0, visibility: 1 };
    const e = computeShoulders(lm, world, 1000, 1000)!.epaules!;
    // Mirrored: image x 0.65 lands at screen x 350, on the left
    expect(e.gauche).toEqual({ x: 350, y: 700 });
    expect(e.droite.x).toBeCloseTo(650);
    expect(e.droite.y).toBeCloseTo(720);
  });
});

describe("headOutline", () => {
  // A diamond-shaped "oval" centred on (500, 500): top, right, bottom, left
  const oval = [{ x: 500, y: 400 }, { x: 580, y: 500 }, { x: 500, y: 620 }, { x: 420, y: 500 }];
  const level = { anchor: { x: 500, y: 400 }, width: 160, roll: 0, yawDeg: 0 };
  const c = 505; // the four points' mean y

  it("reaches up to the crown, above the top of the forehead, and keeps the chin", () => {
    const h = headOutline(oval, level);
    expect(h[0].y).toBeCloseTo(c - (c - 400) * SKULL_HEIGHT);
    expect(h[2]).toEqual(oval[2]);
  });

  it("reaches past the face on the back of a turned head only", () => {
    const h = headOutline(oval, { ...level, yawDeg: 40 }); // facing screen-right: the back of the head is on the left
    expect(h[3].x).toBeLessThan(420);
    expect(h[1].x).toBeCloseTo(580);
  });
});
