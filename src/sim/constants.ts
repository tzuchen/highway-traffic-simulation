import { DriverProfile, DriverPersonality, VehicleType, Vehicle } from './types';

// Default calibrated driver profiles (Treiber & Kesting, 2013)
export const DEFAULT_CAR_PROFILE: DriverProfile = {
  desiredSpeed: 33.3,         // 120 km/h in m/s
  timeHeadway: 1.4,          // 1.4 seconds safe headway
  minGap: 2.0,               // 2 meters
  maxAccel: 1.4,             // 1.4 m/s^2
  comfortDecel: 2.0,         // 2.0 m/s^2
  delta: 4.0,                // standard acceleration exponent
  length: 4.5,               // 4.5 meters
  width: 1.8,
  politeness: 0.3,           // moderate courtesy
  laneChangeThreshold: 0.2,  // 0.2 m/s^2
  safeDecel: 4.0,            // maximum accepted braking for follower
  personality: 'normal',
};

export const DEFAULT_TRUCK_PROFILE: DriverProfile = {
  desiredSpeed: 23.6,         // 85 km/h in m/s
  timeHeadway: 2.1,          // 2.1 seconds
  minGap: 2.8,
  maxAccel: 0.7,             // heavier, slower acceleration
  comfortDecel: 1.6,
  delta: 4.0,
  length: 12.0,              // 12 meters
  width: 2.5,
  politeness: 0.4,
  laneChangeThreshold: 0.35,
  safeDecel: 3.5,
  personality: 'cautious',
};

export const DEFAULT_ACC_PROFILE: DriverProfile = {
  desiredSpeed: 30.5,         // 110 km/h in m/s
  timeHeadway: 1.2,          // computer-controlled headway
  minGap: 1.6,
  maxAccel: 1.2,
  comfortDecel: 2.2,         // smooth braking
  delta: 4.0,
  length: 4.5,
  width: 1.8,
  politeness: 0.5,           // highly cooperative
  laneChangeThreshold: 0.2,
  safeDecel: 4.5,
  personality: 'normal',
};

// 🏎️ 狂飆超速超車狂 (Speeder / Chronic Overtaker)
export const DEFAULT_SPEEDER_PROFILE: DriverProfile = {
  desiredSpeed: 43.1,         // 155 km/h in m/s (大幅超速)
  timeHeadway: 0.7,          // 0.7s 極端貼背跟車
  minGap: 1.1,               // 1.1m 最小極限淨距
  maxAccel: 3.2,             // 3.2 m/s^2 強悍加速
  comfortDecel: 3.5,
  delta: 4.0,
  length: 4.6,
  width: 1.85,
  politeness: 0.02,          // 幾乎為 0 的極低禮貌度，自私強切
  laneChangeThreshold: 0.04, // 0.04 m/s^2 超車門檻極低，見車即超
  safeDecel: 5.5,            // 允許強插壓迫後車
  personality: 'speeder',
};

export function createSpeederProfile(): DriverProfile {
  const desiredKmh = 145 + Math.random() * 15; // 145 - 160 km/h
  return {
    desiredSpeed: desiredKmh / 3.6,
    timeHeadway: 0.65 + Math.random() * 0.15, // 0.65 - 0.80s
    minGap: 1.0 + Math.random() * 0.2,        // 1.0 - 1.2m
    maxAccel: 3.0 + Math.random() * 0.4,      // 3.0 - 3.4 m/s^2
    comfortDecel: 3.2,
    delta: 4.0,
    length: 4.6,
    width: 1.85,
    politeness: 0.01 + Math.random() * 0.03,  // 0.01 - 0.04
    laneChangeThreshold: 0.03 + Math.random() * 0.02, // 0.03 - 0.05 m/s^2
    safeDecel: 5.2,
    personality: 'speeder',
  };
}

/**
 * Generates heterogeneous driver personalities (Aggressive, Normal, Cautious)
 * with realistic parameter variance in desired speed, time headway, gap, and lane-changing eagerness.
 */
