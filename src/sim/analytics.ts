import { Vehicle, RoadConfig, CongestionDiagnosis, TrajectoryPoint, DetectorReading } from './types';
import { SIM_CONSTANTS } from './constants';

export class TrafficAnalytics {
  private history: TrajectoryPoint[] = [];
  private maxHistorySeconds = 180; // Retain 3 minutes for space-time diagram
  private lastRecordTime = 0;
  private recordInterval = 0.5; // Record trajectories every 0.5s

  // Historical tail positions for measuring shockwave speed
  private tailHistory: { time: number; x: number }[] = [];

  // Passage count arrays for virtual detectors [upstream, bottleneck, downstream]
  private detectorLocations = [
    { x: 400, label: '上游暢通段 (400m)' },
    { x: 1250, label: '瓶頸匯流段 (1250m)' },
    { x: 2000, label: '下游消散段 (2000m)' },
  ];
  private detectorPassages: { time: number; speedKmh: number; x: number }[] = [];

  public update(time: number, vehicles: Vehicle[], road: RoadConfig): void {
    // 1. Record Space-Time points periodically
    if (time - this.lastRecordTime >= this.recordInterval) {
      this.lastRecordTime = time;
      for (const v of vehicles) {
        this.history.push({
          time,
          x: v.x,
          lane: v.currentLane,
          speedKmh: v.v * 3.6,
          vehicleId: v.id,
          type: v.type,
        });
      }

      // Evict old trajectory points efficiently in a single operation
      const cutoff = time - this.maxHistorySeconds;
      let evictCount = 0;
      while (evictCount < this.history.length && this.history[evictCount].time < cutoff) {
        evictCount++;
      }
      if (evictCount > 0) {
        this.history.splice(0, evictCount);
      }
    }

    // 2. Virtual Detector passage recording
    for (const v of vehicles) {
      for (const det of this.detectorLocations) {
        // If vehicle just crossed the detector line in last step (v.x - v.v*dt < det.x <= v.x)
        const prevX = v.x - v.v * SIM_CONSTANTS.DT;
        if (prevX < det.x && v.x >= det.x) {
          this.detectorPassages.push({
            time,
            speedKmh: v.v * 3.6,
            x: det.x,
          });
        }
      }
    }

    // Clean detector passages older than 60s
    const detCutoff = time - 60;
    this.detectorPassages = this.detectorPassages.filter((p) => p.time >= detCutoff);
  }

