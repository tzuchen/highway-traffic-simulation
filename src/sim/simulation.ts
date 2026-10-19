import { Vehicle, RoadConfig, VehicleType, ScenarioType, CongestionDiagnosis, TrajectoryPoint, DetectorReading } from './types';
import { SIM_CONSTANTS, DEFAULT_CAR_PROFILE, DEFAULT_TRUCK_PROFILE, DEFAULT_ACC_PROFILE } from './constants';
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
  public road: RoadConfig;
  public scenarioType: ScenarioType = 'lane_drop';
  public vehicles: Vehicle[] = [];
  public params: SimulationParams;
  public analytics = new TrafficAnalytics();

  private nextVehicleId = 1;
  private spawnAccumulators: number[] = []; // Sub-second spawn trackers per lane
  private onRampAccumulator = 0;
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

    this.spawnAccumulators = new Array(this.road.numLanes).fill(0);
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
    this.spawnAccumulators = new Array(this.road.numLanes).fill(0);
    this.onRampAccumulator = 0;
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
      for (let x = 100; x < this.road.length - 200; x += spacing + (Math.random() * 20 - 10)) {
        // Skip dropping lane downstream
        if (this.road.lanes[lane].dropStart && x > this.road.lanes[lane].dropStart!) continue;

        const isTruck = Math.random() * 100 < this.params.truckPercentage;
        const isAcc = !isTruck && Math.random() * 100 < this.params.accPercentage;
        const type: VehicleType = isTruck ? 'truck' : isAcc ? 'acc' : 'car';
        const profile = isTruck ? DEFAULT_TRUCK_PROFILE : isAcc ? DEFAULT_ACC_PROFILE : DEFAULT_CAR_PROFILE;

        this.vehicles.push({
          id: this.nextVehicleId++,
          type,
          profile: { ...profile, desiredSpeed: profile.desiredSpeed * (0.95 + Math.random() * 0.1) },
          x,
          y: lane,
          currentLane: lane,
          targetLane: lane,
          laneChangeProgress: 0,
          laneChangeCooldown: 1.0 + Math.random() * 2,
          v: (85 / 3.6) + Math.random() * 4,
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

    // 3. Partition vehicles by current lane for fast spatial queries
    const vehiclesByLane: Vehicle[][] = Array.from({ length: this.road.numLanes }, () => []);
    for (const v of this.vehicles) {
      if (v.currentLane >= 0 && v.currentLane < this.road.numLanes) {
        vehiclesByLane[v.currentLane].push(v);
      }
    }
    for (let l = 0; l < this.road.numLanes; l++) {
      vehiclesByLane[l].sort((a, b) => a.x - b.x);
    }

    // 4. MOBIL Lane-Changing Evaluation
    for (const v of this.vehicles) {
      if (v.laneChangeCooldown > 0) {
        v.laneChangeCooldown = Math.max(0, v.laneChangeCooldown - dt);
      }

      // If already in middle of changing lanes, update lateral animation
      if (v.laneChangeProgress > 0) {
        v.laneChangeProgress = Math.min(1.0, v.laneChangeProgress + dt / SIM_CONSTANTS.LANE_CHANGE_DURATION);
        v.y = v.currentLane + (v.targetLane - v.currentLane) * v.laneChangeProgress;

        if (v.laneChangeProgress >= 1.0) {
          // Completed lane change
          v.currentLane = v.targetLane;
          v.laneChangeProgress = 0;
          v.y = v.currentLane;
          v.laneChangeCooldown = SIM_CONSTANTS.LANE_CHANGE_COOLDOWN;
        }
      } else {
        // Evaluate new lane change
        const decision = evaluateLaneChange(v, this.road, vehiclesByLane);
        if (decision) {
          v.targetLane = decision.targetLane;
          v.laneChangeProgress = 0.01;
        }
      }
    }

    // 5. Calculate IDM Accelerations (synchronous snapshot)
    const effectiveSpeedLimit = this.params.variableSpeedLimitActive
      ? Math.min(this.params.speedLimitKmh, 60) // Harmonize to 60 km/h upstream
      : this.params.speedLimitKmh;

    const plannedAccelerations = new Map<number, number>();
    for (const v of this.vehicles) {
      if (v.hasIncident) {
        plannedAccelerations.set(v.id, 0);
        continue;
      }

      const laneList = vehiclesByLane[v.targetLane !== v.currentLane && v.laneChangeProgress > 0.5 ? v.targetLane : v.currentLane] || [];
      const { leader } = findNeighbors(v.x, laneList, v.id);

      // Bottleneck lane closure virtual barrier leader
      let effectiveLeader = leader;
      const curLaneConfig = this.road.lanes[v.currentLane];
      if (curLaneConfig && curLaneConfig.dropEnd !== undefined && v.x < curLaneConfig.dropEnd) {
        const distToDrop = curLaneConfig.dropEnd - v.x;
        // If no leader closer than the barrier, barrier acts as a stopped obstacle
        if (!effectiveLeader || effectiveLeader.x > curLaneConfig.dropEnd) {
          effectiveLeader = {
            id: -999,
            type: 'car',
            profile: { ...DEFAULT_CAR_PROFILE, length: 0 },
            x: curLaneConfig.dropEnd,
            y: v.currentLane,
            currentLane: v.currentLane,
            targetLane: v.currentLane,
            laneChangeProgress: 0,
            laneChangeCooldown: 0,
            v: 0,
            a: 0,
            isBraking: false,
            color: '#ef4444',
          };
        }
      }

      const a = calculateIDMAcceleration(v, effectiveLeader, effectiveSpeedLimit);
      plannedAccelerations.set(v.id, a);
    }

    // 6. Kinematic Update with Ballistic Exact Stopping
    for (const v of this.vehicles) {
      const a = plannedAccelerations.get(v.id) ?? 0;
      updateBallistic(v, a, dt);
    }

    // 7. Despawn vehicles past road end
    this.vehicles = this.vehicles.filter((v) => v.x <= this.road.length);

    // 8. Analytics update
    this.analytics.update(this.time, this.vehicles, this.road);
  }

  private spawnMainlineVehicles(dt: number): void {
    const inflowPerLane = this.params.inflowVehPerHour / this.road.numLanes;
    const spawnProbPerSec = inflowPerLane / 3600;

    for (let lane = 0; lane < this.road.numLanes; lane++) {
      this.spawnAccumulators[lane] += spawnProbPerSec * dt;

      if (this.spawnAccumulators[lane] >= 1.0) {
        this.spawnAccumulators[lane] -= 1.0;

        // Check entry gap safety: no car within 30m of entrance
        const hasBlocker = this.vehicles.some((v) => v.currentLane === lane && v.x < 30);
        if (!hasBlocker) {
          const isTruck = Math.random() * 100 < this.params.truckPercentage;
          const isAcc = !isTruck && Math.random() * 100 < this.params.accPercentage;
          const type: VehicleType = isTruck ? 'truck' : isAcc ? 'acc' : 'car';
          const profile = isTruck ? DEFAULT_TRUCK_PROFILE : isAcc ? DEFAULT_ACC_PROFILE : DEFAULT_CAR_PROFILE;

          this.vehicles.push({
            id: this.nextVehicleId++,
            type,
            profile: { ...profile, desiredSpeed: profile.desiredSpeed * (0.95 + Math.random() * 0.1) },
            x: 0,
            y: lane,
            currentLane: lane,
            targetLane: lane,
            laneChangeProgress: 0,
            laneChangeCooldown: 2.0,
            v: 25.0 + Math.random() * 3, // ~90-100 km/h
            a: 0,
            isBraking: false,
            color: this.getVehicleColor(type),
          });
        }
      }
    }
  }

  private spawnOnRampVehicles(dt: number): void {
    if (!this.road.onRamp) return;
    const targetLane = this.road.numLanes - 1; // Merges into right lane

    // Ramp metering reduces effective inflow by 50%
    const effectiveRampFlow = this.params.rampMeteringActive
      ? Math.min(450, this.road.onRamp.flowVehPerHour * 0.5)
      : this.road.onRamp.flowVehPerHour;

    const probPerSec = effectiveRampFlow / 3600;
    this.onRampAccumulator += probPerSec * dt;

    if (this.onRampAccumulator >= 1.0) {
      this.onRampAccumulator -= 1.0;

      const mergeX = this.road.onRamp.start;
      // Check if merge spot has safe gap
      const hasBlocker = this.vehicles.some(
        (v) => v.currentLane === targetLane && Math.abs(v.x - mergeX) < 25
      );

      if (!hasBlocker) {
        this.vehicles.push({
          id: this.nextVehicleId++,
          type: 'car',
          profile: { ...DEFAULT_CAR_PROFILE, politeness: 0.1 }, // Ramping cars are aggressive
          x: mergeX,
          y: targetLane,
          currentLane: targetLane,
          targetLane,
          laneChangeProgress: 0,
          laneChangeCooldown: 3.0,
          v: 18.0, // Entering at ~65 km/h
          a: 0.5,
          isBraking: false,
          color: '#38bdf8',
        });
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

  private getVehicleColor(type: VehicleType): string {
    switch (type) {
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
