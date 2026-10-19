import { DriverProfile } from './types';

// Default calibrated driver profiles (Treiber & Kesting, 2013 + Codex review)
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
};

export const DEFAULT_TRUCK_PROFILE: DriverProfile = {
  desiredSpeed: 23.6,         // 85 km/h in m/s
  timeHeadway: 2.0,          // 2.0 seconds
  minGap: 2.5,
  maxAccel: 0.7,             // heavier, slower acceleration
  comfortDecel: 1.6,
  delta: 4.0,
  length: 12.0,              // 12 meters
  width: 2.5,
  politeness: 0.4,
  laneChangeThreshold: 0.3,
  safeDecel: 3.5,
};

export const DEFAULT_ACC_PROFILE: DriverProfile = {
  desiredSpeed: 30.5,         // 110 km/h in m/s
  timeHeadway: 1.1,          // tighter, computer-controlled headway
  minGap: 1.5,
  maxAccel: 1.2,
  comfortDecel: 2.2,         // smooth braking
  delta: 4.0,
  length: 4.5,
  width: 1.8,
  politeness: 0.5,           // highly cooperative
  laneChangeThreshold: 0.2,
  safeDecel: 4.5,
};

// Simulation physics constants
export const SIM_CONSTANTS = {
  DT: 0.1,                   // Physics step time (0.1s = 10Hz)
  MIN_GAP_EVAL: 0.05,        // s_eval floor to avoid division by zero
  MAX_BRAKING: -9.0,         // Emergency absolute braking limit (m/s^2)
  LANE_CHANGE_DURATION: 1.2, // Seconds for lateral lane maneuver
  LANE_CHANGE_COOLDOWN: 3.0, // Seconds before allowing another lane change (prevent ping-pong)
  LANE_WIDTH_METERS: 3.75,   // Standard highway lane width (meters)
  CRITICAL_SPEED_KMH: 40.0,  // Speed threshold indicating congestion phase transition
  PRE_BREAKDOWN_CAPACITY_PER_LANE: 2000, // veh/h/lane
  CAPACITY_DROP: 0.12,       // 12% capacity loss once queue is established
};
