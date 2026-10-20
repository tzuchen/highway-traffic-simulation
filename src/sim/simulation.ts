import { Vehicle, RoadConfig, VehicleType, ScenarioType, CongestionDiagnosis, TrajectoryPoint, DetectorReading, VehicleTelemetry, DriverProfile } from './types';
import { SIM_CONSTANTS, DEFAULT_CAR_PROFILE, DEFAULT_TRUCK_PROFILE, DEFAULT_ACC_PROFILE, DEFAULT_SPEEDER_PROFILE, createDriverProfile, createSpeederProfile, quinticTrajectory, getKinematicLaneChangeDuration } from './constants';

import { calculateIDMAcceleration, updateBallistic } from './idm';
import { evaluateLaneChange, findNeighbors } from './mobil';
import { SCENARIOS } from './scenarios';
import { TrafficAnalytics } from './analytics';

export interface SimulationParams {
  inflowVehPerHour: number;
  truckPercentage: number;     // 0 - 100
  accPercentage: number;       // 0 - 100
  speedLimitKmh: number;
  rampMeteringActive: boolean;
  variableSpeedLimitActive: boolean;
}

export class SimulationEngine {
  public time = 0;
  public subFrameSec = 0; // Elapsed seconds into the current 0.1s physics step for 60FPS interpolation
  private speederOvertakenMap = new Map<number, Set<number>>();
  public road: RoadConfig;
  public scenarioType: ScenarioType = 'lane_drop';
  public vehicles: Vehicle[] = [];
  public params: SimulationParams;
  public analytics = new TrafficAnalytics();

  private nextVehicleId = 1;
  private spawnCountdowns: number[] = []; // Independent stochastic countdown per lane (Shifted Exponential)
  private onRampCountdown = 0;
  private accidentVehicleId: number | null = null;

  constructor(scenarioType: ScenarioType = 'lane_drop') {
    this.scenarioType = scenarioType;
    const scenario = SCENARIOS[scenarioType];
    this.road = JSON.parse(JSON.stringify(scenario.roadConfig));

    this.params = {
      inflowVehPerHour: scenario.defaultInflowVehPerHour,
      truckPercentage: 15,
      accPercentage: 5,
      speedLimitKmh: this.road.speedLimitKmh,
      rampMeteringActive: false,
      variableSpeedLimitActive: false,
    };

    this.initSpawnTimers();
    this.seedInitialTraffic();
  }

  public setScenario(type: ScenarioType): void {
    this.scenarioType = type;
    const scenario = SCENARIOS[type];
    this.road = JSON.parse(JSON.stringify(scenario.roadConfig));
    this.params.inflowVehPerHour = scenario.defaultInflowVehPerHour;
    this.params.speedLimitKmh = this.road.speedLimitKmh;
    this.reset();
  }

  public reset(): void {
    this.time = 0;
    this.vehicles = [];
    this.nextVehicleId = 1;
    this.initSpawnTimers();
    this.accidentVehicleId = null;
    this.analytics.reset();
    this.seedInitialTraffic();
  }

  /**
   * Populates the road with initial smooth vehicles to skip empty road warmup.
   */
  private seedInitialTraffic(): void {
    const spacing = 80; // meters between cars
    for (let lane = 0; lane < this.road.numLanes; lane++) {
      if (this.road.lanes[lane].dropEnd && this.road.lanes[lane].dropEnd! < 500) continue;
      const truckProb = this.getLaneTruckProbability(lane);
      const laneOffset = 60 + Math.random() * 40; // Stagger starting grid across lanes

      for (let x = laneOffset; x < this.road.length - 200; x += spacing + (Math.random() * 30 - 15)) {
        // Skip dropping lane downstream
        if (this.road.lanes[lane].dropStart && x > this.road.lanes[lane].dropStart!) continue;

        const isTruck = Math.random() * 100 < truckProb;
        const isAcc = !isTruck && Math.random() * 100 < this.params.accPercentage;
        const type: VehicleType = isTruck ? 'truck' : isAcc ? 'acc' : 'car';
        const { profile, personality } = createDriverProfile(type);

        this.vehicles.push({
          id: this.nextVehicleId++,
          type,
          profile,
          personality,
          x,
          y: lane,
          currentLane: lane,
          targetLane: lane,
          laneChangeProgress: 0,
          laneChangeCooldown: 1.0 + Math.random() * 2,
          v: Math.min(profile.desiredSpeed * 0.9, (80 / 3.6) + Math.random() * 6),
          a: 0,
          isBraking: false,
          color: this.getVehicleColor(type),
        });
      }
    }
  }

