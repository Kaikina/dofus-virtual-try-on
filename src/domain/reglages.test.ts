import { describe, expect, it } from "vitest";
import {
  appliquer, DEFAULT_REGLAGE, DEFAULT_REGLAGE_AILES, DEFAULT_REGLAGE_CAPE, DOFUS_HEAD_UNITS, DOFUS_SHOULDER_UNITS, normaliser, placer, reglagePour,
} from "./reglages";

const pose = { anchor: { x: 500, y: 300 }, width: 200, roll: 0, yawDeg: 0 };

describe("placer", () => {
  it("puts the Point d'ancrage on the anchor and scales game units to the face width", () => {
    const p = placer(pose, { direction: 2, mirrored: false }, { dx: 0, dy: 0, scale: 1 }, 20);
    expect(p).toMatchObject({ x: 500, y: 300, rotation: 0 });
    // 1 game unit = width / DOFUS_HEAD_UNITS canvas px, and a PNG pixel is 1/20 of a unit
    expect(p.scaleY).toBeCloseTo(200 / DOFUS_HEAD_UNITS / 20);
    expect(p.scaleX).toBe(p.scaleY);
  });

  it("flips the image and the horizontal offset for a mirrored Vue", () => {
    const r = { dx: 0.1, dy: 0, scale: 1 };
    const right = placer(pose, { direction: 1, mirrored: false }, r, 20);
    const left = placer(pose, { direction: 1, mirrored: true }, r, 20);
    expect(left.scaleX).toBe(-left.scaleY);
    expect(right.x).toBeCloseTo(520);
    expect(left.x).toBeCloseTo(480);
  });

  it("moves offsets along the Repère axes, in Repère widths", () => {
    const up = placer(pose, { direction: 2, mirrored: false }, { dx: 0, dy: 0.5, scale: 1 }, 20);
    expect(up.y).toBeCloseTo(200); // 0.5 widths above the anchor
    const tilted = placer({ ...pose, roll: Math.PI / 2 }, { direction: 2, mirrored: false }, { dx: 0, dy: 0.5, scale: 1 }, 20);
    expect(tilted.x).toBeCloseTo(600); // rotated 90° clockwise: "up" points to screen-right
    expect(tilted.y).toBeCloseTo(300);
  });

  it("raises a Coiffe when the head is seen from above, as the top of the head shows more", () => {
    const r = { dx: 0, dy: -0.9, scale: 2 };
    const level = placer({ ...pose, pitchDeg: 0 }, { direction: 2, mirrored: false }, r, 20);
    const fromAbove = placer({ ...pose, pitchDeg: 20 }, { direction: 2, mirrored: false }, r, 20);
    expect(level.y).toBeCloseTo(300 + 0.9 * 200);
    expect(fromAbove.y).toBeLessThan(level.y - 40);
  });

  it("scales a Cape to the shoulder width", () => {
    const shoulders = { anchor: { x: 500, y: 600 }, width: 300, roll: 0, yawDeg: 0 };
    const p = placer(shoulders, { direction: 2, mirrored: false }, { dx: 0, dy: 0, scale: 1 }, 20, DOFUS_SHOULDER_UNITS);
    expect(p.scaleY).toBeCloseTo(300 / DOFUS_SHOULDER_UNITS / 20);
  });
});

describe("reglagePour, Coiffe", () => {
  const face = { dx: 0, dy: -0.1, scale: 1.3 };
  const troisQuarts = { dx: -0.2, dy: -0.15, scale: 1.4 };
  const reglages = { coiffes: { "239": { 2: face, 1: troisQuarts } }, capes: {}, ailes: {}, epaulieres: {}, costumes: {} };

  it("returns the Vue's own Réglage", () => {
    expect(reglagePour(reglages, "coiffe", 239, 1)).toEqual(troisQuarts);
  });
  it("lets an uncalibrated Vue borrow the face Vue's Réglage", () => {
    expect(reglagePour({ ...reglages, coiffes: { "239": { 2: face } } }, "coiffe", 239, 1)).toEqual(face);
  });
  it("falls back to the default for an uncalibrated skin", () => {
    expect(reglagePour(reglages, "coiffe", 448, 1)).toEqual(DEFAULT_REGLAGE);
  });
});

