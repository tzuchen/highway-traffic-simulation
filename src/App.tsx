import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationEngine, SimulationParams } from './sim/simulation';
import { ScenarioType, CongestionDiagnosis, TrajectoryPoint, DetectorReading, VehicleTelemetry } from './sim/types';
import { SCENARIOS } from './sim/scenarios';
import { Header } from './components/Header';
import { HighwayCanvas } from './components/HighwayCanvas';
import { SpaceTimeCanvas } from './components/SpaceTimeCanvas';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ControlPanel } from './components/ControlPanel';
import { VehicleInspector } from './components/VehicleInspector';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { Info, HelpCircle } from 'lucide-react';

export const App: React.FC = () => {
  const engineRef = useRef<SimulationEngine>(new SimulationEngine('lane_drop'));
  const [scenarioType, setScenarioType] = useState<ScenarioType>('lane_drop');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [simTime, setSimTime] = useState<number>(0);
  const [vehicleCount, setVehicleCount] = useState<number>(0);
  const [params, setParams] = useState<SimulationParams>(engineRef.current.params);
  const [diagnosis, setDiagnosis] = useState<CongestionDiagnosis>(engineRef.current.getDiagnosis());
  const [trajectories, setTrajectories] = useState<TrajectoryPoint[]>([]);
  const [detectors, setDetectors] = useState<DetectorReading[]>([]);
  const [hasActiveIncident, setHasActiveIncident] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  // Interactive telemetry & tracking state
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [telemetry, setTelemetry] = useState<VehicleTelemetry | null>(null);
  const [isFollowingVehicle, setIsFollowingVehicle] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  // Animation frame loop
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const accumulatorRef = useRef<number>(0);
  const lastUIUpdateRef = useRef<number>(0);
  const lastTrajectoryUpdateRef = useRef<number>(0);

  const updateSim = useCallback((now: number) => {
    const elapsedRealSec = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (isRunning) {
      // Substep physics loop: clamp elapsed real time to prevent spiral of death
      const clampedElapsed = Math.min(elapsedRealSec, 0.05);
      accumulatorRef.current += clampedElapsed * speedMultiplier;

      const dt = 0.1; // 10Hz fixed physics step
      let steps = 0;
      // Cap at 5 steps per animation frame to prevent physics blocking rendering at high speed
      while (accumulatorRef.current >= dt && steps < 5) {
        engineRef.current.step(dt);
        accumulatorRef.current -= dt;
        steps++;
      }
      if (accumulatorRef.current > dt * 2) {
        accumulatorRef.current = 0;
      }
      engineRef.current.subFrameSec = isRunning ? Math.min(dt, Math.max(0, accumulatorRef.current)) : 0;

      // Throttle numeric metrics updates to 10Hz (every 100ms)
      if (now - lastUIUpdateRef.current >= 100) {
        lastUIUpdateRef.current = now;
        setSimTime(engineRef.current.time);
        setVehicleCount(engineRef.current.vehicles.length);
        setDiagnosis(engineRef.current.getDiagnosis());
        setDetectors(engineRef.current.getDetectorReadings());
        setHasActiveIncident(engineRef.current.hasActiveIncident());
      }

      // Throttle heavy trajectory array copying to 4Hz (every 250ms) to eliminate GC lag at 5x speed
      if (now - lastTrajectoryUpdateRef.current >= 250) {
        lastTrajectoryUpdateRef.current = now;
        setTrajectories(engineRef.current.getTrajectories());
      }
    }

    requestRef.current = requestAnimationFrame(updateSim);
  }, [isRunning, speedMultiplier]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(updateSim);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [updateSim]);

  // Sync inspected vehicle telemetry with simulation time updates
  useEffect(() => {
    if (selectedVehicleId !== null) {
      const telem = engineRef.current.getVehicleTelemetry(selectedVehicleId);
      if (telem) {
        setTelemetry(telem);
      }
    } else {
      setTelemetry(null);
      setIsFollowingVehicle(false);
    }
  }, [selectedVehicleId, simTime]);

  // Handlers
  const handleSelectScenario = (type: ScenarioType) => {
    setScenarioType(type);
    engineRef.current.setScenario(type);
    setParams({ ...engineRef.current.params });
    setSimTime(0);
    setSelectedVehicleId(null);
    setIsFollowingVehicle(false);
  };

  const handleTogglePlay = () => {
    setIsRunning((prev) => !prev);
  };

  const handleReset = () => {
    engineRef.current.reset();
    setSimTime(0);
    setVehicleCount(engineRef.current.vehicles.length);
    setDiagnosis(engineRef.current.getDiagnosis());
    setTrajectories([]);
    setDetectors(engineRef.current.getDetectorReadings());
    setHasActiveIncident(false);
    setSelectedVehicleId(null);
    setIsFollowingVehicle(false);
  };

  const handleChangeParams = (newParams: Partial<SimulationParams>) => {
    engineRef.current.params = { ...engineRef.current.params, ...newParams };
    setParams({ ...engineRef.current.params });
  };

  const handleTriggerPhantomBrake = () => {
    engineRef.current.triggerPhantomBrake();
  };

  const handleToggleIncident = () => {
    engineRef.current.toggleIncident();
    setHasActiveIncident(engineRef.current.hasActiveIncident());
  };

  const handleInduceBrake = (id: number) => {
    engineRef.current.induceVehicleBrake(id);
  };

  const handleSpawnSpeeder = () => {
    const speeder = engineRef.current.spawnSpeeder();
    setSelectedVehicleId(speeder.id);
    setIsFollowingVehicle(true);
    if (!isRunning) {
      setIsRunning(true);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsRunning((prev) => !prev);
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      } else if (e.key === 's' || e.key === 'S') {
        handleSpawnSpeeder();
      } else if (e.key === '1') {
        handleSelectScenario('lane_drop');
      } else if (e.key === '2') {
        handleSelectScenario('on_ramp');
      } else if (e.key === '3') {
        handleSelectScenario('phantom_jam');
      } else if (e.key === '4') {
        handleSelectScenario('accident');
      } else if (e.key === 'b' || e.key === 'B') {
        handleTriggerPhantomBrake();
      } else if (e.key === 'Escape') {
        setSelectedVehicleId(null);
        setIsFollowingVehicle(false);
        setIsShortcutsOpen(false);
      } else if (e.key === '?') {
        setIsShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentScenarioInfo = SCENARIOS[scenarioType];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Top Navigation & Status */}
      <Header
        currentScenario={scenarioType}
        onSelectScenario={handleSelectScenario}
        simTime={simTime}
        vehicleCount={vehicleCount}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 p-4 md:p-6 flex flex-col gap-5 max-w-[1700px] w-full mx-auto">
        {/* Scenario description & theory helper banner */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-semibold text-slate-200">{currentScenarioInfo.title}:</span>
            <span className="text-slate-400">{currentScenarioInfo.description}</span>
          </div>

          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all font-medium cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
            <span>{showExplanation ? '收起相變機制' : '查看相變與消散理論'}</span>
          </button>
        </div>

        {/* Collapsible Theoretical Mechanism Card */}
        {showExplanation && (
          <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-4 text-xs space-y-2 text-slate-300 animate-fadeIn">
            <div className="flex gap-2">
              <span className="font-bold text-amber-400 shrink-0">• 開始塞車條件：</span>
              <span>{currentScenarioInfo.explanation.triggerCondition}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-rose-400 shrink-0">• 持續延時機制：</span>
              <span>{currentScenarioInfo.explanation.durationMechanism}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-emerald-400 shrink-0">• 緩解消散條件：</span>
              <span>{currentScenarioInfo.explanation.clearanceCondition}</span>
            </div>
          </div>
        )}

        {/* Vertically Stacked Canvas Views (Extended Highway Length) */}
        <div className="flex flex-col gap-4">
          {/* 2D Dual-View Highway: Full Overview Minimap with Loupe + 1:1 Isotropic Microscopic Detail */}
          <div className="flex flex-col gap-2">
            <HighwayCanvas
              engine={engineRef.current}
              road={engineRef.current.road}
              vehicles={engineRef.current.vehicles}
              scenarioType={scenarioType}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              isFollowing={isFollowingVehicle}
              onToggleFollow={() => setIsFollowingVehicle(!isFollowingVehicle)}
              simTime={simTime}
              diagnosis={diagnosis}
            />
          </div>

          {/* Interactive Vehicle Telemetry Inspector HUD */}
          {selectedVehicleId !== null && (
            <VehicleInspector
              telemetry={telemetry}
              isFollowing={isFollowingVehicle}
              onToggleFollow={() => setIsFollowingVehicle(!isFollowingVehicle)}
              onInduceBrake={handleInduceBrake}
              onClose={() => {
                setSelectedVehicleId(null);
                setIsFollowingVehicle(false);
              }}
            />
          )}

          {/* Space-Time Trajectory Diagram View (Full Width) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>【視圖 2】全線時空軌跡圖 (Space-Time Trajectory Diagram)</span>
              </span>
              <span className="text-[11px] text-slate-500 font-normal">X 軸為模擬時間 (t)，Y 軸為道路里程 (x)，紅粉虛線為理論逆行衝擊波斜率</span>
            </div>
            <SpaceTimeCanvas
              trajectories={trajectories}
              currentTime={simTime}
              roadLength={engineRef.current.road.length}
              bottleneckX={engineRef.current.road.lanes.find((l) => l.dropStart)?.dropStart}
              selectedVehicleId={selectedVehicleId}
            />
          </div>
        </div>

        {/* Quantitative Diagnosis & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Traffic Phase Diagnosis & Quantitative Metrics */}
          <div className="lg:col-span-7">
            <AnalyticsPanel diagnosis={diagnosis} detectors={detectors} />
          </div>

          {/* Interactive Controls & Interventions */}
          <div className="lg:col-span-5">
            <ControlPanel
              isRunning={isRunning}
              onTogglePlay={handleTogglePlay}
              speedMultiplier={speedMultiplier}
              onChangeSpeed={setSpeedMultiplier}
              onReset={handleReset}
              params={params}
              onChangeParams={handleChangeParams}
              onTriggerPhantomBrake={handleTriggerPhantomBrake}
              onToggleIncident={handleToggleIncident}
              hasActiveIncident={hasActiveIncident}
              onSpawnSpeeder={handleSpawnSpeeder}
            />
          </div>
        </div>
      </main>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
};
