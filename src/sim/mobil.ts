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
  if (curLane > 0) candidateLanes.push(curLane - 1); // Pass / Left lane
  if (curLane < road.lanes.length - 1) candidateLanes.push(curLane + 1); // Right lane

  let bestTarget: number | null = null;
  let bestIncentive = 0;

  for (const targetLane of candidateLanes) {
    const incentive = evaluateTargetLane(ego, targetLane, road, vehiclesByLane);
    if (incentive > ego.profile.laneChangeThreshold && incentive > bestIncentive) {
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
 * Calculates MOBIL incentive score for changing into targetLane.
 */
function evaluateTargetLane(
  ego: Vehicle,
  targetLane: number,
  road: RoadConfig,
  vehiclesByLane: Vehicle[][]
): number {
  const targetLaneConfig = road.lanes[targetLane];
  if (!targetLaneConfig || !targetLaneConfig.isOpen) return -Infinity;

  // Check if target lane ends soon
  if (targetLaneConfig.dropEnd !== undefined && targetLaneConfig.dropEnd - ego.x < 100) {
    return -Infinity;
  }

  const curVehicles = vehiclesByLane[ego.currentLane] || [];
  const tgtVehicles = vehiclesByLane[targetLane] || [];

  // Find neighbors
  const { leader: curLeader, follower: curFollower } = findNeighbors(ego.x, curVehicles, ego.id);
  const { leader: tgtLeader, follower: tgtFollower } = findNeighbors(ego.x, tgtVehicles, ego.id);

  // Physical gap safety
  if (tgtLeader) {
    const gapLead = tgtLeader.x - tgtLeader.profile.length - ego.x;
    if (gapLead < ego.profile.minGap) return -Infinity;
  }
  if (tgtFollower) {
    const gapLag = ego.x - ego.profile.length - tgtFollower.x;
    if (gapLag < tgtFollower.profile.minGap) return -Infinity;
  }

  // Current accelerations
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
  if (tgtFollower && aProspectiveNewFollower < -tgtFollower.profile.safeDecel) {
    return -Infinity;
  }
  // Ego also must not be forced to emergency brake in target lane
  if (aProspectiveEgo < -ego.profile.safeDecel) {
    return -Infinity;
  }

  // MOBIL Incentive Score
  // G = (a'_e - a_e) + p * [ (a'_n - a_n) + (a'_o - a_o) ]
  const egoAdvantage = aProspectiveEgo - aCurEgo;
  const otherAdvantage =
    (aProspectiveNewFollower - aCurNewFollower) +
    (aProspectiveOldFollower - aCurOldFollower);

  let incentive = egoAdvantage + ego.profile.politeness * otherAdvantage;

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
  }
  if (tgtFollower) {
    const gapLag = ego.x - ego.profile.length - tgtFollower.x;
    if (gapLag < (isUrgent ? 1.0 : tgtFollower.profile.minGap)) return false;

    // Follower must not be forced past physical limit
    const aNewFollower = calculateIDMAcceleration(tgtFollower, ego);
    if (aNewFollower < (isUrgent ? SIM_CONSTANTS.MAX_BRAKING * 0.9 : -tgtFollower.profile.safeDecel * 1.5)) {
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
