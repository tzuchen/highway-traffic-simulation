import React, { useRef, useEffect, useState, useCallback } from 'react';
import { OverviewRenderer, OverviewLoupeState } from '../renderers/OverviewRenderer';
import { DetailedHighwayRenderer } from '../renderers/DetailedHighwayRenderer';
import { RoadConfig, Vehicle, ScenarioType, CongestionDiagnosis } from '../sim/types';
import { SimulationEngine } from '../sim/simulation';
import { getBallisticDisplacement } from '../sim/idm';
import { Crosshair, AlertTriangle, ArrowRightLeft, RotateCcw, ZoomIn } from 'lucide-react';

interface HighwayCanvasProps {
  engine?: SimulationEngine;
  road: RoadConfig;
  vehicles: Vehicle[];
  scenarioType: ScenarioType;
  selectedVehicleId?: number | null;
  onSelectVehicle?: (id: number | null) => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  simTime?: number;
  diagnosis?: CongestionDiagnosis | null;
}

export const HighwayCanvas: React.FC<HighwayCanvasProps> = ({
  engine,
  road,
  vehicles,
  scenarioType,
  selectedVehicleId = null,
  onSelectVehicle,
  isFollowing = false,
  onToggleFollow,
  simTime = 0,
  diagnosis = null,
}) => {
  // UI Display State for window indicator
  const [windowM, setWindowM] = useState<number>(250);
  const [displayRange, setDisplayRange] = useState<{ start: number; end: number }>({ start: 875, end: 1125 });

  // Canvas Refs
  const overviewContainerRef = useRef<HTMLDivElement>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overviewRendererRef = useRef<OverviewRenderer | null>(null);

  const detailedContainerRef = useRef<HTMLDivElement>(null);
  const detailedCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailedRendererRef = useRef<DetailedHighwayRenderer | null>(null);

  // Smooth Camera Physics Tracking (in meters)
  const currentCenterMRef = useRef<number>(1000);
  const targetCenterMRef = useRef<number>(1000);
  const windowMRef = useRef<number>(250);
  const isDraggingLoupeRef = useRef<boolean>(false);
  const dragStartPointerMRef = useRef<number>(0);
  const dragStartCenterMRef = useRef<number>(0);

  // Detailed Canvas Pan State
  const isPanningDetailRef = useRef<boolean>(false);
  const detailPanStartRef = useRef<{ x: number; centerM: number }>({ x: 0, centerM: 0 });
  const detailPanDistRef = useRef<number>(0);

  // Props Ref for 60 FPS animation loop to avoid re-binding
  const latestPropsRef = useRef({
    engine,
    road,
    vehicles,
    scenarioType,
    selectedVehicleId,
    onSelectVehicle,
    isFollowing,
    simTime,
    diagnosis,
  });

  useEffect(() => {
    latestPropsRef.current = {
      engine,
      road,
      vehicles,
      scenarioType,
      selectedVehicleId,
      onSelectVehicle,
      isFollowing,
      simTime,
      diagnosis,
    };
  });

  // 1. Initialize Renderers & Window Resize Handlers
  useEffect(() => {
    if (!overviewCanvasRef.current || !detailedCanvasRef.current) return;

    const ovRenderer = new OverviewRenderer(overviewCanvasRef.current);
    overviewRendererRef.current = ovRenderer;

    const dtRenderer = new DetailedHighwayRenderer(detailedCanvasRef.current);
    detailedRendererRef.current = dtRenderer;

    const handleResize = () => {
      if (overviewContainerRef.current && overviewCanvasRef.current) {
        ovRenderer.resize(overviewContainerRef.current.clientWidth, overviewContainerRef.current.clientHeight);
      }
      if (detailedContainerRef.current && detailedCanvasRef.current) {
        dtRenderer.resize(detailedContainerRef.current.clientWidth, detailedContainerRef.current.clientHeight);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. Scenario Switch: Snap to critical bottleneck location
  useEffect(() => {
    let initialCenter = 1000;
    const dropLane = road.lanes.find((l) => l.dropStart !== undefined);
    if (dropLane && dropLane.dropStart !== undefined) {
      initialCenter = dropLane.dropStart - 50;
    } else if (road.onRamp && road.onRamp.active) {
      initialCenter = (road.onRamp.start + road.onRamp.end) / 2;
    }

    const halfWin = windowMRef.current / 2;
    const clamped = Math.max(halfWin, Math.min(road.length - halfWin, initialCenter));
    targetCenterMRef.current = clamped;
    currentCenterMRef.current = clamped;
  }, [scenarioType, road]);

  // 3. Native 60 FPS (or 120 FPS) RequestAnimationFrame Render Loop
  // Eliminates 10Hz React state stepping and discrete jumping completely!
  useEffect(() => {
    let animId: number;
    let lastBadgeUpdate = 0;

    const renderLoop = (timestamp: number) => {
      const p = latestPropsRef.current;
      const curRoad = p.engine ? p.engine.road : p.road;
      const curVehicles = p.engine ? p.engine.vehicles : p.vehicles;
      const subFrameSec = p.engine ? p.engine.subFrameSec : 0;
      const roadLen = curRoad.length;
      const winM = windowMRef.current;
      const halfWin = winM / 2;

      // A. Follow Vehicle: track target smoothly
      if (p.isFollowing && p.selectedVehicleId !== null) {
        const followed = curVehicles.find((v) => v.id === p.selectedVehicleId);
        if (followed) {
          const interpX = followed.x + getBallisticDisplacement(followed.v, followed.a, subFrameSec);
          targetCenterMRef.current = interpX;
        }
      }

      // B. Smooth Camera Damping (Lerp): prevents abrupt viewport jumping
      if (!isDraggingLoupeRef.current && !isPanningDetailRef.current) {
        const diff = targetCenterMRef.current - currentCenterMRef.current;
        if (p.isFollowing && Math.abs(diff) < 2.0) {
          // Rigidly lock to followed vehicle once within range to eliminate camera follow shake
          currentCenterMRef.current = targetCenterMRef.current;
        } else if (Math.abs(diff) > 0.005) {
          currentCenterMRef.current += diff * 0.18; // Smooth 60 FPS exponential damping
        } else {
          currentCenterMRef.current = targetCenterMRef.current;
        }
      }

      // Clamp center within road bounds
      const clampedCenterM = Math.max(halfWin, Math.min(roadLen - halfWin, currentCenterMRef.current));
      currentCenterMRef.current = clampedCenterM;

      const windowStartM = Math.max(0, Math.min(roadLen - winM, clampedCenterM - halfWin));
      const windowEndM = windowStartM + winM;

      const loupeState: OverviewLoupeState = {
        centerM: clampedCenterM,
        windowM: winM,
        isDragging: isDraggingLoupeRef.current,
      };

      // C. Render Overview Canvas (0-2000m)
      if (overviewRendererRef.current) {
        overviewRendererRef.current.selectedVehicleId = p.selectedVehicleId;
        overviewRendererRef.current.render(curRoad, curVehicles, loupeState, p.diagnosis, subFrameSec);
      }

      // D. Render Detailed 1:1 Isotropic Canvas
      if (detailedRendererRef.current) {
        detailedRendererRef.current.selectedVehicleId = p.selectedVehicleId;
        detailedRendererRef.current.render(curRoad, curVehicles, windowStartM, windowEndM, p.simTime, subFrameSec);
      }

      // Throttle badge text updates to 10Hz to avoid React re-renders
      if (timestamp - lastBadgeUpdate > 100) {
        lastBadgeUpdate = timestamp;
        setDisplayRange({
          start: Math.round(windowStartM),
          end: Math.round(windowEndM),
        });
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 4. Overview Canvas Pointer Handlers (Draggable Loupe Window)
  const handleOverviewPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!overviewCanvasRef.current || !overviewRendererRef.current) return;
    const rect = overviewCanvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const roadLen = road.length;
    const clickedM = overviewRendererRef.current.getMeterAtScreenX(screenX, roadLen, rect.width);

    const loupeState: OverviewLoupeState = {
      centerM: currentCenterMRef.current,
      windowM: windowMRef.current,
      isDragging: true,
    };
    const loupeRect = overviewRendererRef.current.getLoupeRect(loupeState, roadLen, rect.width);
    const isInsideLoupe = screenX >= loupeRect.x && screenX <= loupeRect.x + loupeRect.width;

    isDraggingLoupeRef.current = true;
    dragStartPointerMRef.current = clickedM;
    dragStartCenterMRef.current = currentCenterMRef.current;

    // If clicked outside the loupe box, jump camera target immediately
    if (!isInsideLoupe) {
      const halfWin = windowMRef.current / 2;
      const newCenter = Math.max(halfWin, Math.min(roadLen - halfWin, clickedM));
      dragStartCenterMRef.current = newCenter;
      targetCenterMRef.current = newCenter;
      currentCenterMRef.current = newCenter;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleOverviewPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingLoupeRef.current || !overviewCanvasRef.current || !overviewRendererRef.current) return;
    const rect = overviewCanvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const roadLen = road.length;
    const currentM = overviewRendererRef.current.getMeterAtScreenX(screenX, roadLen, rect.width);

    const deltaM = currentM - dragStartPointerMRef.current;
    const halfWin = windowMRef.current / 2;
    const newCenter = Math.max(halfWin, Math.min(roadLen - halfWin, dragStartCenterMRef.current + deltaM));

    targetCenterMRef.current = newCenter;
    currentCenterMRef.current = newCenter; // 1:1 direct responsiveness during manual drag
  };

  const handleOverviewPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingLoupeRef.current) {
      isDraggingLoupeRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
    }
  };

  // 5. Detailed Canvas Mouse Handlers (Click vehicle or Pan window)
  const handleDetailMouseDown = (e: React.MouseEvent) => {
    isPanningDetailRef.current = true;
    detailPanDistRef.current = 0;
    detailPanStartRef.current = { x: e.clientX, centerM: currentCenterMRef.current };
  };

  const handleDetailMouseMove = (e: React.MouseEvent) => {
    if (isPanningDetailRef.current && detailedCanvasRef.current && detailedRendererRef.current) {
      const dx = e.clientX - detailPanStartRef.current.x;
      detailPanDistRef.current = Math.abs(dx);

      const usableW = Math.max(10, detailedCanvasRef.current.width / window.devicePixelRatio - 2 * detailedRendererRef.current.marginX);
      const scale = usableW / windowMRef.current;
      const deltaM = -dx / scale;

      const halfWin = windowMRef.current / 2;
      const newCenter = Math.max(halfWin, Math.min(road.length - halfWin, detailPanStartRef.current.centerM + deltaM));

      targetCenterMRef.current = newCenter;
      currentCenterMRef.current = newCenter;
      return;
    }

    // Hover detection for vehicles in detailed view
    if (detailedCanvasRef.current && detailedRendererRef.current) {
      const rect = detailedCanvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const halfWin = windowMRef.current / 2;
      const windowStartM = Math.max(0, Math.min(road.length - windowMRef.current, currentCenterMRef.current - halfWin));
      const windowEndM = windowStartM + windowMRef.current;

      const hovered = detailedRendererRef.current.getVehicleAt(mouseX, mouseY, road, vehicles, windowStartM, windowEndM);
      const newHoverId = hovered ? hovered.id : null;

      if (newHoverId !== detailedRendererRef.current.hoveredVehicleId) {
        detailedRendererRef.current.hoveredVehicleId = newHoverId;
        detailedCanvasRef.current.style.cursor = hovered ? 'pointer' : 'grab';
      }
    }
  };

  const handleDetailMouseUp = (e: React.MouseEvent) => {
    if (isPanningDetailRef.current) {
      if (detailPanDistRef.current < 5 && detailedCanvasRef.current && detailedRendererRef.current) {
        const rect = detailedCanvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const halfWin = windowMRef.current / 2;
        const windowStartM = Math.max(0, Math.min(road.length - windowMRef.current, currentCenterMRef.current - halfWin));
        const windowEndM = windowStartM + windowMRef.current;

        const clicked = detailedRendererRef.current.getVehicleAt(mouseX, mouseY, road, vehicles, windowStartM, windowEndM);
        if (onSelectVehicle) {
          onSelectVehicle(clicked ? clicked.id : null);
        }
      }
      isPanningDetailRef.current = false;
    }
  };

  // 6. Camera Preset Quick Navigation
  const handleFocusCongestion = () => {
    if (diagnosis && diagnosis.queueTailMeters !== null) {
      const halfWin = windowMRef.current / 2;
      targetCenterMRef.current = Math.max(halfWin, Math.min(road.length - halfWin, diagnosis.queueTailMeters));
    } else {
      const slowCars = vehicles.filter((v) => v.v * 3.6 < 45);
      if (slowCars.length > 0) {
        const halfWin = windowMRef.current / 2;
        targetCenterMRef.current = Math.max(halfWin, Math.min(road.length - halfWin, slowCars[0].x));
      }
    }
  };

  const handleFocusIncident = () => {
    const incidentCar = vehicles.find((v) => v.hasIncident);
    if (incidentCar) {
      const halfWin = windowMRef.current / 2;
      targetCenterMRef.current = Math.max(halfWin, Math.min(road.length - halfWin, incidentCar.x));
    }
  };

  const handleFocusBottleneck = () => {
    const dropLane = road.lanes.find((l) => l.dropStart !== undefined);
    if (dropLane && dropLane.dropStart !== undefined) {
      const halfWin = windowMRef.current / 2;
      targetCenterMRef.current = Math.max(halfWin, Math.min(road.length - halfWin, dropLane.dropStart));
    }
  };

  const handleResetToStart = () => {
    const halfWin = windowMRef.current / 2;
    targetCenterMRef.current = halfWin;
  };

  const handleChangeWindowSize = (newWinM: number) => {
    windowMRef.current = newWinM;
    setWindowM(newWinM);
    const halfWin = newWinM / 2;
    targetCenterMRef.current = Math.max(halfWin, Math.min(road.length - halfWin, currentCenterMRef.current));
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* 1. TOP DIAGRAM: Full Corridor Overview with Interactive Loupe */}
      <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-slate-200">【全路段概覽雷達圖】全線 0 – {road.length}m</span>
            <span className="text-[11px] text-slate-500 hidden md:inline">| 拖曳青色框或點擊任意里程，平滑移動放大鏡視窗</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-cyan-400">
            <span>🔍 觀察段: {displayRange.start}m – {displayRange.end}m (長度 {windowM}m)</span>
          </div>
        </div>

        <div className="relative w-full h-[95px] bg-slate-950 flex items-center" ref={overviewContainerRef}>
          <canvas
            ref={overviewCanvasRef}
            onPointerDown={handleOverviewPointerDown}
            onPointerMove={handleOverviewPointerMove}
            onPointerUp={handleOverviewPointerUp}
            className="block w-full h-full cursor-ew-resize select-none touch-none"
          />
        </div>
      </div>

      {/* 2. MIDDLE CONTROL BAR: Navigation Presets & Window Size Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/60 rounded-lg border border-slate-800/80 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400">平滑導航:</span>
          <button
            onClick={handleFocusCongestion}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-400 border border-amber-800/50 cursor-pointer transition-all text-[11px]"
            title="鏡頭平滑滑行至塞車波前排隊尾端"
          >
            <Crosshair className="w-3 h-3" />
            <span>塞車波前</span>
          </button>
          <button
            onClick={handleFocusIncident}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/50 cursor-pointer transition-all text-[11px]"
            title="鏡頭平滑滑行至事故障礙車輛"
          >
            <AlertTriangle className="w-3 h-3" />
            <span>突發事故</span>
          </button>
          <button
            onClick={handleFocusBottleneck}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 border border-blue-800/50 cursor-pointer transition-all text-[11px]"
            title="鏡頭平滑滑行至車道縮減瓶頸處"
          >
            <ArrowRightLeft className="w-3 h-3" />
            <span>縮減瓶頸</span>
          </button>
          <button
            onClick={handleResetToStart}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50 cursor-pointer transition-all text-[11px]"
            title="鏡頭平滑重置回道路起點"
          >
            <RotateCcw className="w-3 h-3" />
            <span>道路起點</span>
          </button>
        </div>

        {/* Observation Window Size Presets (Maintains 1:1 Isotropic Aspect Ratio) */}
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <ZoomIn className="w-3 h-3 text-cyan-400" />
            <span>微觀視野:</span>
          </span>
          {[150, 250, 350].map((size) => (
            <button
              key={size}
              onClick={() => handleChangeWindowSize(size)}
              className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-mono ${
                windowM === size
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold shadow-sm shadow-cyan-900/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {size}m {size === 150 ? '(特寫)' : size === 250 ? '(標準)' : '(廣角)'}
            </button>
          ))}
        </div>
      </div>

      {/* 3. BOTTOM DIAGRAM: Microscopic Detailed Highway (1:1 Isotropic Aspect Ratio) */}
      <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-200">【微觀等比例真實細部圖】橫縱 1:1 · 60 FPS 類比滑順渲染</span>
            <span className="text-[11px] text-emerald-400 font-mono hidden md:inline">
              (真實車道 3.75m · 小客車 4.5m × 1.8m · 車道線精確相位錨定)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-normal">
            點擊車輛檢視微觀數值 | 橫向拖曳亦可平移路段
          </div>
        </div>

        <div className="relative w-full h-[200px] bg-slate-950 flex items-center" ref={detailedContainerRef}>
          <canvas
            ref={detailedCanvasRef}
            onMouseDown={handleDetailMouseDown}
            onMouseMove={handleDetailMouseMove}
            onMouseUp={handleDetailMouseUp}
            onMouseLeave={handleDetailMouseUp}
            className="block w-full h-full cursor-grab active:cursor-grabbing"
          />
        </div>
      </div>
    </div>
  );
};