  /**
   * Main simulation step (typically called at dt = 0.1s).
   */
  public step(dt: number = SIM_CONSTANTS.DT): void {
    this.time += dt;

    // 1. Inflow Vehicle Generation (Mainline)
    this.spawnMainlineVehicles(dt);

    // 2. On-ramp Vehicle Generation (if applicable)
    if (this.road.onRamp && this.road.onRamp.active) {
      this.spawnOnRampVehicles(dt);
    }

    // 3. Partition vehicles by current and target lane for fast spatial queries
    // Transitioning vehicles are included in target lane so followers anticipate and yield!
    const vehiclesByLane: Vehicle[][] = Array.from({ length: this.road.numLanes }, () => []);
    for (const v of this.vehicles) {
      if (v.currentLane >= 0 && v.currentLane < this.road.numLanes) {
        // Retain vehicle in current lane while not fully transferred (p < 0.75) or if aborting back
        if (v.laneChangeProgress === 0 || v.isAbortingLaneChange || v.laneChangeProgress < 0.75) {
          vehiclesByLane[v.currentLane].push(v);
        }
      }
      if (v.laneChangeProgress > 0 && v.targetLane !== v.currentLane && v.targetLane >= 0 && v.targetLane < this.road.numLanes) {
        vehiclesByLane[v.targetLane].push(v);
      }
    }
    for (let l = 0; l < this.road.numLanes; l++) {
      vehiclesByLane[l].sort((a, b) => a.x - b.x);
    }

    // 4. MOBIL Lane-Changing Evaluation & Mid-Maneuver Collision Abort
    const effectiveSpeedLimit = this.params.variableSpeedLimitActive
      ? Math.min(this.params.speedLimitKmh, 60) // Harmonize to 60 km/h upstream
      : this.params.speedLimitKmh;

    for (const v of this.vehicles) {
      if (v.laneChangeCooldown > 0) {
        v.laneChangeCooldown = Math.max(0, v.laneChangeCooldown - dt);
      }

      // If already in middle of changing lanes, evaluate dynamic collision risk & update lateral animation
      if (v.laneChangeProgress > 0) {
        // Evaluate dynamic abort if not already returning and not past point of no return (p < 0.85)
        if (!v.isAbortingLaneChange && v.laneChangeProgress < 0.85) {
          const tgtVehicles = vehiclesByLane[v.targetLane] || [];
          const curVehicles = vehiclesByLane[v.currentLane] || [];
          const { leader: tgtLeader, follower: tgtFollower } = findNeighbors(v.x, tgtVehicles, v.id);
          const { leader: curLeader } = findNeighbors(v.x, curVehicles, v.id);

          let isDangerInTarget = false;

          // A. Target Leader Collision Risk:
          if (tgtLeader) {
            const gapLead = tgtLeader.x - tgtLeader.profile.length - v.x;
            const deltaV = v.v - tgtLeader.v;
            // 1. Proximity hazard (gap less than safety gap while closing)
            if (gapLead < v.profile.minGap * 0.9 && deltaV > 0) {
              isDangerInTarget = true;
            }
            // 2. Imminent collision time (TTC < 1.3s)
            else if (deltaV > 1.2 && gapLead / deltaV < 1.3) {
              isDangerInTarget = true;
            }
            // 3. Target leader severe braking / prospective decel beyond comfort
            const aTgt = calculateIDMAcceleration(v, tgtLeader, effectiveSpeedLimit);
            if (aTgt < -v.profile.safeDecel * 1.5) {
              isDangerInTarget = true;
            }
          }

          // B. Target Follower Collision Risk (tailgater closing in hot):
          if (tgtFollower) {
            const gapLag = v.x - v.profile.length - tgtFollower.x;
            const deltaVLag = tgtFollower.v - v.v;
            if (gapLag < tgtFollower.profile.minGap * 0.7 && deltaVLag > 1.5) {
              isDangerInTarget = true;
            }
          }

          // If danger detected, check if original lane is viable to return to
          if (isDangerInTarget) {
            let canAbortToCurLane = true;
            const curLaneConfig = this.road.lanes[v.currentLane];
            if (curLaneConfig && curLaneConfig.dropEnd !== undefined) {
              const distToDrop = curLaneConfig.dropEnd - v.x;
              if (distToDrop < 25) {
                canAbortToCurLane = false; // Cannot abort into a closed barrier
              }
            }
            if (curLeader) {
              const gapCur = curLeader.x - curLeader.profile.length - v.x;
              if (gapCur < 1.2 && v.v > curLeader.v) {
                canAbortToCurLane = false;
              }
            }

            if (canAbortToCurLane) {
              v.isAbortingLaneChange = true;
            }
          }
        }

        // Speed-adaptive kinematic lane change duration:
        // Trucks: nominal 3.2s, min 45m; Cars: nominal 2.6s, min 28m
        // Prevents low-speed angular jackknifing / 70-degree protrusion across lanes
        const { duration } = getKinematicLaneChangeDuration(v);

        // Update lateral position based on whether continuing or aborting
        if (v.isAbortingLaneChange) {
          // Returning back to currentLane smoothly
          const abortStep = dt / duration;
          v.laneChangeProgress = Math.max(0, v.laneChangeProgress - abortStep);
          const { q } = quinticTrajectory(v.laneChangeProgress);
          v.y = v.currentLane + (v.targetLane - v.currentLane) * q;

          if (v.laneChangeProgress <= 0) {
            // Fully returned to original lane
            v.targetLane = v.currentLane;
            v.laneChangeProgress = 0;
            v.y = v.currentLane;
            v.isAbortingLaneChange = false;
            v.laneChangeCooldown = 4.0; // Penalty cooldown to prevent immediate re-entry
          }
        } else {
          // Continuing outbound lane change
          const step = dt / duration;
          v.laneChangeProgress = Math.min(1.0, v.laneChangeProgress + step);
          const { q } = quinticTrajectory(v.laneChangeProgress);
          v.y = v.currentLane + (v.targetLane - v.currentLane) * q;

          if (v.laneChangeProgress >= 1.0) {
            // Completed lane change
            v.currentLane = v.targetLane;
            v.laneChangeProgress = 0;
            v.y = v.currentLane;
            // Speeders weave with rapid 0.8s cooldown, while normal cars use standard 3.0s
            v.laneChangeCooldown = (v.type === 'speeder' || v.personality === 'speeder')
              ? 0.8
              : SIM_CONSTANTS.LANE_CHANGE_COOLDOWN;
          }
        }
      } else {
        // Evaluate new lane change
        const decision = evaluateLaneChange(v, this.road, vehiclesByLane);
        if (decision) {
          v.targetLane = decision.targetLane;
          v.laneChangeProgress = 0.01;
          v.isAbortingLaneChange = false;

          // Track shockwaves induced by speeders cutting in front of followers
          if (v.type === 'speeder' || v.personality === 'speeder') {
            const tgtList = vehiclesByLane[v.targetLane] || [];
            const { follower: tgtFollower } = findNeighbors(v.x, tgtList, v.id);
            if (tgtFollower) {
              const aFollower = calculateIDMAcceleration(tgtFollower, v, effectiveSpeedLimit);
              if (aFollower < -2.0) {
                v.inducedBrakesCount = (v.inducedBrakesCount ?? 0) + 1;
              }
            }
          }
        }
      }
    }

    // 5. Calculate IDM Accelerations (synchronous snapshot)
    const plannedAccelerations = new Map<number, number>();
    for (const v of this.vehicles) {
      if (v.hasIncident) {
        plannedAccelerations.set(v.id, 0);
        continue;
      }

      let a = 0;

      if (v.laneChangeProgress > 0 && v.targetLane !== v.currentLane) {
        // Vehicle in transition between lanes: blend leader influences smoothly based on commitment
        const curList = vehiclesByLane[v.currentLane] || [];
        const tgtList = vehiclesByLane[v.targetLane] || [];
        const { leader: curLeader } = findNeighbors(v.x, curList, v.id);
        const { leader: tgtLeader } = findNeighbors(v.x, tgtList, v.id);

        const effCurLeader = this.getEffectiveLeader(v, curLeader, v.currentLane);
        const effTgtLeader = this.getEffectiveLeader(v, tgtLeader, v.targetLane);

        const aCur = calculateIDMAcceleration(v, effCurLeader, effectiveSpeedLimit);
        const aTgt = calculateIDMAcceleration(v, effTgtLeader, effectiveSpeedLimit);

        const p = v.laneChangeProgress;
        if (v.isAbortingLaneChange || aTgt < 0) {
          // If aborting or target leader requires deceleration/braking, strictly obey safety bound
          a = Math.min(aCur, aTgt);
        } else {
          // Outbound lane change with open/accelerating target lane:
          if (p < 0.30) {
            a = Math.min(aCur, aTgt);
          } else if (p < 0.70) {
            const w = (p - 0.30) / 0.40; // 0 -> 1
            const combined = Math.min(aCur, aTgt);
            a = (1 - w) * combined + w * aTgt;
          } else {
            // Vehicle is mostly in target lane (>= 70%): target lane leader governs
            a = aTgt;
          }
        }

        // Active forward creep guarantee ("慢慢往前，而不是卡死")
        // During lane change, if forward space in target path is clear (> 0.8m)
        // and vehicle is trapped/crawling (v < 2.2 m/s), provide gentle positive creep
        // acceleration so the vehicle inches forward and completes the maneuver safely.
        const relevantGap = (p >= 0.5)
          ? (effTgtLeader ? (effTgtLeader.x - effTgtLeader.profile.length - v.x) : 999)
          : Math.min(
              effCurLeader ? (effCurLeader.x - effCurLeader.profile.length - v.x) : 999,
              effTgtLeader ? (effTgtLeader.x - effTgtLeader.profile.length - v.x) : 999
            );

        if (relevantGap > 0.8 && v.v < 2.2) {
          const targetCreepV = Math.min(2.0, Math.max(0.8, relevantGap * 0.4));
          if (v.v < targetCreepV) {
            const creepAccel = Math.min(v.profile.maxAccel * 0.5, 0.6);
            a = Math.max(a, creepAccel);
          }
        }
      } else {
        const laneList = vehiclesByLane[v.currentLane] || [];
        const { leader } = findNeighbors(v.x, laneList, v.id);
        const effectiveLeader = this.getEffectiveLeader(v, leader, v.currentLane);
        a = calculateIDMAcceleration(v, effectiveLeader, effectiveSpeedLimit);
      }

      plannedAccelerations.set(v.id, a);
    }

    // 6. Kinematic Update with Ballistic Exact Stopping
    for (const v of this.vehicles) {
      const a = plannedAccelerations.get(v.id) ?? 0;
      updateBallistic(v, a, dt);
    }

    // 6.1 Solid Body Non-Penetration Guard (Strict Physical Invariant, Downstream to Upstream Sweep)
    for (let l = 0; l < this.road.numLanes; l++) {
      // Include any vehicle whose physical footprint touches lane l
      // A vehicle during lane change spans both currentLane and targetLane based on actual physical overlap
      const laneCars = this.vehicles
        .filter((v) => {
          if (v.currentLane === l) {
            // If changing out of lane l (and not aborting back to it), physical footprint clears lane l once p >= 0.70
            if (v.laneChangeProgress > 0 && !v.isAbortingLaneChange && v.targetLane !== l && v.laneChangeProgress >= 0.70) {
              return false;
            }
            return true;
          }
          if (v.laneChangeProgress > 0 && v.targetLane === l) {
            // If aborting back to currentLane, it clears target lane once p <= 0.30
            if (v.isAbortingLaneChange && v.laneChangeProgress <= 0.30) {
              return false;
            }
            // If changing into lane l, physical footprint enters lane l once p > 0.30
            return v.laneChangeProgress > 0.30;
          }
          return false;
        })
        .sort((a, b) => a.x - b.x);

      // Iterate from downstream leader to upstream follower so backwards clamp cascades correctly
      for (let i = laneCars.length - 2; i >= 0; i--) {
        const follower = laneCars[i];
        const leader = laneCars[i + 1];
        const maxFollowerX = leader.x - leader.profile.length;
        if (follower.x > maxFollowerX) {
          follower.x = maxFollowerX;
          follower.v = Math.min(follower.v, Math.max(0, leader.v));
        }
      }
    }


    // 6.2 Speeder Overtaking Telemetry Tracking
    for (const v of this.vehicles) {
      if (v.type === 'speeder' || v.personality === 'speeder') {
        let overtakenSet = this.speederOvertakenMap.get(v.id);
        if (!overtakenSet) {
          overtakenSet = new Set<number>();
          this.speederOvertakenMap.set(v.id, overtakenSet);
        }
        for (const other of this.vehicles) {
          if (other.id !== v.id && other.x < v.x && !overtakenSet.has(other.id)) {
            overtakenSet.add(other.id);
            v.overtakeCount = (v.overtakeCount ?? 0) + 1;
          }
        }
      }
    }

    // 7. Despawn vehicles past road end
    this.vehicles = this.vehicles.filter((v) => v.x <= this.road.length);
    const activeIds = new Set(this.vehicles.map((v) => v.id));
    for (const id of this.speederOvertakenMap.keys()) {
      if (!activeIds.has(id)) {
        this.speederOvertakenMap.delete(id);
      }
    }

    // 8. Analytics update
    this.analytics.update(this.time, this.vehicles, this.road);
  }

