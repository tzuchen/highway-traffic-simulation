import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationEngine, SimulationParams } from './sim/simulation';
import { ScenarioType, CongestionDiagnosis, TrajectoryPoint, DetectorReading } from './sim/types';
import { SCENARIOS } from './sim/scenarios';
import { Header } from './components/Header';
import { HighwayCanvas } from './components/HighwayCanvas';
import { SpaceTimeCanvas } from './components/SpaceTimeCanvas';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { ControlPanel } from './components/ControlPanel';
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

  // Animation frame loop
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const accumulatorRef = useRef<number>(0);

  const updateSim = useCallback((now: number) => {
    const elapsedRealSec = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (isRunning) {
      // Substep physics loop: clamp elapsed real time to prevent spiral of death
      const clampedElapsed = Math.min(elapsedRealSec, 0.1);
      accumulatorRef.current += clampedElapsed * speedMultiplier;

      const dt = 0.1; // 10Hz fixed physics step
      while (accumulatorRef.current >= dt) {
        engineRef.current.step(dt);
        accumulatorRef.current -= dt;
      }

      // Sync React state for dashboard
      setSimTime(engineRef.current.time);
      setVehicleCount(engineRef.current.vehicles.length);
      setDiagnosis(engineRef.current.getDiagnosis());
      setTrajectories([...engineRef.current.getTrajectories()]);
      setDetectors(engineRef.current.getDetectorReadings());
      setHasActiveIncident(engineRef.current.hasActiveIncident());
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

  // Handlers
  const handleSelectScenario = (type: ScenarioType) => {
    setScenarioType(type);
    engineRef.current.setScenario(type);
    setParams({ ...engineRef.current.params });
    setSimTime(0);
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

  const currentScenarioInfo = SCENARIOS[scenarioType];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-y-auto">
      {/* 1. Top Navigation & Status */}
      <Header
        currentScenario={scenarioType}
        onSelectScenario={handleSelectScenario}
        simTime={simTime}
        vehicleCount={vehicleCount}
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all font-medium"
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

        {/* Dual Canvas Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 2D Highway Top-down View */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>【視圖 1】2D 高速公路俯視動態 (微觀車流 / 尾燈煞車)</span>
              <span className="text-[11px] text-slate-500 font-normal">綠:暢通 / 黃:微緩 / 橘紅:壅塞停滯</span>
            </div>
            <HighwayCanvas road={engineRef.current.road} vehicles={engineRef.current.vehicles} />
          </div>

          {/* Space-Time Diagram View */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>【視圖 2】時空軌跡圖 (Space-Time Diagram)</span>
              <span className="text-[11px] text-slate-500 font-normal">X 軸為時間，Y 軸為里程，逆流波清晰可見</span>
            </div>
            <SpaceTimeCanvas
              trajectories={trajectories}
              currentTime={simTime}
              roadLength={engineRef.current.road.length}
              bottleneckX={engineRef.current.road.lanes.find((l) => l.dropStart)?.dropStart}
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
            />
          </div>
        </div>
      </main>
    </div>
  );
};
