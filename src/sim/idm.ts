import { Vehicle } from './types';
import { SIM_CONSTANTS } from './constants';

/**
 * Calculates IDM acceleration for ego vehicle given an optional leader.
 */
export function calculateIDMAcceleration(
  ego: Vehicle,
  leader: Vehicle | null,
  speedLimitKmh?: number
): number {
  const profile = ego.profile;
  const v = Math.max(0, ego.v);

  // If external speed limit exists and is lower, obey it (speeders intentionally disobey and speed)
  const obeysSpeedLimit = ego.type !== 'speeder' && ego.personality !== 'speeder';
  const effectiveDesiredSpeed = (speedLimitKmh && obeysSpeedLimit)
    ? Math.min(profile.desiredSpeed, (speedLimitKmh * 1000) / 3600)
    : profile.desiredSpeed;

  // Free road term
  const vRatio = v / Math.max(0.1, effectiveDesiredSpeed);
  const freeTerm = 1 - Math.pow(vRatio, profile.delta);

  // If no leader or leader is far away (> 500m), return free acceleration
  if (!leader) {
    return Math.max(SIM_CONSTANTS.MAX_BRAKING, profile.maxAccel * freeTerm);
  }

  // Net distance between ego bumper and leader rear bumper
  const s = leader.x - leader.profile.length - ego.x;
  const deltaV = v - leader.v;

  // Desired dynamic gap s*
  const dynamicTerm = (v * deltaV) / (2 * Math.sqrt(profile.maxAccel * profile.comfortDecel));
  const sStar = profile.minGap + Math.max(0, v * profile.timeHeadway + dynamicTerm);

  // Numerically protected denominator s_eval
  const sEval = Math.max(s, SIM_CONSTANTS.MIN_GAP_EVAL);

  // IDM interaction term
  const interactionTerm = Math.pow(sStar / sEval, 2);

  const rawAccel = profile.maxAccel * (freeTerm - interactionTerm);

  // Emergency safety override: if physical gap is dangerously small and closing, brake harder
  if (s < profile.minGap * 0.8 && deltaV > 0) {
    return SIM_CONSTANTS.MAX_BRAKING;
  }

  return Math.max(SIM_CONSTANTS.MAX_BRAKING, rawAccel);
}

/**
 * Updates vehicle position and velocity using Ballistic Integration with Exact Stopping.
 * Guarantees zero negative velocity and realistic deceleration displacement.
 */
export function updateBallistic(ego: Vehicle, accel: number, dt: number): void {
  const vOld = ego.v;

  // Handle stopped vehicle edge case (e.g. incident or stopped behind obstacle)
  if (ego.hasIncident) {
    ego.v = 0;
    ego.a = 0;
    ego.isBraking = true;
    return;
  }

  if (accel < 0 && vOld + accel * dt < 0) {
    // Exact stopping branch within this time step
    const absA = Math.max(0.001, Math.abs(accel));
    const deltaX = (vOld * vOld) / (2 * absA);
    ego.x += deltaX;
    ego.v = 0;
    ego.a = accel;
  } else {
    // Standard ballistic kinematic step
    const vNew = Math.max(0, vOld + accel * dt);
    ego.x += vOld * dt + 0.5 * accel * dt * dt;
    ego.v = vNew;
    ego.a = accel;
  }

  // Visual brake light threshold
  ego.isBraking = accel < -1.5;
}

/**
 * Calculates continuous sub-frame displacement deltaX under ballistic motion with exact zero-velocity stopping.
 * Prevents negative retreat in slow-and-go jam queues when a < 0.
 */
export function getBallisticDisplacement(v: number, a: number, tau: number): number {
  if (v <= 0 || tau <= 0) return 0;
  if (a < 0 && v + a * tau <= 0) {
    const absA = Math.max(0.001, Math.abs(a));
    return (v * v) / (2 * absA);
  }
  return Math.max(0, v * tau + 0.5 * a * tau * tau);
}

