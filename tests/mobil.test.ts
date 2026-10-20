import { describe, it, expect } from 'vitest';
import { evaluateLaneChange } from '../src/sim/mobil';
import { Vehicle, RoadConfig } from '../src/sim/types';
import { DEFAULT_CAR_PROFILE } from '../src/sim/constants';

function createMockVehicle(id: number, x: number, lane: number, v = 25): Vehicle {
  return {
    id,
    type: 'car',
    profile: { ...DEFAULT_CAR_PROFILE },
    x,
    y: lane,
    currentLane: lane,
    targetLane: lane,
    laneChangeProgress: 0,
    laneChangeCooldown: 0,
    v,
    a: 0,
    isBraking: false,
    color: '#3b82f6',
  };
}

describe('MOBIL Lane-Changing Engine', () => {
  const road: RoadConfig = {
    length: 2000,
    numLanes: 2,
    speedLimitKmh: 100,
    lanes: [
      { index: 0, isOpen: true },
      { index: 1, isOpen: true },
    ],
  };

  it('rejects lane change if prospective follower in target lane would brake dangerously', () => {
    // Ego in lane 1 behind a slow car, wants to pass to lane 0
    const ego = createMockVehicle(1, 200, 1, 25);
    const slowLeader = createMockVehicle(2, 230, 1, 15);

    // Target lane 0 has a very fast tailgater closely behind ego
    const aggressiveTailgater = createMockVehicle(3, 195, 0, 35); // 5m behind, closing at high speed

    const vehiclesByLane: Vehicle[][] = [
      [aggressiveTailgater],
      [ego, slowLeader],
    ];

    const decision = evaluateLaneChange(ego, road, vehiclesByLane);
    // Should be rejected due to follower safety constraint
    expect(decision).toBeNull();
  });

  it('approves lane change when target lane is clear and ego gains acceleration advantage', () => {
    const ego = createMockVehicle(1, 200, 1, 15); // stuck behind slow car
    const slowLeader = createMockVehicle(2, 220, 1, 15);

    // Target lane 0 is completely empty
    const vehiclesByLane: Vehicle[][] = [
      [],
      [ego, slowLeader],
    ];

    const decision = evaluateLaneChange(ego, road, vehiclesByLane);
    expect(decision).not.toBeNull();
    expect(decision?.targetLane).toBe(0);
  });

  it('respects laneChangeCooldown and blocks immediate ping-pong change', () => {
    const ego = createMockVehicle(1, 200, 1, 15);
    ego.laneChangeCooldown = 2.5; // Cooldown active

    const vehiclesByLane: Vehicle[][] = [[], [ego]];
    const decision = evaluateLaneChange(ego, road, vehiclesByLane);
    expect(decision).toBeNull();
  });

  it('triggers mandatory merge when approaching dropped lane ahead', () => {
    const dropRoad: RoadConfig = {
      length: 2000,
      numLanes: 2,
      speedLimitKmh: 100,
      lanes: [
        { index: 0, isOpen: true },
        { index: 1, isOpen: true, dropStart: 400, dropEnd: 500 }, // Lane 1 closes at 500m
      ],
    };

    // Ego at x = 420m in closing lane 1
    const ego = createMockVehicle(1, 420, 1, 20);
    const vehiclesByLane: Vehicle[][] = [[], [ego]];

    const decision = evaluateLaneChange(ego, dropRoad, vehiclesByLane);
    expect(decision).not.toBeNull();
    expect(decision?.isMandatory).toBe(true);
    expect(decision?.targetLane).toBe(0);
  });

  it('actively squeezes into neighboring faster lane when current lane slows down', () => {
    // Current lane 1 is slowed down downstream (cars ahead crawling at 10 m/s ~ 36 km/h)
    const ego = createMockVehicle(1, 200, 1, 14);
    const slowCar1 = createMockVehicle(2, 225, 1, 10);
    const slowCar2 = createMockVehicle(3, 250, 1, 10);

    // Target lane 0 is flowing steadily at 18 m/s (65 km/h) with a viable opening
    const movingLeader = createMockVehicle(4, 240, 0, 18);
    const movingFollower = createMockVehicle(5, 160, 0, 16);

    const vehiclesByLane: Vehicle[][] = [
      [movingFollower, movingLeader],
      [ego, slowCar1, slowCar2],
    ];

    const decision = evaluateLaneChange(ego, road, vehiclesByLane);
    // Ego in the slowing lane proactively decides to squeeze into the faster lane 0!
    expect(decision).not.toBeNull();
    expect(decision?.targetLane).toBe(0);
  });
});