  /**
   * Returns lane flow distribution weights.
   * On real 3-lane freeways: middle lane carries ~36%, inner/outer carry ~32%.
   */
  private getLaneFlowWeights(): number[] {
    const n = this.road.numLanes;
    if (n === 3) return [0.32, 0.36, 0.32];
    if (n === 2) return [0.48, 0.52];
    return new Array(n).fill(1 / n);
  }

  /**
   * Initializes per-lane stochastic countdown timers with desynchronized phases.
   */
  private initSpawnTimers(): void {
    this.spawnCountdowns = [];
    for (let lane = 0; lane < this.road.numLanes; lane++) {
      const headway = this.sampleShiftedExpHeadway(lane);
      // Desynchronize starting phases across lanes uniformly over the headway interval
      this.spawnCountdowns.push(Math.random() * headway);
    }
    this.onRampCountdown = 0.5 + Math.random() * 2.5;
  }

  /**
   * Samples a stochastic time headway h (sec) using Shifted Exponential distribution (Cowan M3 / Poisson inflow).
   * E[h] = 3600 / Q_lane, guaranteeing expected macroscopic inflow matches params.inflowVehPerHour.
   */
  private sampleShiftedExpHeadway(lane: number): number {
    const weights = this.getLaneFlowWeights();
    const laneWeight = weights[lane] ?? (1 / this.road.numLanes);
    const hourlyFlow = Math.max(100, this.params.inflowVehPerHour * laneWeight);
    const meanHeadway = 3600 / hourlyFlow; // e.g. 3.6s for 1000 veh/h

    // Minimum physical bumper-to-bumper headway h_min (typically 1.2s - 1.5s)
    const minHeadway = Math.min(1.4, Math.max(0.8, meanHeadway * 0.4));
    const expMean = Math.max(0.4, meanHeadway - minHeadway);

    // Inverse transform sampling for Exp(1/expMean): -expMean * ln(U)
    const u = Math.max(0.005, Math.min(0.995, Math.random()));
    const expHeadway = -expMean * Math.log(u);

    return minHeadway + expHeadway;
  }