export function createDriverProfile(
  type: VehicleType,
  explicitPersonality?: DriverPersonality
): { profile: DriverProfile; personality: DriverPersonality } {
  if (type === 'truck') {
    const desiredKmh = 80 + Math.random() * 10; // 80 - 90 km/h
    return {
      personality: 'cautious',
      profile: {
        desiredSpeed: desiredKmh / 3.6,
        timeHeadway: 2.0 + Math.random() * 0.5, // 2.0 - 2.5s (時距大)
        minGap: 2.5 + Math.random() * 0.8,      // 2.5 - 3.3m
        maxAccel: 0.65 + Math.random() * 0.15,  // 加速重、慢
        comfortDecel: 1.6,
        delta: 4.0,
        length: 12.0,
        width: 2.5,
        politeness: 0.4,
        laneChangeThreshold: 0.35,
        safeDecel: 3.5,
        personality: 'cautious',
      },
    };
  }

  if (type === 'acc') {
    const desiredKmh = 106 + Math.random() * 8; // 106 - 114 km/h
    return {
      personality: 'normal',
      profile: {
        desiredSpeed: desiredKmh / 3.6,
        timeHeadway: 1.15 + Math.random() * 0.15, // 1.15 - 1.30s (平滑車載雷達)
        minGap: 1.6,
        maxAccel: 1.2,
        comfortDecel: 2.2,
        delta: 4.0,
        length: 4.5,
        width: 1.8,
        politeness: 0.5,
        laneChangeThreshold: 0.2,
        safeDecel: 4.5,
        personality: 'normal',
      },
    };
  }

  // Passenger Car ('car'): Distribute into Aggressive (28%), Cautious (28%), Normal (44%)
  let personality: DriverPersonality = explicitPersonality || 'normal';
  if (!explicitPersonality) {
    const rand = Math.random();
    if (rand < 0.28) {
      personality = 'aggressive';
    } else if (rand < 0.56) {
      personality = 'cautious';
    } else {
      personality = 'normal';
    }
  }

  if (personality === 'speeder') {
    return {
      personality: 'speeder',
      profile: createSpeederProfile(),
    };
  }

  if (personality === 'aggressive') {
    // ⚡ 積極超車型：開得快 (124-138 km/h)、跟車緊 (T=0.9-1.15s)、低禮貌度 (p=0.1)、換道門檻極低 (頻頻超車)
    const desiredKmh = 124 + Math.random() * 14; // 124 - 138 km/h
    return {
      personality: 'aggressive',
      profile: {
        desiredSpeed: desiredKmh / 3.6,
        timeHeadway: 0.95 + Math.random() * 0.2, // 0.95 - 1.15s (貼近前車)
        minGap: 1.4 + Math.random() * 0.4,       // 1.4 - 1.8m
        maxAccel: 1.7 + Math.random() * 0.4,     // 1.7 - 2.1 m/s^2 (加速敏銳)
        comfortDecel: 2.4,
        delta: 4.0,
        length: 4.5,
        width: 1.8,
        politeness: 0.08 + Math.random() * 0.1,  // 0.08 - 0.18 (自私超車取向)
        laneChangeThreshold: 0.12,               // 稍有阻擋立即換道超車
        safeDecel: 4.2,
        personality: 'aggressive',
      },
    };
  }

  if (personality === 'cautious') {
    // 🛡️ 謹慎長距型：開得慢 (88-100 km/h)、離前車遠 (T=1.9-2.5s)、禮貌度高 (p=0.6)、非必要不換道
    const desiredKmh = 88 + Math.random() * 12; // 88 - 100 km/h
    return {
      personality: 'cautious',
      profile: {
        desiredSpeed: desiredKmh / 3.6,
        timeHeadway: 1.9 + Math.random() * 0.6, // 1.9 - 2.5s (保持充裕安全大車距)
        minGap: 2.8 + Math.random() * 0.8,      // 2.8 - 3.6m
        maxAccel: 1.0 + Math.random() * 0.2,    // 溫和線性提速
        comfortDecel: 1.8,
        delta: 4.0,
        length: 4.5,
        width: 1.8,
        politeness: 0.55 + Math.random() * 0.2, // 高禮貌度，極度在乎後方車輛
        laneChangeThreshold: 0.45,              // 換道門檻高，安分維持既有車道
        safeDecel: 3.2,
        personality: 'cautious',
      },
    };
  }

  // 🚗 標準順流型：符合一般高速公路中道巡航駕駛
  const desiredKmh = 105 + Math.random() * 12; // 105 - 117 km/h
  return {
    personality: 'normal',
    profile: {
      desiredSpeed: desiredKmh / 3.6,
      timeHeadway: 1.35 + Math.random() * 0.3, // 1.35 - 1.65s
      minGap: 1.9 + Math.random() * 0.5,       // 1.9 - 2.4m
      maxAccel: 1.35 + Math.random() * 0.25,
      comfortDecel: 2.0,
      delta: 4.0,
      length: 4.5,
      width: 1.8,
      politeness: 0.25 + Math.random() * 0.15,
      laneChangeThreshold: 0.22,
      safeDecel: 4.0,
      personality: 'normal',
    },
  };
}

