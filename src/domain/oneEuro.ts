import type { Repere } from "./pose";

/**
 * One Euro filter (Casiez et al.): smooths jitter when the signal is still, follows quickly when it moves.
 */
export class OneEuroFilter {
  private prev: number | null = null;
  private dPrev = 0;
  private tPrev = 0;

  constructor(private minCutoff = 1.5, private beta = 0.02, private dCutoff = 1) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, tSeconds: number): number {
    if (this.prev === null) {
      this.prev = value;
      this.tPrev = tSeconds;
      return value;
    }
    const dt = Math.max(1e-3, tSeconds - this.tPrev);
    const d = (value - this.prev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    this.dPrev = aD * d + (1 - aD) * this.dPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dPrev);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.prev = a * value + (1 - a) * this.prev;
    this.tPrev = tSeconds;
    return this.prev;
  }

  reset(): void {
    this.prev = null;
    this.dPrev = 0;
  }
}

/** Smooths every HeadPose field independently. Angles are smoothed as plain numbers (they stay far from ±π). */
export class PoseSmoother {
  private f = {
    x: new OneEuroFilter(1.5, 0.01),
    y: new OneEuroFilter(1.5, 0.01),
    width: new OneEuroFilter(1, 0.005),
    roll: new OneEuroFilter(1.5, 0.3),
    yaw: new OneEuroFilter(1.5, 0.05),
    pitch: new OneEuroFilter(1.5, 0.05),
  };

  smooth<T extends Repere>(p: T, t: number): T {
    const out = {
      ...p,
      anchor: { x: this.f.x.filter(p.anchor.x, t), y: this.f.y.filter(p.anchor.y, t) },
      width: this.f.width.filter(p.width, t),
      roll: this.f.roll.filter(p.roll, t),
      yawDeg: this.f.yaw.filter(p.yawDeg, t),
    };
    if (p.pitchDeg !== undefined) out.pitchDeg = this.f.pitch.filter(p.pitchDeg, t);
    if (p.epaules) {
      const e = this.points;
      out.epaules = {
        gauche: { x: e.gx.filter(p.epaules.gauche.x, t), y: e.gy.filter(p.epaules.gauche.y, t) },
        droite: { x: e.dx.filter(p.epaules.droite.x, t), y: e.dy.filter(p.epaules.droite.y, t) },
      };
    }
    return out;
  }

  private points = {
    gx: new OneEuroFilter(1.5, 0.01), gy: new OneEuroFilter(1.5, 0.01),
    dx: new OneEuroFilter(1.5, 0.01), dy: new OneEuroFilter(1.5, 0.01),
  };

  reset(): void {
    Object.values(this.f).forEach(f => f.reset());
    Object.values(this.points).forEach(f => f.reset());
  }
}