  /**
   * Multi-lane highway regulation: Large trucks are restricted from the innermost passing lane.
   */
  private getLaneTruckProbability(lane: number): number {
    const overallTruckPct = this.params.truckPercentage;
    if (overallTruckPct <= 0) return 0;

    const numLanes = this.road.numLanes;
    if (numLanes >= 3) {
      if (lane === 0) {
        // Innermost fast / passing lane: 0% heavy trucks
        return 0;
      } else if (lane === 1) {
        // Middle cruising lane: moderate truck presence
        return overallTruckPct * 0.75;
      } else {
        // Outermost slow / freight lane: higher truck proportion to balance overall fleet mix
        const weights = this.getLaneFlowWeights();
        const midPct = overallTruckPct * 0.75;
        const outerPct = (overallTruckPct - weights[1] * midPct) / weights[2];
        return Math.min(65, Math.max(0, outerPct));
      }
    } else if (numLanes === 2) {
      if (lane === 0) return overallTruckPct * 0.25;
      return Math.min(65, overallTruckPct * 1.75);
    }
    return overallTruckPct;
  }

  /**
   * Evaluates dynamic entry conditions and speed harmonization for spawning at x=0.
   * If congested downstream, decreases spatial gap requirements and adapts entry speed to leaderV,
   * preserving inflow throughput without causing rear-end collisions or emergency braking.
   */
  private evaluateEntryConditions(
    egoProfile: DriverProfile,
    leader: Vehicle | null
  ): { canSpawn: boolean; entrySpeed: number } {
    const desiredSpeed = Math.min(egoProfile.desiredSpeed, (this.params.speedLimitKmh / 3.6) * 1.05);

    if (!leader) {
      // Completely clear road ahead: free-flow entry
      const freeSpeed = desiredSpeed * (0.94 + Math.random() * 0.08);
      return { canSpawn: true, entrySpeed: freeSpeed };
    }

    // Physical gap from x=0 (new vehicle front) to leader rear bumper
    const leaderRearX = leader.x - leader.profile.length;
    const gapS = leaderRearX; // Since x_new = 0, distance to rear bumper is leaderRearX
    const leaderV = Math.max(0, leader.v);

    // Dynamic minimum safe clearance gap:
    // Fast flow (e.g. 28 m/s = 100 km/h): minClearanceS ≈ 2.0 + 28*0.6 ≈ 18.8m
    // Congested (e.g. 5 m/s = 18 km/h): minClearanceS ≈ 2.0 + 5*0.6 ≈ 5.0m
    // Standstill queue (leaderV ≈ 0): minClearanceS = 2.0m (jam clearance s0)
    const minClearanceS = egoProfile.minGap + leaderV * 0.6;

    if (gapS < minClearanceS) {
      // Entrance physically blocked (gap too tight or leader stopped right at entrance)
      return { canSpawn: false, entrySpeed: 0 };
    }

    // Road has space: compute harmonized entry speed
    // 1. Far downstream leader (> 80m): negligible effect on entry
    if (gapS >= 80) {
      const freeSpeed = desiredSpeed * (0.94 + Math.random() * 0.08);
      return { canSpawn: true, entrySpeed: freeSpeed };
    }

    // 2. Downstream leader within 80m:
    // Kinematic comfortable braking bound: v_kinematic = sqrt(v_lead^2 + 2 * b_comf * (gapS - minGap))
    const bComf = 1.6; // Comfortable deceleration budget
    const usableGap = Math.max(0, gapS - egoProfile.minGap);
    const kinematicSafeSpeed = Math.sqrt(leaderV * leaderV + 2 * bComf * usableGap);

    let harmonizedSpeed = Math.min(desiredSpeed, kinematicSafeSpeed);

    // If congested downstream (leaderV < 16 m/s ≈ 58 km/h):
    if (leaderV < 16.0) {
      const gapBuffer = gapS - minClearanceS;
      if (gapBuffer < 8.0) {
        // Tight queue: match leader speed closely to prevent IDM shockwave
        harmonizedSpeed = Math.min(harmonizedSpeed, leaderV * (0.92 + Math.random() * 0.08));
      } else {
        // Moderate gap: allow gentle catch-up velocity (at most +1.2 m/s)
        harmonizedSpeed = Math.min(harmonizedSpeed, leaderV + Math.min(1.2, gapBuffer * 0.08));
      }
    }

    // If queue is stopped / crawling (leaderV < 0.5 m/s):
    if (leaderV < 0.5) {
      harmonizedSpeed = gapS > 10 ? Math.min(harmonizedSpeed, 2.0) : 0;
    }

    return { canSpawn: true, entrySpeed: Math.max(0, harmonizedSpeed) };
  }

