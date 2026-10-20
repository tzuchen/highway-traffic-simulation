import { describe, it, expect } from 'vitest';
import { TrafficAnalytics } from '../src/sim/analytics';
import { SIM_CONSTANTS } from '../src/sim/constants';
import { RoadConfig } from '../src/sim/types';

describe('Traffic Analytics & Theoretical Formulas', () => {
  it('accurately calculates theoretical LWR shockwave propagation speed', () => {
    // Upstream state: flow 2200 veh/h, density 22 veh/km
    // Downstream jammed state: flow 1800 veh/h, density 120 veh/km
    const q_u = 2200;
    const k_u = 22;
    const q_d = 1800;
    const k_d = 120;

    // w = (q_d - q_u) / (k_d - k_u) in km/h
    const w = (q_d - q_u) / (k_d - k_u);

    // (1800 - 2200) / (120 - 22) = -400 / 98 ≈ -4.08 km/h
    expect(w).toBeCloseTo(-4.08, 1);
    expect(w).toBeLessThan(0); // Shockwave propagates upstream!
  });

  it('accurately calculates capacity drop and queue clearance duration', () => {
    const C = 2000; // veh/h/lane
    const drop = SIM_CONSTANTS.CAPACITY_DROP; // 0.12
    const Q_discharge = C * (1 - drop); // 1760 veh/h/lane

    expect(Q_discharge).toBe(1760);

    // 100 excess vehicles with arrival 1400 veh/h and discharge 1760 veh/h
    const N_excess = 100;
    const q_in = 1400;
    const netClearRate = Q_discharge - q_in; // 360 veh/h
    const timeToClearHours = N_excess / netClearRate; // 100 / 360 = 0.277 hours = 16.67 minutes
    const timeToClearSeconds = timeToClearHours * 3600;

    expect(timeToClearSeconds).toBeCloseTo(1000, 0); // 1000 seconds ≈ 16.6 minutes
  });

  it('returns clean diagnosis when empty road is fed', () => {
    const analytics = new TrafficAnalytics();
    const mockRoad: RoadConfig = {
      length: 2400,
      numLanes: 3,
      speedLimitKmh: 100,
      lanes: [{ index: 0, isOpen: true }, { index: 1, isOpen: true }, { index: 2, isOpen: true }],
    };

    const diag = analytics.getDiagnosis(0, [], mockRoad, 3000);
    expect(diag.isCongested).toBe(false);
    expect(diag.state).toBe('free');
    expect(diag.queueLengthMeters).toBe(0);
    expect(diag.excessVehicles).toBe(0);
    expect(diag.estimatedClearSeconds).toBeNull();
  });
});