// Simulation physics constants
export const SIM_CONSTANTS = {
  DT: 0.1,                   // Physics step time (0.1s = 10Hz)
  MIN_GAP_EVAL: 0.05,        // s_eval floor to avoid division by zero
  MAX_BRAKING: -9.0,         // Emergency absolute braking limit (m/s^2)
  LANE_CHANGE_DURATION: 2.6, // Seconds for lateral lane maneuver (~70m-85m longitudinal forward distance)
  LANE_CHANGE_COOLDOWN: 3.5, // Seconds before allowing another lane change (prevent ping-pong)
  LANE_WIDTH_METERS: 3.75,   // Standard highway lane width (meters)
  CRITICAL_SPEED_KMH: 40.0,  // Speed threshold indicating congestion phase transition
  PRE_BREAKDOWN_CAPACITY_PER_LANE: 2000, // veh/h/lane
  CAPACITY_DROP: 0.12,       // 12% capacity loss once queue is established
};

/**
 * Quintic (5th order) polynomial lane change trajectory.
 * Guarantees C^2 continuity: zero lateral velocity and zero lateral acceleration
 * at both start (p=0) and end (p=1), preventing jerky yaw motions.
 */
export function quinticTrajectory(p: number): { q: number; dq: number; ddq: number } {
  const t = Math.max(0, Math.min(1, p));
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  // Normalized lateral position: 10*t^3 - 15*t^4 + 6*t^5
  const q = 10 * t3 - 15 * t4 + 6 * t5;
  // First derivative dq/dt: 30*t^2 * (1 - t)^2
  const dq = 30 * t2 * Math.pow(1 - t, 2);
  // Second derivative d^2q/dt^2: 60*t * (1 - t) * (1 - 2*t)
  const ddq = (60 * t * (1 - t) * (1 - 2 * t)) + 0;

  return { q, dq, ddq };
}

/**
 * Calculates speed-adaptive kinematic lane change duration and physical boundaries.
 * Strictly adheres to non-holonomic vehicle kinematics:
 * Longitudinal merge distance L_merge scales continuously with forward velocity v:
 * L_merge = L_min + v * T_cruise
 * - At high highway speeds (v > 25 m/s): L_merge >= 70-85m, heading angle psi is gentle (~4-6 deg).
 * - At low crawling speeds (v < 3 m/s): short-distance merge (cars ~16m, trucks ~25m),
 *   allowing the vehicle to steer/yaw more sharply ("轉向大一點", cars ~20-25 deg, trucks ~14-16 deg)
 *   while eliminating y-direction drift through exact non-holonomic coupling: dy/dx = tan(psi).
 */
export function getKinematicLaneChangeDuration(v: Vehicle): {
  duration: number;
  mergeLength: number;
  peakYawRad: number;
  maxYawRad: number;
  maxWheelSteerRad: number;
} {
  const isTruck = v.type === 'truck';
  const isAborting = v.isAbortingLaneChange;

  // Longitudinal merge distance (m) based on vehicle class and maneuver:
  // Short-distance merge at low speed enables sharp cut-in steering without lateral drifting
  const minMergeDist = isAborting ? 12.0 : (isTruck ? 25.0 : 16.0);
  const cruiseMergeTime = isAborting ? 1.2 : (isTruck ? 2.6 : 2.2);
  const forwardV = Math.max(0, v.v);
  const mergeLength = minMergeDist + forwardV * cruiseMergeTime;

  // Peak trajectory tangent angle: tan(psi_peak) = (W * 1.875) / mergeLength = 7.03125 / mergeLength
  const peakYawRad = Math.atan(7.03125 / mergeLength);

  // Maximum allowed heading angle (physical steering lock boundary):
  // Cars: ~28 deg (0.488 rad); Trucks: ~18 deg (0.314 rad)
  // Non-holonomic low-speed cut-in allows sharp chassis yaw ("轉向大一點")
  const maxYawRad = isTruck ? 0.314 : 0.488;

  // Wheelbase L_w: cars ~2.7m, trucks ~6.5m
  // Front-wheel steering relative to chassis: tan(delta) = L_w * d2y/dx2
  const wheelbase = isTruck ? 6.5 : 2.7;
  const maxWheelSteerRad = Math.atan((wheelbase * 3.75 * 5.77) / (mergeLength * mergeLength));

  // Dynamic duration for progress advancement:
  // Effective crawling velocity floor (v_creep >= 2.4 m/s) guarantees the maneuver completes in 5-7 seconds
  const effectiveV = Math.max(2.4, v.v);
  const calculatedDuration = mergeLength / effectiveV;
  const maxAllowedDuration = isAborting ? 3.5 : (isTruck ? 7.2 : 5.8);
  const duration = Math.min(maxAllowedDuration, calculatedDuration);

  return { duration, mergeLength, peakYawRad, maxYawRad, maxWheelSteerRad };
}

