import { describe, expect, it } from "vitest";
import { choisirVue, yawCape } from "./paliers";

describe("choisirVue", () => {
  it("shows the face Vue when looking straight ahead", () => {
    expect(choisirVue(0, null)).toEqual({ direction: 2, mirrored: false });
  });

  it("shows the 3/4 Vue as soon as the head turns toward screen-right, however far (no profil Vue)", () => {
    expect(choisirVue(25, null)).toEqual({ direction: 1, mirrored: false });
    expect(choisirVue(70, null)).toEqual({ direction: 1, mirrored: false });
  });

  it("mirrors the 3/4 Vue when the head turns toward screen-left", () => {
    expect(choisirVue(-25, null)).toEqual({ direction: 1, mirrored: true });
    expect(choisirVue(-70, null)).toEqual({ direction: 1, mirrored: true });
  });

  it("stays on the current Palier near a boundary (hysteresis)", () => {
    const face = { direction: 2 as const, mirrored: false };
    expect(choisirVue(16, face).direction).toBe(2);
    expect(choisirVue(19, face).direction).toBe(1);
    const troisQuarts = { direction: 1 as const, mirrored: false };
    expect(choisirVue(13, troisQuarts).direction).toBe(1);
    expect(choisirVue(11, troisQuarts).direction).toBe(2);
    expect(choisirVue(42, troisQuarts).direction).toBe(1);
  });

  it("keeps the previous side when coming back to the face Vue", () => {
    expect(choisirVue(-2, { direction: 1, mirrored: true })).toEqual({ direction: 2, mirrored: true });
  });
});

describe("yawCape", () => {
  it("follows the head when the face is visible, the shoulders otherwise", () => {
    expect(yawCape({ yawDeg: 36 }, { yawDeg: 71 })).toBe(36);
    expect(yawCape(null, { yawDeg: 71 })).toBe(71);
  });
});