  /**
   * Stochastic, desynchronized vehicle generation across mainline lanes.
   * Dynamically adapts entry speed and decreases gap requirements when congested downstream.
   */
  private spawnMainlineVehicles(dt: number): void {
    if (this.spawnCountdowns.length !== this.road.numLanes) {
      this.initSpawnTimers();
    }

    for (let lane = 0; lane < this.road.numLanes; lane++) {
      this.spawnCountdowns[lane] -= dt;

      if (this.spawnCountdowns[lane] <= 0) {
        // Downstream entry clearance check on this lane
        const downstream = this.vehicles
          .filter((v) => v.currentLane === lane && v.x < 120)
          .sort((a, b) => a.x - b.x);
        const leader = downstream[0];

        const truckProb = this.getLaneTruckProbability(lane);
        const isTruck = Math.random() * 100 < truckProb;
        const isAcc = !isTruck && Math.random() * 100 < this.params.accPercentage;
        const type: VehicleType = isTruck ? 'truck' : isAcc ? 'acc' : 'car';
        const { profile, personality } = createDriverProfile(type);

        // Dynamically evaluate if entry is safe and compute harmonized entry speed
        const { canSpawn, entrySpeed } = this.evaluateEntryConditions(profile, leader);

        if (canSpawn) {
          this.vehicles.push({
            id: this.nextVehicleId++,
            type,
            profile,
            personality,
            x: 0,
            y: lane,
            currentLane: lane,
            targetLane: lane,
            laneChangeProgress: 0,
            laneChangeCooldown: 2.0 + Math.random() * 2.0,
            v: entrySpeed,
            a: 0,
            isBraking: false,
            color: this.getVehicleColor(type),
          });

          // Schedule next stochastic arrival for this lane independently
          this.spawnCountdowns[lane] = this.sampleShiftedExpHeadway(lane);
        } else {
          // Entrance blocked by slow-moving queue: brief jitter retry before rechecking
          this.spawnCountdowns[lane] = 0.3 + Math.random() * 0.3;
        }
      }
    }
  }

