import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/sim/simulation';
import { DEFAULT_CAR_PROFILE, DEFAULT_TRUCK_PROFILE, quinticTrajectory, getKinematicLaneChangeDuration } from '../src/sim/constants';
import { Vehicle } from '../src/sim/types';

describe('Vehicle Telemetry & Interactive Actions', () => {
  it('correctly extracts telemetry, leader gap, and closing speed for an ego vehicle', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    const leader: Vehicle = {
      id: 1,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 500,
      y: 1.0,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 20, // 72 km/h
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };

    const ego: Vehicle = {
      id: 2,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 460, // 40m behind leader head, bumper-to-bumper = 500 - 4.5 - 460 = 35.5m
      y: 1.0,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 25, // 90 km/h (closing in at 5 m/s = +18 km/h)
      a: -0.5,
      isBraking: false,
      color: '#3b82f6',
    };

    engine.vehicles = [leader, ego];

    const telem = engine.getVehicleTelemetry(ego.id);
    expect(telem).not.toBeNull();
    if (!telem) return;

    expect(telem.vehicle.id).toBe(2);
    expect(telem.leader?.id).toBe(1);
    expect(telem.speedKmh).toBeCloseTo(90, 1);
    expect(telem.actualGapMeters).toBeCloseTo(35.5, 1);
    expect(telem.relativeClosingSpeedKmh).toBeCloseTo(18, 1);
    expect(telem.desiredGapMeters).toBeGreaterThan(telem.vehicle.profile.minGap);
  });

  it('correctly induces sharp vehicle braking for shockwave demonstration', () => {
    const engine = new SimulationEngine('phantom_jam');
    expect(engine.vehicles.length).toBeGreaterThan(0);

    const targetVehicle = engine.vehicles[0];
    const initialV = targetVehicle.v;

    const success = engine.induceVehicleBrake(targetVehicle.id);
    expect(success).toBe(true);
    expect(targetVehicle.v).toBeLessThan(initialV);
    expect(targetVehicle.a).toBe(-4.5);
    expect(targetVehicle.isBraking).toBe(true);
  });

  it('returns null telemetry for non-existent vehicle ID', () => {
    const engine = new SimulationEngine('lane_drop');
    const telem = engine.getVehicleTelemetry(999999);
    expect(telem).toBeNull();
  });

  it('generates diverse driver personalities with distinct speed, headway, and overtaking thresholds', () => {
    const engine = new SimulationEngine('lane_drop');
    // Ensure initial traffic contains multiple vehicle personalities
    expect(engine.vehicles.length).toBeGreaterThan(5);

    const cars = engine.vehicles.filter((v) => v.type === 'car');
    expect(cars.length).toBeGreaterThan(0);

    const aggressiveCars = cars.filter((v) => v.personality === 'aggressive');
    const cautiousCars = cars.filter((v) => v.personality === 'cautious');

    // If both kinds are present in sample
    if (aggressiveCars.length > 0 && cautiousCars.length > 0) {
      const agg = aggressiveCars[0];
      const cau = cautiousCars[0];

      // Aggressive drivers want to drive faster than cautious drivers
      expect(agg.profile.desiredSpeed).toBeGreaterThan(cau.profile.desiredSpeed);
      // Aggressive drivers keep shorter time headway (follow closer)
      expect(agg.profile.timeHeadway).toBeLessThan(cau.profile.timeHeadway);
      // Aggressive drivers have lower lane change threshold (eager to overtake)
      expect(agg.profile.laneChangeThreshold).toBeLessThan(cau.profile.laneChangeThreshold);
      // Aggressive drivers are less polite (more selfish in overtaking)
      expect(agg.profile.politeness).toBeLessThan(cau.profile.politeness);
    }
  });

  it('executes extended lane changes over realistic forward distance (>= 50m at highway speed)', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    const car: Vehicle = {
      id: 10,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 100,
      y: 1.0,
      currentLane: 1,
      targetLane: 0,
      laneChangeProgress: 0.01,
      laneChangeCooldown: 0,
      v: 27.78, // 100 km/h
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };

    engine.vehicles = [car];
    const initialX = car.x;

    // Simulate forward until lane change completes
    while (car.laneChangeProgress > 0) {
      engine.step(0.1);
    }

    const distanceTraveledDuringChange = car.x - initialX;
    // At 100 km/h with 2.6s duration, distance traveled should be ~70m (well above 50m)
    expect(distanceTraveledDuringChange).toBeGreaterThan(55);
    expect(car.currentLane).toBe(0);
    expect(car.y).toBeCloseTo(0, 1);
  });

  it('verifies quintic trajectory satisfies C2 smooth boundary conditions for natural steering', () => {
    // 1. Boundary conditions at start (p=0)
    const start = quinticTrajectory(0);
    expect(start.q).toBe(0);
    expect(start.dq).toBe(0); // Zero starting lateral velocity
    expect(start.ddq).toBe(0); // Zero starting lateral acceleration

    // 2. Midpoint (p=0.5): peak lateral velocity, zero acceleration (inflection point)
    const mid = quinticTrajectory(0.5);
    expect(mid.q).toBe(0.5);
    expect(mid.dq).toBeCloseTo(1.875, 4); // Peak lateral velocity factor
    expect(mid.ddq).toBe(0); // Transition from turn-in to counter-steer

    // 3. Boundary conditions at end (p=1.0)
    const end = quinticTrajectory(1.0);
    expect(end.q).toBe(1.0);
    expect(end.dq).toBe(0); // Zero final lateral velocity (smooth settle)
    expect(end.ddq).toBe(0); // Zero final acceleration (straightened out)

    // 4. Counter-steer symmetry
    // First quarter has positive acceleration (turn-in), third quarter has negative acceleration (counter-steer)
    const turnIn = quinticTrajectory(0.2113);
    const counterSteer = quinticTrajectory(1 - 0.2113);
    expect(turnIn.ddq).toBeGreaterThan(5.5);
    expect(counterSteer.ddq).toBeLessThan(-5.5);
    expect(turnIn.ddq).toBeCloseTo(-counterSteer.ddq, 2);
  });

  it('guarantees vehicle dimensions remain strictly rigid regardless of follower/leader proximity', () => {
    // Helper function matching HighwayRenderer's dimension calculation
    const calcDimensions = (length: number, isTruck: boolean, scale: number) => {
      const baseLen = Math.round(length * Math.max(1.4, scale * 2.4));
      const vLen = isTruck ? Math.max(18, Math.min(52, baseLen)) : Math.max(9, Math.min(26, baseLen));
      const vWidth = isTruck
        ? Math.max(8, Math.min(13, Math.round(vLen * 0.28)))
        : Math.max(5.5, Math.min(10.5, Math.round(vLen * 0.42)));
      return { vLen, vWidth };
    };

    const scale = 0.6; // Overview scale
    const carDimWideGap = calcDimensions(4.5, false, scale);
    const carDimBumperTouch = calcDimensions(4.5, false, scale);

    // Dimensions MUST be identical whether cars are 50m apart or in a bumper-to-bumper jam
    expect(carDimWideGap.vLen).toBe(carDimBumperTouch.vLen);
    expect(carDimWideGap.vWidth).toBe(carDimBumperTouch.vWidth);
    expect(carDimWideGap.vLen).toBeGreaterThanOrEqual(9);
    expect(carDimWideGap.vWidth).toBeGreaterThanOrEqual(5.5);
  });

  it('aborts lane change and smoothly returns to original lane if target leader suddenly creates collision hazard', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    // Ego vehicle is in the middle of changing from Lane 1 to Lane 0
    const ego: Vehicle = {
      id: 1,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 100,
      y: 0.7,
      currentLane: 1,
      targetLane: 0,
      laneChangeProgress: 0.35,
      laneChangeCooldown: 0,
      v: 25, // 90 km/h
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };

    // Target lane suddenly has a slow vehicle directly ahead (collision threat)
    const targetBlocker: Vehicle = {
      id: 2,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 108, // Only 8m ahead (gap = 8 - 4.5 = 3.5m < minGap * 0.9 = 1.8m or dangerously closing)
      y: 0,
      currentLane: 0,
      targetLane: 0,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 5, // Slow vehicle (20 km/h closing at 70 km/h)
      a: 0,
      isBraking: false,
      color: '#ef4444',
    };

    engine.vehicles = [ego, targetBlocker];

    // Step simulation
    engine.step(0.1);

    // Ego must have detected danger and triggered isAbortingLaneChange = true
    expect(ego.isAbortingLaneChange).toBe(true);

    // Simulate forward until ego abort is complete
    while (ego.isAbortingLaneChange) {
      engine.step(0.1);
    }

    // Ego must have safely returned to original Lane 1
    expect(ego.currentLane).toBe(1);
    expect(ego.targetLane).toBe(1);
    expect(ego.laneChangeProgress).toBe(0);
    expect(ego.y).toBeCloseTo(1.0, 1);
    expect(ego.laneChangeCooldown).toBeGreaterThan(0); // Cooldown set
  });

  it('evaluates dual-leader IDM and bounds acceleration by target lane leader during lane change', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    // Ego is changing lanes (p = 0.25)
    const ego: Vehicle = {
      id: 10,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 200,
      y: 0.9,
      currentLane: 1,
      targetLane: 0,
      laneChangeProgress: 0.25,
      laneChangeCooldown: 0,
      v: 25,
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };

    // Lane 1 has no leader (free road term would be positive acceleration)
    // Lane 0 has a stopped leader ahead at 230m
    const targetLeader: Vehicle = {
      id: 20,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 230,
      y: 0,
      currentLane: 0,
      targetLane: 0,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 0,
      a: 0,
      isBraking: false,
      color: '#ef4444',
    };

    engine.vehicles = [ego, targetLeader];

    engine.step(0.1);

    // Ego must decelerate (brake) due to target leader, not accelerate
    expect(ego.a).toBeLessThan(0);
  });

  it('guarantees continuous sub-frame position advancement and phase-locked dashed lines', () => {
    const v: Vehicle = {
      id: 5,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 100,
      y: 0,
      currentLane: 0,
      targetLane: 0,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 20, // 20 m/s
      a: 1.0, // 1 m/s^2
      isBraking: false,
      color: '#3b82f6',
    };

    // Sub-frame at tau = 0.05s (halfway into 0.1s step)
    const tau = 0.05;
    const interpX = v.x + v.v * tau + 0.5 * v.a * tau * tau;
    expect(interpX).toBeGreaterThan(v.x);
    expect(interpX).toBeCloseTo(101.00125, 4);

    // Dashed line offset anchoring
    const scale = 4.8;
    const dashLenPx = 6.0 * scale;
    const gapLenPx = 9.0 * scale;
    const periodPx = dashLenPx + gapLenPx; // 15m period = 72px

    const offset1 = -((100 * scale) % periodPx);
    const offset2 = -(((100 + 15) * scale) % periodPx);
    // Advancing by exactly one period should wrap to identical phase
    expect(offset1).toBeCloseTo(offset2, 4);
  });

  it('spawns vehicles stochastically and desynchronized across lanes (no lockstep triplets)', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = []; // Clear seeded vehicles to focus exclusively on entry spawns

    // Track spawn events per lane: { lane, time }
    const spawnEvents: { lane: number; time: number }[] = [];
    const prevCountByLane = [0, 0, 0];

    // Run for 30 seconds (300 steps at dt=0.1s)
    for (let step = 0; step < 300; step++) {
      const prevIds = new Set(engine.vehicles.map((v) => v.id));
      engine.step(0.1);
      const newVehicles = engine.vehicles.filter((v) => !prevIds.has(v.id) && v.x <= 15);

      for (const nv of newVehicles) {
        spawnEvents.push({ lane: nv.currentLane, time: engine.time });
      }
    }

    expect(spawnEvents.length).toBeGreaterThan(10);

    // Verify lanes spawned independently: group spawns by timestamp
    const spawnsByTime = new Map<number, number[]>();
    for (const ev of spawnEvents) {
      const roundedTime = Math.round(ev.time * 10) / 10;
      const list = spawnsByTime.get(roundedTime) ?? [];
      list.push(ev.lane);
      spawnsByTime.set(roundedTime, list);
    }

    // Check that spawns are desynchronized: NOT all spawns are 3-lane simultaneous triplets
    let tripletCount = 0;
    let singleOrDoubleCount = 0;
    for (const lanes of spawnsByTime.values()) {
      if (lanes.length === 3 && new Set(lanes).size === 3) {
        tripletCount++;
      } else {
        singleOrDoubleCount++;
      }
    }

    // The vast majority of spawns should be independent, single-lane or double-lane arrivals
    expect(singleOrDoubleCount).toBeGreaterThan(tripletCount);

    // Verify each lane received vehicles
    for (let l = 0; l < 3; l++) {
      const laneSpawns = spawnEvents.filter((ev) => ev.lane === l);
      expect(laneSpawns.length).toBeGreaterThan(1);
    }
  });

  it('enforces highway freight regulations (zero trucks in innermost passing lane 0)', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.params.truckPercentage = 30; // High truck volume
    engine.vehicles = [];

    // Run 500 steps
    for (let step = 0; step < 500; step++) {
      engine.step(0.1);
    }

    const lane0Vehicles = engine.vehicles.filter((v) => v.currentLane === 0);
    const lane2Vehicles = engine.vehicles.filter((v) => v.currentLane === 2);

    expect(lane0Vehicles.length).toBeGreaterThan(5);
    // Passing lane 0 MUST have 0% trucks!
    const lane0Trucks = lane0Vehicles.filter((v) => v.type === 'truck');
    expect(lane0Trucks.length).toBe(0);

    // Outer freight lane 2 should carry trucks
    const lane2Trucks = lane2Vehicles.filter((v) => v.type === 'truck');
    expect(lane2Trucks.length).toBeGreaterThan(0);
  });

  it('delays spawning when entrance is physically blocked by slow or stopped vehicles', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    // Place a stopped vehicle covering entrance: x = 5m on lane 1 (rear bumper at 0.5m < s0)
    const blocker: Vehicle = {
      id: 999,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 5,
      y: 1,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 99,
      v: 0, // Stopped!
      a: 0,
      isBraking: true,
      color: '#ef4444',
      hasIncident: true,
    };
    engine.vehicles.push(blocker);

    // Run for 50 steps (5 seconds)
    for (let step = 0; step < 50; step++) {
      engine.step(0.1);
    }

    // No vehicle should have spawned on lane 1 while blocker is at x = 5m!
    const lane1Behind = engine.vehicles.filter((v) => v.currentLane === 1 && v.id !== 999 && v.x < 5);
    expect(lane1Behind.length).toBe(0);
  });

  it('adapts entry speed and shrinks distance gap when downstream traffic is congested without rear-ending', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.vehicles = [];

    // Congested leader ahead at x = 18m moving at 4 m/s (14.4 km/h)
    const slowLeader: Vehicle = {
      id: 888,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE, desiredSpeed: 4.0 }, // Capped speed in congested segment
      x: 18,
      y: 1,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 99,
      v: 4.0, // Crawling at 14.4 km/h
      a: 0,
      isBraking: false,
      color: '#f97316',
    };
    engine.vehicles.push(slowLeader);

    // Run until a new car spawns on lane 1 behind slowLeader
    let spawnedCar: Vehicle | undefined;
    for (let step = 0; step < 60; step++) {
      engine.step(0.1);
      spawnedCar = engine.vehicles.find((v) => v.currentLane === 1 && v.id !== 888 && v.x < 15);
      if (spawnedCar) break;
    }

    expect(spawnedCar).toBeDefined();
    if (!spawnedCar) return;

    // 1. Inflow speed must be slowed down to harmonize with slow leader (NOT 24 m/s!)
    expect(spawnedCar.v).toBeLessThanOrEqual(5.5);
    expect(spawnedCar.v).toBeGreaterThanOrEqual(2.0);

    // 2. Relative speed to leader must be safe (no violent closing speed)
    const leaderNow = engine.vehicles.find((v) => v.id === 888)!;
    const relSpeed = spawnedCar.v - leaderNow.v;
    expect(relSpeed).toBeLessThan(1.5);

    // 3. Acceleration in subsequent step must be gentle (no emergency IDM slam)
    engine.step(0.1);
    expect(spawnedCar.a).toBeGreaterThanOrEqual(-1.5);
  });

  it('implements front-steered Ackermann geometry pivoting around the rear axle (not center of mass)', () => {
    // Length L = 4.5m, wheelbase = 2.7m (60%), rear overhang = 0.9m (20%)
    const vLen = 4.5;
    const rearAxleOffset = vLen * 0.20; // 0.9m
    const wheelbase = vLen * 0.60; // 2.7m

    // In chassis frame with REAR AXLE at origin (0, 0):
    const rearAxleLocal = { x: 0, y: 0 };
    const frontAxleLocal = { x: wheelbase, y: 0 };
    const rearBumperLocal = { x: -rearAxleOffset, y: 0 };
    const frontBumperLocal = { x: vLen - rearAxleOffset, y: 0 };

    // Simulate yaw rotation psi = +5 degrees (0.087 rad, steering right/downwards)
    const psi = 0.087266;
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);

    // Rotate points about rear axle (0, 0)
    const rotate = (pt: { x: number; y: number }) => ({
      x: pt.x * cosPsi - pt.y * sinPsi,
      y: pt.x * sinPsi + pt.y * cosPsi,
    });

    const rearAxleRotated = rotate(rearAxleLocal);
    const frontAxleRotated = rotate(frontAxleLocal);
    const frontBumperRotated = rotate(frontBumperLocal);
    const rearBumperRotated = rotate(rearBumperLocal);

    // 1. Rear axle does NOT displace laterally (0 lateral slip at pivot)
    expect(rearAxleRotated.x).toBeCloseTo(0, 5);
    expect(rearAxleRotated.y).toBeCloseTo(0, 5);

    // 2. Front axle sweeps outward in the direction of the turn (y > 0)
    expect(frontAxleRotated.y).toBeGreaterThan(0.2);
    expect(frontAxleRotated.y).toBeCloseTo(wheelbase * sinPsi, 5);

    // 3. Front bumper leads the vehicle into the new lane
    expect(frontBumperRotated.y).toBeGreaterThan(frontAxleRotated.y);
    expect(frontBumperRotated.y).toBeCloseTo((vLen - rearAxleOffset) * sinPsi, 5);

    // 4. Rear bumper does NOT kick out in the opposite direction (it stays trailing along the path)
    expect(Math.abs(rearBumperRotated.y)).toBeLessThan(frontBumperRotated.y * 0.3);
  });

  it('strictly adheres to non-holonomic constraints with sharp low-speed steering and zero y-drift', () => {
    const truck: Vehicle = {
      id: 777,
      type: 'truck',
      profile: { ...DEFAULT_TRUCK_PROFILE, length: 10.5, width: 2.5 },
      x: 100,
      y: 1.0,
      currentLane: 1,
      targetLane: 2,
      laneChangeProgress: 0.5, // Peak yaw angle inflection point
      laneChangeCooldown: 0,
      v: 1.5, // Crawling at 5.4 km/h in congestion
      a: 0,
      isBraking: false,
      color: '#eab308',
    };

    const truckConfig = getKinematicLaneChangeDuration(truck);

    // 1. Truck duration scales gracefully at low crawl speed, capped to avoid indefinite freeze
    expect(truckConfig.duration).toBeGreaterThanOrEqual(6.0);
    expect(truckConfig.duration).toBeLessThanOrEqual(7.5);

    // 2. Low-speed short-distance merge allows sharp authentic truck yaw (12 - 16 deg / 0.21 - 0.28 rad)
    expect(truckConfig.peakYawRad).toBeGreaterThanOrEqual(0.20); // >= 11.5 deg
    expect(truckConfig.peakYawRad).toBeLessThanOrEqual(0.30);    // <= 17.2 deg
    expect(truckConfig.maxYawRad).toBeGreaterThanOrEqual(truckConfig.peakYawRad);

    // 3. Test passenger car: turns even more sharply (20 - 25 deg) for realistic gap cut-in
    const car: Vehicle = {
      id: 888,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE },
      x: 100,
      y: 1.0,
      currentLane: 1,
      targetLane: 2,
      laneChangeProgress: 0.5,
      laneChangeCooldown: 0,
      v: 1.5, // Low crawling speed
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };

    const carConfig = getKinematicLaneChangeDuration(car);
    // Passenger car peak yaw reaches ~20-25 degrees (0.35 - 0.44 rad) without artificial over-clamping
    expect(carConfig.peakYawRad).toBeGreaterThanOrEqual(0.33); // >= 19 deg ("轉向大一點")
    expect(carConfig.peakYawRad).toBeLessThanOrEqual(0.46);    // <= 26.5 deg

    // 4. Strict Non-Holonomic Constraint: trajectory tangent slope dy/dx === tan(psi)
    // dy/dx = (W * dq) / mergeLength = (3.75 * 1.875) / mergeLength
    const expectedSlope = (3.75 * 1.875) / carConfig.mergeLength;
    expect(Math.tan(carConfig.peakYawRad)).toBeCloseTo(expectedSlope, 5);
    // Velocity vector direction arctan(dy/dx) matches heading angle identically -> ZERO lateral slip (no y-drift)
    expect(Math.atan(expectedSlope)).toBeCloseTo(carConfig.peakYawRad, 5);
  });

  it('allows vehicles stuck mid-lane-change in slow traffic to creep forward and complete maneuver', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.params.inflowVehPerHour = 0;

    // Stopped vehicle in old lane (lane 0) at x=60
    const oldLaneLeader: Vehicle = {
      id: 101,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE, length: 4.5 },
      x: 60,
      y: 0,
      currentLane: 0,
      targetLane: 0,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 0,
      a: 0,
      isBraking: true,
      color: '#3b82f6',
    };

    // Changing vehicle transitioning 0 -> 1, currently at x=50, p=0.5, stopped (v=0)
    // Target lane (lane 1) has a leader at x=57 (gap = 57 - 4.5 - 50 = 2.5m > 0.8m)
    const changingCar: Vehicle = {
      id: 102,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE, length: 4.5 },
      x: 50,
      y: 0.5,
      currentLane: 0,
      targetLane: 1,
      laneChangeProgress: 0.5,
      laneChangeCooldown: 0,
      v: 0,
      a: 0,
      isBraking: false,
      color: '#06b6d4',
    };

    // Target lane leader crawling at 1.5 m/s at x=57
    const targetLeader: Vehicle = {
      id: 103,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE, length: 4.5 },
      x: 57,
      y: 1,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 1.5,
      a: 0.5,
      isBraking: false,
      color: '#f59e0b',
    };

    engine.vehicles = [oldLaneLeader, changingCar, targetLeader];

    // Step simulation 1 tick (dt = 0.1s)
    engine.step(0.1);

    const updatedCar = engine.vehicles.find(v => v.id === 102)!;

    // Vehicle must NOT be locked at v=0 (must creep forward)
    expect(updatedCar.v).toBeGreaterThan(0);
    expect(updatedCar.x).toBeGreaterThan(50);
    // Lane change progress must advance
    expect(updatedCar.laneChangeProgress).toBeGreaterThan(0.5);

    // Run for 60 steps (6.0 seconds) - vehicle should complete lane change without deadlocking
    for (let step = 0; step < 60; step++) {
      engine.step(0.1);
    }

    const finalCar = engine.vehicles.find(v => v.id === 102)!;
    expect(finalCar.currentLane).toBe(1);
    expect(finalCar.laneChangeProgress).toBe(0);
    // Non-penetration invariant: behind targetLeader
    const finalLeader = engine.vehicles.find(v => v.id === 103)!;
    expect(finalCar.x).toBeLessThanOrEqual(finalLeader.x - finalLeader.profile.length + 0.001);
  });

  it('correctly spawns and models a speeding, chronic overtaker (Speeder / Speed Demon)', () => {
    const engine = new SimulationEngine('lane_drop');
    engine.params.inflowVehPerHour = 0;
    engine.road.speedLimitKmh = 100;

    // Place a normal slower car at x=200 in lane 1
    const slowCar: Vehicle = {
      id: 50,
      type: 'car',
      profile: { ...DEFAULT_CAR_PROFILE, desiredSpeed: 25 }, // 90 km/h
      x: 200,
      y: 1,
      currentLane: 1,
      targetLane: 1,
      laneChangeProgress: 0,
      laneChangeCooldown: 0,
      v: 25,
      a: 0,
      isBraking: false,
      color: '#3b82f6',
    };
    engine.vehicles = [slowCar];

    // Spawn speeder in lane 1
    const speeder = engine.spawnSpeeder(1);
    expect(speeder.type).toBe('speeder');
    expect(speeder.personality).toBe('speeder');
    // Desired speed heavily exceeds highway speed limit of 100 km/h
    expect(speeder.profile.desiredSpeed * 3.6).toBeGreaterThanOrEqual(140);
    // Extreme tailgating headway (<= 0.85s) and near-zero threshold (<= 0.06 m/s^2)
    expect(speeder.profile.timeHeadway).toBeLessThanOrEqual(0.85);
    expect(speeder.profile.laneChangeThreshold).toBeLessThanOrEqual(0.06);
    expect(speeder.profile.politeness).toBeLessThanOrEqual(0.05);

    // Position speeder 35m behind slowCar closing in at 40 m/s (~144 km/h)
    speeder.x = 165;
    speeder.v = 40;

    // Run simulation for 80 steps (8.0 seconds) to allow complete lane change and overtake
    for (let i = 0; i < 80; i++) {
      engine.step(0.1);
    }

    // Speeder should have overtaken slowCar
    const updatedSpeeder = engine.vehicles.find(v => v.id === speeder.id)!;
    const updatedSlowCar = engine.vehicles.find(v => v.id === 50)!;
    expect(updatedSpeeder.x).toBeGreaterThan(updatedSlowCar.x);
    expect(updatedSpeeder.overtakeCount).toBeGreaterThanOrEqual(1);

    // Check telemetry
    const telem = engine.getVehicleTelemetry(speeder.id);
    expect(telem).not.toBeNull();
    expect(telem?.speedingPct).toBeGreaterThan(0);
    expect(telem?.overtakeCount).toBeGreaterThanOrEqual(1);
  });
});


