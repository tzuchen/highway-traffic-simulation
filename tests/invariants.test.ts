import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/sim/simulation';
import { ScenarioType } from '../src/sim/types';

describe('Global Simulation Invariants & Stress Testing', () => {
  const scenarios: ScenarioType[] = ['lane_drop', 'on_ramp', 'phantom_jam', 'accident'];

  scenarios.forEach((scType) => {
    it(`preserves physical invariants across 500 simulation steps in scenario: ${scType}`, () => {
      const sim = new SimulationEngine(scType);

      // In accident scenario, trigger incident halfway to test extreme jam safety
      if (scType === 'accident') {
        sim.toggleIncident();
      }

      for (let step = 0; step < 500; step++) {
        sim.step(0.1);

        // Check vehicle invariants
        for (const v of sim.vehicles) {
          // 1. Non-negative velocity invariant
          expect(v.v).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(v.v)).toBe(true);

          // 2. Position finite and within bounds
          expect(Number.isFinite(v.x)).toBe(true);
          expect(v.x).toBeGreaterThanOrEqual(0);
          expect(v.x).toBeLessThanOrEqual(sim.road.length + 50);

          // 3. Acceleration finite
          expect(Number.isFinite(v.a)).toBe(true);
        }

        // 4. Collision Invariant: on every lane, check bumper-to-bumper gaps
        const byLane = Array.from({ length: sim.road.numLanes }, () => [] as typeof sim.vehicles);
        for (const v of sim.vehicles) {
          if (v.laneChangeProgress === 0 && v.currentLane >= 0 && v.currentLane < sim.road.numLanes) {
            byLane[v.currentLane].push(v);
          }
        }

        for (let l = 0; l < sim.road.numLanes; l++) {
          const sorted = byLane[l].sort((a, b) => a.x - b.x);
          for (let i = 0; i < sorted.length - 1; i++) {
            const follower = sorted[i];
            const leader = sorted[i + 1];
            const bumperGap = leader.x - leader.profile.length - follower.x;

            // Physical bumper overlap should not exceed a microscopic tolerance (-0.1m)
            expect(bumperGap).toBeGreaterThan(-0.1);
          }
        }
      }

      // Check final diagnosis is valid and calculated cleanly
      const diag = sim.getDiagnosis();
      expect(Number.isFinite(diag.avgSpeedKmh)).toBe(true);
      expect(Number.isFinite(diag.densityVehPerKmPerLane)).toBe(true);
    });
  });
});