  /**
   * Stochastic on-ramp vehicle arrivals with ramp metering coordination and speed adaptation.
   */
  private spawnOnRampVehicles(dt: number): void {
    if (!this.road.onRamp || !this.road.onRamp.active) return;
    const targetLane = this.road.numLanes - 1; // Merges into right lane

    this.onRampCountdown -= dt;
    if (this.onRampCountdown <= 0) {
      // Ramp metering reduces effective inflow and enforces minimum metered headway
      const effectiveRampFlow = this.params.rampMeteringActive
        ? Math.min(450, this.road.onRamp.flowVehPerHour * 0.5)
        : this.road.onRamp.flowVehPerHour;

      const meanHeadway = 3600 / Math.max(100, effectiveRampFlow);
      const minHeadway = this.params.rampMeteringActive ? 3.5 : 1.4;
      const expMean = Math.max(0.4, meanHeadway - minHeadway);
      const u = Math.max(0.005, Math.min(0.995, Math.random()));
      const nextDelay = this.params.rampMeteringActive
        ? minHeadway + Math.random() * 0.6 // Metering: metronomic release
        : minHeadway - expMean * Math.log(u); // Unmetered: stochastic Poisson release

      const mergeX = this.road.onRamp.start;
      const mainlineCars = this.vehicles.filter((v) => v.currentLane === targetLane);
      const leader = mainlineCars.filter((v) => v.x > mergeX).sort((a, b) => a.x - b.x)[0];
      const follower = mainlineCars.filter((v) => v.x <= mergeX).sort((a, b) => b.x - a.x)[0];

      // Dynamic gap checks
      const leaderV = leader ? Math.max(0, leader.v) : 20.0;
      const followerV = follower ? Math.max(0, follower.v) : 20.0;

      const minLeaderGap = leader ? leader.profile.length + 2.0 + leaderV * 0.5 : 10;
      const minFollowerGap = follower ? DEFAULT_CAR_PROFILE.length + 2.0 + followerV * 0.4 : 10;

      const isLeaderClear = !leader || (leader.x - mergeX) >= minLeaderGap;
      const isFollowerClear = !follower || (mergeX - follower.x) >= minFollowerGap;

      if (isLeaderClear && isFollowerClear) {
        const { profile } = createDriverProfile('car', 'aggressive');

        // Adapt merging speed to mainline traffic flow
        let mergeSpeed = 18.0 + (Math.random() * 2 - 1); // ~65 km/h nominal
        if (leader && leader.x - mergeX < 50) {
          mergeSpeed = Math.min(mergeSpeed, Math.max(4.0, leaderV * 0.95));
        } else if (follower && mergeX - follower.x < 40) {
          mergeSpeed = Math.min(mergeSpeed, Math.max(4.0, followerV * 1.05));
        }

        this.vehicles.push({
          id: this.nextVehicleId++,
          type: 'car',
          profile: { ...profile, politeness: 0.12 }, // Ramping cars are assertive
          personality: 'aggressive',
          x: mergeX,
          y: targetLane,
          currentLane: targetLane,
          targetLane,
          laneChangeProgress: 0,
          laneChangeCooldown: 3.5,
          v: mergeSpeed,
          a: 0.5,
          isBraking: false,
          color: '#38bdf8',
        });
        this.onRampCountdown = nextDelay;
      } else {
        this.onRampCountdown = 0.4 + Math.random() * 0.3;
      }
    }
  }


