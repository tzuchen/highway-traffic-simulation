import { Vehicle, RoadConfig } from './types';
import { calculateIDMAcceleration } from './idm';
import { SIM_CONSTANTS } from './constants';

export interface LaneChangeDecision {
  targetLane: number;
  isMandatory: boolean;
}

/**
 * Evaluates whether ego vehicle should change lane to left or right using MOBIL.
 */
export function evaluateLaneChange(
  ego: Vehicle,
  road: RoadConfig,
  vehiclesByLane: Vehicle[][]
): LaneChangeDecision | null {
  // Discretionary cooldown check
  if (ego.laneChangeCooldown > 0 || ego.laneChangeProgress > 0 || ego.hasIncident) {
    return null;
  }

  const curLane = ego.currentLane;
  const currentLaneConfig = road.lanes[curLane];

  // 1. Check for Mandatory Merge (e.g. Lane drop ahead)
  if (currentLaneConfig && currentLaneConfig.dropEnd !== undefined) {
    const distToEnd = currentLaneConfig.dropEnd - ego.x;
    if (distToEnd > 0 && distToEnd < 200) {
      // Must merge immediately into an open lane (prefer left lane index curLane - 1)
      const targetLane = curLane > 0 ? curLane - 1 : curLane + 1;
      if (isValidMergeTarget(ego, targetLane, road, vehiclesByLane, true)) {
        return { targetLane, isMandatory: true };
      }
    }
  }

  // 2. Discretionary Lane Changes (Left or Right)
  const candidateLanes: number[] = [];
  if (curLane > 0) {
    // Highway regulation: Trucks are prohibited from discretionary lane changes into innermost passing lane 0
    const isRestrictedTruck = ego.type === 'truck' && curLane - 1 === 0 && road.lanes.length >= 3;
    if (!isRestrictedTruck) {
      candidateLanes.push(curLane - 1); // Pass / Left lane
    }
  }
  if (curLane < road.lanes.length - 1) candidateLanes.push(curLane + 1); // Right lane

  let bestTarget: number | null = null;
  let bestIncentive = 0;

  // Dynamic impatience & squeeze threshold:
  // When ego is stuck in a slower lane (v << desiredSpeed), drivers become increasingly impatient,
  // lowering their threshold to take advantage of openings in moving lanes.
  const isSpeeder = ego.type === 'speeder' || ego.personality === 'speeder';
  const speedRatio = Math.max(0, Math.min(1.0, ego.v / Math.max(1.0, ego.profile.desiredSpeed)));
  const impatience = isSpeeder ? 1.0 : Math.max(0, 1.0 - speedRatio); // Speeders have constant max impatience
  const effectiveThreshold = isSpeeder
    ? 0.03 // Chronic overtaker: instant lane change at slightest speed benefit
    : ego.profile.laneChangeThreshold * (1.0 - 0.5 * impatience);

  for (const targetLane of candidateLanes) {
    const incentive = evaluateTargetLane(ego, targetLane, road, vehiclesByLane, impatience);
    if (incentive > effectiveThreshold && incentive > bestIncentive) {
      bestIncentive = incentive;
      bestTarget = targetLane;
    }
  }

  if (bestTarget !== null) {
    return { targetLane: bestTarget, isMandatory: false };
  }

  return null;
}

/**
 * Computes average downstream lane speed within a lookahead horizon (e.g. 75m).
 * Real human drivers look downstream; if vehicles ahead are braking or crawling,
 * they anticipate the slowdown and seek to squeeze into faster adjacent lanes.
 */
function getDownstreamLaneSpeed(
  egoX: number,
  vehiclesOnLane: Vehicle[],
  defaultSpeed: number,
  lookaheadDist: number = 75
): number {
  let count = 0;
  let totalSpeed = 0;

  for (const v of vehiclesOnLane) {
    const dist = v.x - egoX;
    if (dist > 0 && dist <= lookaheadDist) {
      totalSpeed += v.v;
      count++;
    }
  }

  if (count === 0) {
    return defaultSpeed;
  }

  return totalSpeed / count;
}

