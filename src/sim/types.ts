export type VehicleType = 'car' | 'truck' | 'acc';

export interface DriverProfile {
  desiredSpeed: number;        // v0 (m/s)
  timeHeadway: number;         // T (s)
  minGap: number;              // s0 (m)
  maxAccel: number;            // a (m/s^2)
  comfortDecel: number;        // b (m/s^2)
  delta: number;               // acceleration exponent (typically 4)
  length: number;              // vehicle length (m)
  width: number;               // vehicle width (m)
  politeness: number;          // MOBIL politeness p
  laneChangeThreshold: number; // MOBIL threshold ath (m/s^2)
  safeDecel: number;           // MOBIL safe deceleration bsafe (m/s^2)
}

export interface Vehicle {
  id: number;
  type: VehicleType;
  profile: DriverProfile;
  x: number;                  // Longitudinal position (meters)
  y: number;                  // Lateral position (lane unit, e.g. 0.0, 1.0)
  targetLane: number;         // Target lane index
  currentLane: number;        // Current lane index
  laneChangeProgress: number; // 0 to 1 during lane change
  laneChangeCooldown: number; // seconds remaining before allowed to change lane again
  v: number;                  // Speed (m/s)
  a: number;                  // Acceleration (m/s^2)
  isBraking: boolean;         // True if decelerating noticeably
  color: string;
  hasIncident?: boolean;      // True if vehicle is stopped (e.g. accident)
}

export interface Lane {
  index: number;
  isOpen: boolean;
  dropStart?: number;         // If lane drops, where merge begins
  dropEnd?: number;           // Where lane physically ends
}

export interface RoadConfig {
  length: number;             // Total road length in meters (e.g. 2000m)
  numLanes: number;           // Number of main lanes (e.g. 3)
  speedLimitKmh: number;      // Speed limit (km/h)
  lanes: Lane[];
  onRamp?: {
    start: number;            // On-ramp merge start (meters)
    end: number;              // On-ramp merge end (meters)
    flowVehPerHour: number;   // Inflow rate on ramp
    active: boolean;          // Whether on-ramp is open
  };
}

export type ScenarioType = 'lane_drop' | 'on_ramp' | 'phantom_jam' | 'accident';

export interface CongestionDiagnosis {
  isCongested: boolean;
  state: 'free' | 'meta_stable' | 'congested';
  severity: number;           // 0 to 100%
  cause: string;
  queueHeadMeters: number | null; // Downstream boundary (head)
  queueTailMeters: number | null; // Upstream boundary (tail)
  queueLengthMeters: number;
  shockwaveSpeedKmh: number;      // Negative = propagating upstream
  excessVehicles: number;         // Accumulated delay vehicles
  inflowRateVehPerHour: number;
  dischargeCapacityVehPerHour: number;
  capacityDropPercent: number;    // Typically 10% - 15%
  estimatedClearSeconds: number | null; // null if queue is growing or no queue
  avgSpeedKmh: number;
  densityVehPerKmPerLane: number;
}

export interface TrajectoryPoint {
  time: number;               // Simulation time (s)
  x: number;                  // Position (m)
  lane: number;
  speedKmh: number;
  vehicleId: number;
  type: VehicleType;
}

export interface DetectorReading {
  x: number;                  // Location (m)
  label: string;
  flowVehPerHour: number;     // q
  densityVehPerKm: number;    // k
  speedKmh: number;           // v
}