  /**
   * Trigger Phantom Jam: causes a vehicle at around 1200m to brake suddenly.
   */
  public triggerPhantomBrake(): boolean {
    const candidate = this.vehicles
      .filter((v) => v.x > 800 && v.x < 1500 && v.v > 15)
      .sort((a, b) => Math.abs(a.x - 1100) - Math.abs(b.x - 1100))[0];

    if (candidate) {
      candidate.v = Math.max(3, candidate.v - 15); // Drop speed abruptly
      candidate.a = -5.0;
      candidate.isBraking = true;
      return true;
    }
    return false;
  }

  /**
   * Trigger an accident or clear it.
   */
  public toggleIncident(): boolean {
    if (this.accidentVehicleId !== null) {
      // Clear incident
      const v = this.vehicles.find((veh) => veh.id === this.accidentVehicleId);
      if (v) {
        v.hasIncident = false;
        v.isBraking = false;
        v.color = this.getVehicleColor(v.type);
      }
      this.accidentVehicleId = null;
      return false; // Incident is now off
    } else {
      // Create incident at lane 1, x = 1400m
      const candidate = this.vehicles
        .filter((v) => v.currentLane === 1 && v.x > 1200 && v.x < 1600)
        .sort((a, b) => Math.abs(a.x - 1400) - Math.abs(b.x - 1400))[0];

      if (candidate) {
        candidate.hasIncident = true;
        candidate.v = 0;
        candidate.a = 0;
        candidate.isBraking = true;
        candidate.color = '#dc2626'; // Dark red
        this.accidentVehicleId = candidate.id;
        return true; // Incident is now on
      }
      return false;
    }
  }

  public getDiagnosis(): CongestionDiagnosis {
    return this.analytics.getDiagnosis(
      this.time,
      this.vehicles,
      this.road,
      this.params.inflowVehPerHour
    );
  }

  public getTrajectories(): TrajectoryPoint[] {
    return this.analytics.getHistory();
  }

  public getDetectorReadings(): DetectorReading[] {
    return this.analytics.getDetectorReadings();
  }

  public hasActiveIncident(): boolean {
    return this.accidentVehicleId !== null;
  }

  public getVehicleTelemetry(vehicleId: number): VehicleTelemetry | null {
    const ego = this.vehicles.find((v) => v.id === vehicleId);
    if (!ego) return null;

    const vehiclesOnLane = this.vehicles.filter((v) => v.currentLane === ego.currentLane);
    const { leader, follower } = findNeighbors(ego.x, vehiclesOnLane, ego.id);

    let actualGapMeters: number | null = null;
    let desiredGapMeters: number | null = null;
    let relativeClosingSpeedKmh: number | null = null;

    if (leader) {
      actualGapMeters = Math.max(0, leader.x - leader.profile.length - ego.x);
      const deltaV = ego.v - leader.v;
      relativeClosingSpeedKmh = deltaV * 3.6;

      // IDM desired dynamic gap s*(v, deltaV)
      const p = ego.profile;
      const sStar =
        p.minGap +
        Math.max(
          0,
          ego.v * p.timeHeadway + (ego.v * deltaV) / (2 * Math.sqrt(Math.max(0.1, p.maxAccel * p.comfortDecel)))
        );
      desiredGapMeters = Math.max(p.minGap, sStar);
    }

    let statusLabel = '🟢 自由流定速巡航';
    if (ego.hasIncident) {
      statusLabel = '⚠️ 突發事故停止中';
    } else if (ego.v * 3.6 < 15) {
      statusLabel = '🔴 嚴重壅塞排隊停滯';
    } else if (ego.isAbortingLaneChange) {
      statusLabel = `↩️ 換道中止！避險退回原車道 (車道 ${ego.currentLane + 1})`;
    } else if (ego.laneChangeProgress > 0) {
      statusLabel = `🔄 換道中 (車道 ${ego.currentLane + 1} ➔ ${ego.targetLane + 1})`;
    } else if (ego.a < -2.5) {
      statusLabel = '🚨 緊急煞車減速中';
    } else if (ego.a < -0.3) {
      statusLabel = '🟡 跟車適應中 (緩慢減速)';
    } else if (ego.a > 0.5) {
      statusLabel = '⚡ 巡航加速前進中';
    }

    let personalityLabel = '🚗 標準順流型 (均衡時距)';
    if (ego.type === 'speeder' || ego.personality === 'speeder') {
      personalityLabel = '🏎️ 狂飆超速超車狂 (頻繁穿梭超車 / 激進壓迫)';
      if (ego.laneChangeProgress > 0) {
        statusLabel = `⚡ 穿梭強切超車中 (車道 ${ego.currentLane + 1} ➔ ${ego.targetLane + 1})`;
      } else if (ego.v * 3.6 > this.road.speedLimitKmh) {
        statusLabel = `🚀 極速超速狂飆中 (${Math.round(ego.v * 3.6)} km/h)`;
      }
    } else if (ego.type === 'truck') {
      personalityLabel = '🚚 重型大貨車 (加減速慢 / 長安全時距)';
    } else if (ego.type === 'acc') {
      personalityLabel = '🤖 ACC 智慧車 (主動消波 / 平滑雷達)';
    } else if (ego.personality === 'aggressive') {
      personalityLabel = '⚡ 積極超車型 (想開快 / 貼前車近 / 積極超車)';
    } else if (ego.personality === 'cautious') {
      personalityLabel = '🛡️ 謹慎防禦型 (想開慢 / 離前車遠 / 守序巡航)';
    }

    const speedingPct = Math.round(((ego.v * 3.6 - this.road.speedLimitKmh) / this.road.speedLimitKmh) * 100);

    return {
      vehicle: ego,
      leader,
      follower,
      actualGapMeters,
      desiredGapMeters,
      speedKmh: ego.v * 3.6,
      desiredSpeedKmh: ego.profile.desiredSpeed * 3.6,
      acceleration: ego.a,
      timeHeadwaySec: ego.profile.timeHeadway,
      relativeClosingSpeedKmh,
      statusLabel,
      personalityLabel,
      overtakeCount: ego.overtakeCount ?? 0,
      inducedBrakesCount: ego.inducedBrakesCount ?? 0,
      speedingPct,
    };
  }