  public getDiagnosis(time: number, vehicles: Vehicle[], road: RoadConfig, inflowVehPerHour: number): CongestionDiagnosis {
    if (vehicles.length === 0) {
      return this.emptyDiagnosis(inflowVehPerHour);
    }

    // Filter slow vehicles (< 40 km/h)
    const slowVehicles = vehicles
      .filter((v) => v.v * 3.6 < SIM_CONSTANTS.CRITICAL_SPEED_KMH)
      .sort((a, b) => a.x - b.x);

    const isCongested = slowVehicles.length >= 6; // Cluster threshold

    let queueTailMeters: number | null = null;
    let queueHeadMeters: number | null = null;
    let queueLengthMeters = 0;
    let shockwaveSpeedKmh = 0;
    let excessVehicles = 0;

    if (isCongested) {
      queueTailMeters = slowVehicles[0].x; // Furthest upstream
      queueHeadMeters = slowVehicles[slowVehicles.length - 1].x; // Furthest downstream
      queueLengthMeters = Math.max(0, queueHeadMeters - queueTailMeters);

      // Record tail for shockwave speed measurement
      this.tailHistory.push({ time, x: queueTailMeters });
      const tailCutoff = time - 15;
      while (this.tailHistory.length > 0 && this.tailHistory[0].time < tailCutoff) {
        this.tailHistory.shift();
      }

      if (this.tailHistory.length >= 2) {
        const oldest = this.tailHistory[0];
        const dt = time - oldest.time;
        if (dt > 2.0) {
          // w = dx / dt in km/h. Negative means propagating upstream!
          shockwaveSpeedKmh = ((queueTailMeters - oldest.x) / dt) * 3.6;
        }
      }

      // Calculate excess vehicles (delay accumulation)
      // N_excess = sum( 1 - v / v_desired )
      for (const v of slowVehicles) {
        excessVehicles += Math.max(0, 1 - (v.v * 3.6) / 100);
      }
    } else {
      this.tailHistory = [];
    }

    // Capacity calculation
    // Open lanes at bottleneck
    const openBottleneckLanes = road.lanes.filter((l) => l.isOpen && (!l.dropEnd || l.dropEnd > 1400)).length;
    const preBreakdownCapacity = openBottleneckLanes * SIM_CONSTANTS.PRE_BREAKDOWN_CAPACITY_PER_LANE;
    const dischargeCapacity = isCongested
      ? preBreakdownCapacity * (1 - SIM_CONSTANTS.CAPACITY_DROP)
      : preBreakdownCapacity;

    // Time to clear estimation: T_clear = N_excess / (Q_discharge - q_in)
    let estimatedClearSeconds: number | null = null;
    if (isCongested && excessVehicles > 0) {
      const netDischargePerHour = dischargeCapacity - inflowVehPerHour;
      if (netDischargePerHour > 100) {
        estimatedClearSeconds = Math.round((excessVehicles / netDischargePerHour) * 3600);
      } else {
        // Queue will grow or maintain indefinitely
        estimatedClearSeconds = null;
      }
    }

    // Average speed & density
    let totalSpeed = 0;
    for (const v of vehicles) {
      totalSpeed += v.v * 3.6;
    }
    const avgSpeedKmh = Math.round(totalSpeed / vehicles.length);
    const densityVehPerKmPerLane = Math.round(
      (vehicles.length / (road.length / 1000)) / road.lanes.length
    );

    let state: 'free' | 'meta_stable' | 'congested' = 'free';
    let cause = '車流暢通，供需平衡';

    if (isCongested) {
      state = 'congested';
      if (road.onRamp?.active && queueHeadMeters && Math.abs(queueHeadMeters - road.onRamp.start) < 400) {
        cause = '匝道高流量匯入引發車流交織崩潰';
      } else if (road.lanes.some((l) => l.dropEnd && queueHeadMeters && Math.abs(queueHeadMeters - l.dropEnd) < 300)) {
        cause = '車道縮減造成斷面通行容量不足';
      } else if (vehicles.some((v) => v.hasIncident)) {
        cause = '突發事故造成單線封閉';
      } else {
        cause = '高密度車流觸發幽靈煞車連鎖波 (String Instability)';
      }
    } else if (densityVehPerKmPerLane > 25) {
      state = 'meta_stable';
      cause = '密度已接近臨界值 (k_c)，微小干擾將引發塞車';
    }

    return {
      isCongested,
      state,
      severity: Math.min(100, Math.round((slowVehicles.length / Math.max(1, vehicles.length)) * 100)),
      cause,
      queueHeadMeters: queueHeadMeters !== null ? Math.round(queueHeadMeters) : null,
      queueTailMeters: queueTailMeters !== null ? Math.round(queueTailMeters) : null,
      queueLengthMeters: Math.round(queueLengthMeters),
      shockwaveSpeedKmh: Math.round(shockwaveSpeedKmh * 10) / 10,
      excessVehicles: Math.round(excessVehicles),
      inflowRateVehPerHour: inflowVehPerHour,
      dischargeCapacityVehPerHour: Math.round(dischargeCapacity),
      capacityDropPercent: Math.round(SIM_CONSTANTS.CAPACITY_DROP * 100),
      estimatedClearSeconds,
      avgSpeedKmh,
      densityVehPerKmPerLane,
    };
  }

  public getDetectorReadings(): DetectorReading[] {
    const results: DetectorReading[] = [];
    const windowSec = 30; // 30-second moving average

    for (const det of this.detectorLocations) {
      const passages = this.detectorPassages.filter((p) => Math.abs(p.x - det.x) < 5);
      const count = passages.length;

      // Flow q = (count / windowSec) * 3600 (veh/h)
      const flowVehPerHour = Math.round((count / windowSec) * 3600);

      let meanSpeed = 95;
      if (passages.length > 0) {
        // Harmonic mean speed
        let invSpeedSum = 0;
        for (const p of passages) {
          invSpeedSum += 1 / Math.max(1, p.speedKmh);
        }
        meanSpeed = Math.round(passages.length / invSpeedSum);
      }

      // Density k = q / v
      const densityVehPerKm = Math.round(flowVehPerHour / Math.max(10, meanSpeed));

      results.push({
        x: det.x,
        label: det.label,
        flowVehPerHour,
        densityVehPerKm,
        speedKmh: meanSpeed,
      });
    }

    return results;
  }

  public getHistory(): TrajectoryPoint[] {
    return this.history;
  }

  public reset(): void {
    this.history = [];
    this.tailHistory = [];
    this.detectorPassages = [];
    this.lastRecordTime = 0;
  }

  private emptyDiagnosis(inflowVehPerHour: number): CongestionDiagnosis {
    return {
      isCongested: false,
      state: 'free',
      severity: 0,
      cause: '目前尚無車輛',
      queueHeadMeters: null,
      queueTailMeters: null,
      queueLengthMeters: 0,
      shockwaveSpeedKmh: 0,
      excessVehicles: 0,
      inflowRateVehPerHour: inflowVehPerHour,
      dischargeCapacityVehPerHour: 6000,
      capacityDropPercent: 12,
      estimatedClearSeconds: null,
      avgSpeedKmh: 100,
      densityVehPerKmPerLane: 0,
    };
  }
}