/**
 * Calculates MOBIL incentive score for changing into targetLane.
 * Enhanced with Downstream Lane Speed Gradient & Congestion Squeezing.
 */
function evaluateTargetLane(
  ego: Vehicle,
  targetLane: number,
  road: RoadConfig,
  vehiclesByLane: Vehicle[][],
  impatience: number = 0
): number {
  const targetLaneConfig = road.lanes[targetLane];
  if (!targetLaneConfig || !targetLaneConfig.isOpen) return -Infinity;

  // Check if target lane ends soon
  if (targetLaneConfig.dropEnd !== undefined && targetLaneConfig.dropEnd - ego.x < 100) {
    return -Infinity;
  }

  const curVehicles = vehiclesByLane[ego.currentLane] || [];
  const tgtVehicles = vehiclesByLane[targetLane] || [];

  // Find immediate neighbors
  const { leader: curLeader, follower: curFollower } = findNeighbors(ego.x, curVehicles, ego.id);
  const { leader: tgtLeader, follower: tgtFollower } = findNeighbors(ego.x, tgtVehicles, ego.id);

  // 1. Downstream Lookahead Lane Speed Sensing (車道速度預判)
  // Lookahead 75m down both lanes to detect downstream slowdowns before being completely stopped
  const curDownstreamSpeed = getDownstreamLaneSpeed(ego.x, curVehicles, ego.v, 75);
  const tgtDownstreamSpeed = getDownstreamLaneSpeed(ego.x, tgtVehicles, ego.profile.desiredSpeed, 75);
  const laneSpeedAdvantage = tgtDownstreamSpeed - curDownstreamSpeed; // positive if target lane flows faster

  // 2. Physical gap safety (with adaptive crowding / squeeze relaxation)
  // When one lane slows down (or speeder weaves), drivers accept tighter gaps to squeeze into the moving lane
  const isSpeeder = ego.type === 'speeder' || ego.personality === 'speeder';
  const leadFloor = isSpeeder ? 0.9 : 1.1;
  const lagFloor = isSpeeder ? 0.9 : 1.1;
  const minLeadGap = Math.min(ego.profile.minGap, leadFloor + Math.max(0, ego.v - (tgtLeader?.v ?? ego.v)) * 0.3);
  if (tgtLeader) {
    const gapLead = tgtLeader.x - tgtLeader.profile.length - ego.x;
    if (gapLead < minLeadGap) return -Infinity;
  }
  if (tgtFollower) {
    const gapLag = ego.x - ego.profile.length - tgtFollower.x;
    const minLagGap = Math.min(tgtFollower.profile.minGap, lagFloor + Math.max(0, tgtFollower.v - ego.v) * 0.3);
    if (gapLag < minLagGap) return -Infinity;
  }

  // 3. Driver Impatience & Follower Decel Tolerance
  // Squeezing into a moving lane: politeness decreases, and target follower braking tolerance relaxes
  const effectivePoliteness = isSpeeder ? 0.01 : ego.profile.politeness * (1.0 - 0.7 * impatience);
  const followerDecelLimit = isSpeeder
    ? (tgtFollower ? -tgtFollower.profile.safeDecel * 1.5 : -4.5)
    : (impatience > 0.3
      ? (tgtFollower ? -tgtFollower.profile.safeDecel * (1.2 + 0.3 * impatience) : -3.5)
      : (tgtFollower ? -tgtFollower.profile.safeDecel : -2.5));

  // 4. Current accelerations
  const aCurEgo = calculateIDMAcceleration(ego, curLeader);
  const aCurOldFollower = curFollower ? calculateIDMAcceleration(curFollower, ego) : 0;
  const aCurNewFollower = tgtFollower ? calculateIDMAcceleration(tgtFollower, tgtLeader) : 0;

  // Prospective accelerations after lane change
  const aProspectiveEgo = calculateIDMAcceleration(ego, tgtLeader);
  const aProspectiveNewFollower = tgtFollower
    ? calculateIDMAcceleration(tgtFollower, ego)
    : 0;
  const aProspectiveOldFollower = curFollower
    ? calculateIDMAcceleration(curFollower, curLeader)
    : 0;

  // Safety Criterion: new follower must not brake too hard
  if (tgtFollower && aProspectiveNewFollower < followerDecelLimit) {
    return -Infinity;
  }
  // Ego also must not be forced to emergency brake in target lane
  const egoDecelLimit = impatience > 0.3 ? -ego.profile.safeDecel * 1.5 : -ego.profile.safeDecel;
  if (aProspectiveEgo < egoDecelLimit) {
    return -Infinity;
  }

  // 5. MOBIL Incentive Score with Speed-Gradient Squeeze Bonus
  // G = (a'_e - a_e) + p_eff * [ (a'_n - a_n) + (a'_o - a_o) ]
  const egoAdvantage = aProspectiveEgo - aCurEgo;
  const otherAdvantage =
    (aProspectiveNewFollower - aCurNewFollower) +
    (aProspectiveOldFollower - aCurOldFollower);

  let incentive = egoAdvantage + effectivePoliteness * otherAdvantage;

  // Squeeze incentive ("往隔壁車道擠"):
  // If target lane is noticeably faster (+5 ~ +40 km/h), apply a proportional incentive bonus
  // so drivers proactively peel off from the congested/slow lane into the flowing lane
  if (laneSpeedAdvantage > 1.5) {
    const speedBonus = Math.min(1.2, (laneSpeedAdvantage / 8.0) * (0.35 + 0.65 * impatience));
    incentive += speedBonus;
  }

  // Optional Keep-Right Bias (+0.05 incentive to move to higher lane index)
  if (targetLane > ego.currentLane) {
    incentive += 0.05;
  }

  return incentive;
}