  /**
   * Manually spawns an aggressive speeding vehicle (Speeder / Chronic Overtaker)
   * that drives at 145-160 km/h, tailgates closely, and continually weaves between lanes.
   */
  public spawnSpeeder(preferredLane?: number): Vehicle {
    let lane = preferredLane;
    if (lane === undefined) {
      let maxGap = -1;
      let bestL = 0;
      for (let l = 0; l < this.road.numLanes; l++) {
        const laneVehicles = this.vehicles.filter((v) => v.currentLane === l).sort((a, b) => a.x - b.x);
        const firstCar = laneVehicles[0];
        const gap = firstCar ? firstCar.x - firstCar.profile.length : 9999;
        if (gap > maxGap) {
          maxGap = gap;
          bestL = l;
        }
      }
      lane = bestL;
    }

    const profile = createSpeederProfile();
    const id = this.nextVehicleId++;
    const speeder: Vehicle = {
      id,
      type: 'speeder',
      profile,
      personality: 'speeder',
      x: 0,
      y: lane,
      currentLane: lane,
      targetLane: lane,
      laneChangeProgress: 0,
      laneChangeCooldown: 0.5,
      v: profile.desiredSpeed * 0.95, // Spawns already at ~145-155 km/h
      a: profile.maxAccel * 0.5,
      isBraking: false,
      color: '#f43f5e',
      overtakeCount: 0,
      inducedBrakesCount: 0,
    };

    this.vehicles.push(speeder);
    this.speederOvertakenMap.set(id, new Set<number>());
    return speeder;
  }


  public induceVehicleBrake(vehicleId: number): boolean {
    const v = this.vehicles.find((veh) => veh.id === vehicleId);
    if (v) {
      v.v = Math.max(0, v.v * 0.35); // Sharp speed reduction
      v.a = -4.5;
      v.isBraking = true;
      return true;
    }
    return false;
  }

  private getEffectiveLeader(ego: Vehicle, leader: Vehicle | null, laneIndex: number): Vehicle | null {
    const laneConfig = this.road.lanes[laneIndex];
    if (laneConfig && laneConfig.dropEnd !== undefined && ego.x < laneConfig.dropEnd) {
      if (!leader || leader.x > laneConfig.dropEnd) {
        return {
          id: -999,
          type: 'car',
          profile: { ...DEFAULT_CAR_PROFILE, length: 0 },
          x: laneConfig.dropEnd,
          y: laneIndex,
          currentLane: laneIndex,
          targetLane: laneIndex,
          laneChangeProgress: 0,
          laneChangeCooldown: 0,
          v: 0,
          a: 0,
          isBraking: false,
          color: '#ef4444',
        };
      }
    }
    return leader;
  }


  private getVehicleColor(type: VehicleType): string {
    switch (type) {
      case 'speeder':
        return '#f43f5e'; // Hot neon rose / racing magenta
      case 'truck':
        return '#f59e0b'; // Amber
      case 'acc':
        return '#06b6d4'; // Cyan
      case 'car':
      default:
        return '#3b82f6'; // Blue
    }
  }
}
