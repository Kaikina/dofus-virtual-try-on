import { describe, expect, it } from "vitest";
import { imageDuTour, reglageDuTour, tourner } from "./rotation";

describe("tourner", () => {
  it("shows the face Vue while the head is about straight, despite its wobble", () => {
    expect(tourner(0, false).t).toBe(0);
    expect(tourner(4, false).t).toBe(0);
    expect(tourner(-4, false).t).toBe(0);
  });

  it("goes from the face Vue to the 3/4 Vue as the head turns, then stays on the 3/4 Vue", () => {
    expect(tourner(20, false).t).toBeCloseTo(0.5);
    expect(tourner(35, false).t).toBe(1);
    expect(tourner(70, false).t).toBe(1);
  });

  it("mirrors for a head turned toward screen-left", () => {
    expect(tourner(-20, false)).toEqual({ t: 0.5, mirrored: true });
  });

  it("keeps the previous side while looking straight ahead", () => {
    expect(tourner(-2, true).mirrored).toBe(true);
    expect(tourner(2, true).mirrored).toBe(true);
    expect(tourner(4, true).mirrored).toBe(false);
  });
});

describe("imageDuTour", () => {
  it("shows the face Vue at t = 0 and the 3/4 Vue at t = 1", () => {
    expect(imageDuTour(0, 5, null)).toBe(0);
    expect(imageDuTour(1, 5, null)).toBe(6);
  });

  it("shows the nearest image", () => {
    expect(imageDuTour(2.2 / 6, 5, null)).toBe(2);
  });

  it("keeps the current image until t is clearly nearer another one", () => {
    expect(imageDuTour(1.6 / 6, 5, 1)).toBe(1); // just past halfway: stays
    expect(imageDuTour(1.8 / 6, 5, 1)).toBe(2);
    expect(imageDuTour(1.3 / 6, 5, 2)).toBe(2);
    expect(imageDuTour(1.2 / 6, 5, 2)).toBe(1);
  });
});

describe("reglageDuTour", () => {
  it("moves from the face Vue's Réglage to the 3/4 Vue's", () => {
    const face = { dx: 0, dy: 0.2, scale: 1 }, tq = { dx: 0.1, dy: 0.4, scale: 1.2 };
    expect(reglageDuTour(face, tq, 0)).toEqual(face);
    expect(reglageDuTour(face, tq, 1)).toEqual(tq);
    expect(reglageDuTour(face, tq, 0.5).dy).toBeCloseTo(0.3);
  });
});
