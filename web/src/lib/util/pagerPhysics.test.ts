import { describe, it, expect } from 'vitest';
import {
  stepSpring,
  projectSettleTarget,
  rubberBand,
  clampWithRubberBand,
  isAtRest,
  LAUNCHPAD_DEFAULTS
} from './pagerPhysics';

describe('stepSpring', () => {
  const p = { stiffness: 100, damping: 20 };

  it('moves position toward target and gives velocity a positive sign when target > position', () => {
    const next = stepSpring({ position: 1, velocity: 0 }, 2, 0.016, p);
    expect(next.position).toBeGreaterThan(1);
    expect(next.velocity).toBeGreaterThan(0);
  });

  it('stays put when already at target with zero velocity', () => {
    const next = stepSpring({ position: 2, velocity: 0 }, 2, 0.016, p);
    expect(next.position).toBeCloseTo(2, 6);
    expect(next.velocity).toBeCloseTo(0, 6);
  });

  it('converges to target without overshoot (critically damped)', () => {
    // Simulate ~2 seconds at 60fps from position 0 toward target 1.
    let s = { position: 0, velocity: 0 };
    let maxPos = 0;
    for (let i = 0; i < 120; i++) {
      s = stepSpring(s, 1, 1 / 60, p);
      if (s.position > maxPos) maxPos = s.position;
    }
    // Overshoot budget: no more than 0.001 past target (numerical noise only).
    expect(maxPos).toBeLessThanOrEqual(1.001);
    expect(s.position).toBeCloseTo(1, 3);
    expect(Math.abs(s.velocity)).toBeLessThan(0.01);
  });
});

describe('projectSettleTarget', () => {
  it('returns floor(pos) when velocity is 0 and pos below .5', () => {
    expect(projectSettleTarget(0.4, 0, 3, 300)).toBe(0);
  });

  it('projects forward with positive velocity and rounds', () => {
    // proj = 0.4 + 1.5 * 0.3 = 0.85 → round → 1
    expect(projectSettleTarget(0.4, 1.5, 3, 300)).toBe(1);
  });

  it('projects backward with negative velocity and clamps at 0', () => {
    // proj = 0.4 - 1.5 * 0.3 = -0.05 → round → 0 (or -0), clamp to 0
    expect(projectSettleTarget(0.4, -1.5, 3, 300)).toBe(0);
  });

  it('clamps to last page for oversized forward projection', () => {
    // proj = 2.5 + 10 * 0.3 = 5.5 → clamp to pageCount-1 = 2
    expect(projectSettleTarget(2.5, 10, 3, 300)).toBe(2);
  });
});

describe('rubberBand', () => {
  it('returns 0 for no overreach', () => {
    expect(rubberBand(0, 1000, 0.55)).toBe(0);
  });

  it('gives real damping (displacement < over)', () => {
    const d = rubberBand(50, 1000, 0.55);
    expect(d).toBeLessThan(50);
    expect(d).toBeGreaterThan(0);
  });

  it('approaches but never exceeds w for large overreach', () => {
    const d = rubberBand(10_000, 1000, 0.55);
    expect(d).toBeLessThan(1000);
    // canonical iOS asymptote at over=10*w, resistance=0.55 → w*10/(10+1/r) ≈ 846.15
    expect(d).toBeGreaterThan(800);
  });
});

describe('clampWithRubberBand', () => {
  it('is identity inside [0, pageCount-1]', () => {
    expect(clampWithRubberBand(0, 3, 0.55)).toBe(0);
    expect(clampWithRubberBand(1.5, 3, 0.55)).toBeCloseTo(1.5, 6);
    expect(clampWithRubberBand(2, 3, 0.55)).toBe(2);
  });

  it('applies damping past the low edge', () => {
    // position = -0.3 → -rubberBand(0.3, 1, 0.55) which is small negative
    const p = clampWithRubberBand(-0.3, 3, 0.55);
    expect(p).toBeLessThan(0);
    expect(p).toBeGreaterThan(-0.3); // damped
  });

  it('applies damping past the high edge', () => {
    // pageCount=3 → max=2; position=2.4 → 2 + rubberBand(0.4, 1, 0.55) (small positive)
    const p = clampWithRubberBand(2.4, 3, 0.55);
    expect(p).toBeGreaterThan(2);
    expect(p).toBeLessThan(2.4);
  });
});

describe('isAtRest', () => {
  it('true when both position delta and velocity are below epsilon', () => {
    expect(
      isAtRest({ position: 1.0005, velocity: 0.0005 }, 1, { position: 0.001, velocity: 0.001 })
    ).toBe(true);
  });

  it('false when velocity above epsilon', () => {
    expect(isAtRest({ position: 1, velocity: 0.01 }, 1, { position: 0.001, velocity: 0.001 })).toBe(
      false
    );
  });

  it('false when position delta above epsilon', () => {
    expect(isAtRest({ position: 1.01, velocity: 0 }, 1, { position: 0.001, velocity: 0.001 })).toBe(
      false
    );
  });
});

describe('LAUNCHPAD_DEFAULTS', () => {
  it('matches spec constants', () => {
    expect(LAUNCHPAD_DEFAULTS.spring).toEqual({ stiffness: 100, damping: 20 });
    expect(LAUNCHPAD_DEFAULTS.projectionMs).toBe(300);
    expect(LAUNCHPAD_DEFAULTS.wheelIdleMs).toBe(180);
    expect(LAUNCHPAD_DEFAULTS.rubberBandResistance).toBe(0.55);
    expect(LAUNCHPAD_DEFAULTS.restEpsilon).toEqual({ position: 0.001, velocity: 0.001 });
    expect(LAUNCHPAD_DEFAULTS.displacementThreshold).toBe(0.3);
  });
});

describe('projectSettleTarget - displacement threshold', () => {
  it('low velocity + displacement past threshold commits one page forward', () => {
    // Drag from page 0 to position 0.35 with no velocity.
    // Velocity rule alone: round(0.35) = 0 (fails).
    // Displacement rule: 0.35 > 0.3 → commits to page 1.
    expect(projectSettleTarget(0.35, 0, 3, 300, 0.3, 0)).toBe(1);
  });

  it('low velocity + displacement below threshold snaps back', () => {
    // Drag from page 0 to 0.2 → below 0.3 threshold → back to 0.
    expect(projectSettleTarget(0.2, 0, 3, 300, 0.3, 0)).toBe(0);
  });

  it('fast flick still wins over displacement rule when it goes further', () => {
    // Position 0.4 (past displacement threshold) + big forward velocity.
    // Velocity: round(0.4 + 8 * 0.3) = round(2.8) = 3, clamped to pageCount-1=2.
    // Displacement: 0 + 1 = 1. Max of 2 and 1 in forward direction = 2.
    expect(projectSettleTarget(0.4, 8, 3, 300, 0.3, 0)).toBe(2);
  });

  it('backward drag past threshold commits one page back', () => {
    // Drag from page 2 to position 1.65 (displacement = -0.35, |Δ| > 0.3).
    expect(projectSettleTarget(1.65, 0, 3, 300, 0.3, 2)).toBe(1);
  });

  it('signature without startPage falls back to velocity-only rule', () => {
    // Same inputs as the "displacement past threshold" test, but no
    // startPage / threshold passed — should NOT commit forward.
    expect(projectSettleTarget(0.35, 0, 3, 300)).toBe(0);
  });
});