/**
 * Checks safety for mandatory merges (looser incentive, strict physical collision guard).
 */
function isValidMergeTarget(
  ego: Vehicle,
  targetLane: number,
  road: RoadConfig,
  vehiclesByLane: Vehicle[][],
  isUrgent: boolean
): boolean {
  const targetLaneConfig = road.lanes[targetLane];
  if (!targetLaneConfig || !targetLaneConfig.isOpen) return false;

  const tgtVehicles = vehiclesByLane[targetLane] || [];
  const { leader: tgtLeader, follower: tgtFollower } = findNeighbors(ego.x, tgtVehicles, ego.id);

  if (tgtLeader) {
    const gapLead = tgtLeader.x - tgtLeader.profile.length - ego.x;
    if (gapLead < (isUrgent ? 1.0 : ego.profile.minGap)) return false;

    // Ego must not be forced to crash or brake beyond physical emergency threshold
    const aNewEgo = calculateIDMAcceleration(ego, tgtLeader);
    if (aNewEgo < (isUrgent ? -ego.profile.safeDecel * 2.0 : -ego.profile.safeDecel)) {
      return false;
    }
  }
  if (tgtFollower) {
    const gapLag = ego.x - ego.profile.length - tgtFollower.x;
    const dynamicMinLag = Math.max(1.5, (tgtFollower.v - ego.v) * 0.6);
    if (gapLag < (isUrgent ? dynamicMinLag : tgtFollower.profile.minGap)) return false;

    // Follower must not be forced past physical braking limit
    const aNewFollower = calculateIDMAcceleration(tgtFollower, ego);
    if (aNewFollower < (isUrgent ? -tgtFollower.profile.safeDecel * 1.5 : -tgtFollower.profile.safeDecel)) {
      return false;
    }
  }


  return true;
}

export function findNeighbors(
  x: number,
  vehiclesOnLane: Vehicle[],
  excludeId: number
): { leader: Vehicle | null; follower: Vehicle | null } {
  let leader: Vehicle | null = null;
  let follower: Vehicle | null = null;
  let minLeadDist = Infinity;
  let minFollowDist = Infinity;

  for (const v of vehiclesOnLane) {
    if (v.id === excludeId) continue;
    const diff = v.x - x;
    if (diff > 0 && diff < minLeadDist) {
      minLeadDist = diff;
      leader = v;
    } else if (diff < 0 && -diff < minFollowDist) {
      minFollowDist = -diff;
      follower = v;
    }
  }

  return { leader, follower };
}