describe("reglagePour, Cape and Ailes", () => {
  const face = { dx: 0, dy: 0.2, scale: 2.9 };
  const troisQuarts = { dx: 0.1, dy: 0.1, scale: 3 };
  const reglages = { coiffes: {}, capes: { "119": { 2: face, 1: troisQuarts } }, ailes: {}, epaulieres: {}, costumes: {} };

  it("uses the Vue's own Réglage, then the face Vue's, then the default", () => {
    expect(reglagePour(reglages, "cape", 119, 1)).toEqual(troisQuarts);
    expect(reglagePour({ ...reglages, capes: { "119": { 2: face } } }, "cape", 119, 1)).toEqual(face);
    expect(reglagePour(reglages, "cape", 178, 1)).toEqual(DEFAULT_REGLAGE_CAPE);
    expect(reglagePour(reglages, "ailes", 178, 1)).toEqual(DEFAULT_REGLAGE_AILES);
  });
});

describe("normaliser", () => {
  it("reads the first format (Coiffe Réglages keyed by skin id)", () => {
    const old = { "239": { 2: { dx: 0, dy: -1, scale: 2 } } };
    expect(normaliser(old)).toEqual({ coiffes: old, capes: {}, ailes: {}, epaulieres: {}, costumes: {} });
  });
  it("keeps the current format", () => {
    const current = { coiffes: {}, capes: { "119": { 2: { dx: 0, dy: 0.2, scale: 3 } } }, ailes: { "2934": { 1: { dx: 0, dy: 0.3, scale: 1.8 } } }, epaulieres: {}, costumes: {} };
    expect(normaliser(current)).toEqual(current);
  });
  it("keeps only the top part of capes calibrated in two parts", () => {
    const haut = { dx: 0, dy: 0.2, scale: 3 }, bas = { dx: 0, dy: -1, scale: 2.2 };
    const twoParts = { coiffes: {}, capes: { "119": { 2: { haut, bas }, 1: { bas } } } };
    expect(normaliser(twoParts)).toEqual({ coiffes: {}, capes: { "119": { 2: haut } }, ailes: {}, epaulieres: {}, costumes: {} });
  });
});

describe("normaliser without profil", () => {
  it("drops Réglages of the profil Vue (direction 0), which no longer exists", () => {
    const face = { dx: 0, dy: -1, scale: 2 }, profil = { dx: 0.1, dy: -1, scale: 2 };
    expect(normaliser({ coiffes: { "239": { 2: face, 0: profil } }, capes: { "119": { 0: { haut: profil } } } }))
      .toEqual({ coiffes: { "239": { 2: face } }, capes: { "119": {} }, ailes: {}, epaulieres: {}, costumes: {} });
  });
});

describe("appliquer", () => {
  const base = { coiffes: { "239": { 2: { dx: 0, dy: -1, scale: 2 }, 1: { dx: 0, dy: -0.9, scale: 2 } } }, capes: {}, ailes: {}, epaulieres: {}, costumes: {} };
  it("puts a visitor's adjustment over the shipped Réglage of that Vue only", () => {
    const mine = { coiffes: { "239": { 1: { dx: 0.1, dy: -0.8, scale: 2.2 } }, "448": { 2: { dx: 0, dy: -1.2, scale: 1.8 } } }, capes: {}, ailes: {}, epaulieres: {}, costumes: {} };
    const r = appliquer(base, mine);
    expect(r.coiffes["239"][2]).toEqual({ dx: 0, dy: -1, scale: 2 });
    expect(r.coiffes["239"][1]).toEqual({ dx: 0.1, dy: -0.8, scale: 2.2 });
    expect(r.coiffes["448"][2]).toEqual({ dx: 0, dy: -1.2, scale: 1.8 });
  });
  it("leaves the shipped Réglages untouched", () => {
    appliquer(base, { coiffes: { "239": { 2: { dx: 1, dy: 1, scale: 1 } } }, capes: {}, ailes: {}, epaulieres: {}, costumes: {} });
    expect(base.coiffes["239"][2]).toEqual({ dx: 0, dy: -1, scale: 2 });
  });
});
