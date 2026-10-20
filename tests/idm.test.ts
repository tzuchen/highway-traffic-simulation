import { describe, it, expect } from 'vitest';
import { calculateIDMAcceleration, updateBallistic, getBallisticDisplacement } from '../src/sim/idm';
import { Vehicle } from '../src/sim/types';
import { DEFAULT_CAR_PROFILE, SIM_CONSTANTS } from '../src/sim/constants';

function createMockVehicle(id: number, x: number, v: number, a = 0): Vehicle {
  return {
    id,
    type: 'car',
    profile: { ...DEFAULT_CAR_PROFILE },
    x,
    y: 0,
    currentLane: 0,
    targetLane: 0,
    laneChangeProgress: 0,
    laneChangeCooldown: 0,
    v,
    a,
    isBraking: false,
    color: '#3b82f6',
  };
}

describe('IDM Car-Following Physics', () => {
  it('accelerates freely towards desired speed when road is clear', () => {
    const ego = createMockVehicle(1, 100, 10); // 10 m/s (36 km/h)
    const accel = calculateIDMAcceleration(ego, null);

    // Should accelerate with positive value close to maxAccel
    expect(accel).toBeGreaterThan(0.5);
    expect(accel).toBeLessThanOrEqual(DEFAULT_CAR_PROFILE.maxAccel);
  });

  it('decelerates comfortably when catching up to a slower leader', () => {
    const ego = createMockVehicle(1, 100, 30); // 30 m/s
    const leader = createMockVehicle(2, 130, 15); // 15 m/s, 30m ahead
    const accel = calculateIDMAcceleration(ego, leader);

    // Strong deceleration expected
    expect(accel).toBeLessThan(-1.0);
  });

  it('never yields NaN or Infinity even when physical gap s -> 0', () => {
    const ego = createMockVehicle(1, 100, 20);
    // Leader bumper exactly touching ego front bumper
    const leader = createMockVehicle(2, 100 + DEFAULT_CAR_PROFILE.length, 5);
    const accel = calculateIDMAcceleration(ego, leader);

    expect(Number.isFinite(accel)).toBe(true);
    expect(accel).toBeGreaterThanOrEqual(SIM_CONSTANTS.MAX_BRAKING);
  });

  it('obeys lower speed limits if imposed', () => {
    const ego = createMockVehicle(1, 100, 20); // 72 km/h
    // Impose 50 km/h speed limit (13.89 m/s)
    const accel = calculateIDMAcceleration(ego, null, 50);

    // Should brake because ego speed > speed limit
    expect(accel).toBeLessThan(0);
  });
});

describe('Ballistic Integration with Exact Stopping', () => {
  it('updates position and velocity kinematically under normal acceleration', () => {
    const ego = createMockVehicle(1, 0, 10);
    const dt = 0.1;
    const accel = 2.0;

    updateBallistic(ego, accel, dt);

    expect(ego.v).toBeCloseTo(10 + 2 * 0.1, 5);
    // x = x0 + v0*dt + 0.5*a*dt^2 = 0 + 1.0 + 0.5*2*0.01 = 1.01
    expect(ego.x).toBeCloseTo(1.01, 5);
    expect(ego.a).toBe(accel);
  });

  it('triggers exact stopping branch without overshoot or negative velocities', () => {
    const ego = createMockVehicle(1, 0, 5); // 5 m/s
    const dt = 2.0; // large step
    const accel = -5.0; // stops in exactly 1.0s

    updateBallistic(ego, accel, dt);

    // Must be exactly 0 m/s, NOT negative!
    expect(ego.v).toBe(0);
    // Distance to stop: v^2 / (2 * |a|) = 25 / 10 = 2.5m
    expect(ego.x).toBeCloseTo(2.5, 5);
  });

  it('guarantees continuous, non-reversing sub-frame ballistic displacement', () => {
    // 1. Moving car under acceleration: dx = v*tau + 0.5*a*tau^2
    const dxAccel = getBallisticDisplacement(20, 2.0, 0.05);
    expect(dxAccel).toBeCloseTo(20 * 0.05 + 0.5 * 2.0 * 0.0025, 5);

    // 2. Slow car stopping under hard braking: must clamp to stopping distance without retreat
    const vSlow = 0.2; // 0.2 m/s
    const aBrake = -4.0; // stops in 0.05s, stopping distance = 0.04 / 8 = 0.005m
    const dxBeforeStop = getBallisticDisplacement(vSlow, aBrake, 0.03);
    const dxAtStop = getBallisticDisplacement(vSlow, aBrake, 0.05);
    const dxAfterStop = getBallisticDisplacement(vSlow, aBrake, 0.09);

    expect(dxBeforeStop).toBeLessThan(dxAtStop);
    expect(dxAtStop).toBeCloseTo(0.005, 5);
    // After stop, displacement MUST stay locked at 0.005m and NEVER go negative or retreat!
    expect(dxAfterStop).toBeCloseTo(0.005, 5);
    expect(dxAfterStop).toBeGreaterThanOrEqual(dxAtStop);

    // 3. Zero velocity yields zero displacement
    expect(getBallisticDisplacement(0, -2.0, 0.05)).toBe(0);
    expect(getBallisticDisplacement(0, 0, 0.05)).toBe(0);
  });
});
