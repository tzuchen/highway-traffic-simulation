import React, { useRef, useEffect } from 'react';
import { HighwayRenderer } from '../renderers/HighwayRenderer';
import { RoadConfig, Vehicle } from '../sim/types';
import { Maximize2, ZoomIn, ZoomOut, MoveHorizontal, Crosshair } from 'lucide-react';

interface HighwayCanvasProps {
  road: RoadConfig;
  vehicles: Vehicle[];
}

export const HighwayCanvas: React.FC<HighwayCanvasProps> = ({ road, vehicles }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HighwayRenderer | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const startOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const renderer = new HighwayRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      renderer.resize(width, height);
      renderer.fitToRoad(road.length, road.numLanes, width, height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [road.length, road.numLanes]);

  // Render loop triggered when props update
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.render(road, vehicles);
  }, [road, vehicles]);

  const handleZoom = (factor: number) => {
    if (!rendererRef.current) return;
    rendererRef.current.zoom(factor);
    rendererRef.current.render(road, vehicles);
  };

  const handleResetView = () => {
    if (!rendererRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    rendererRef.current.fitToRoad(road.length, road.numLanes, width, height);
    rendererRef.current.render(road, vehicles);
  };

  const handleFocusCongestion = () => {
    if (!rendererRef.current || !containerRef.current) return;
    // Find slow vehicle cluster or bottleneck
    const slowCars = vehicles.filter((v) => v.v * 3.6 < 45);
    const targetX = slowCars.length > 0 ? slowCars[0].x : 1300; // Bottleneck at 1300m
    const width = containerRef.current.clientWidth;
    rendererRef.current.focusOnLocation(targetX, width);
    rendererRef.current.render(road, vehicles);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    if (rendererRef.current) {
      startOffsetRef.current = { x: rendererRef.current.offsetX, y: rendererRef.current.offsetY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !rendererRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    rendererRef.current.offsetX = startOffsetRef.current.x + dx;
    rendererRef.current.offsetY = startOffsetRef.current.y + dy;
    rendererRef.current.render(road, vehicles);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom when Ctrl or Meta (Cmd) key is pressed, allowing natural page scroll otherwise
    if (!rendererRef.current || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    rendererRef.current.zoom(factor);
    rendererRef.current.render(road, vehicles);
  };

  return (
    <div
      className="relative w-full h-[220px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col justify-center"
      ref={containerRef}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating Canvas Controls */}
      <div className="absolute top-3 right-3 flex items-center space-x-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 backdrop-blur-md">
        <button
          onClick={() => handleZoom(1.25)}
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          title="放大視角 (拉近細節)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          title="縮小視角 (最多還原至全路段)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleFocusCongestion}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-400 hover:bg-amber-950/60 transition-all cursor-pointer border border-amber-900/50"
          title="鏡頭自動追蹤塞車波前 / 瓶頸段"
        >
          <Crosshair className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-medium hidden sm:inline">聚焦塞車段</span>
        </button>
        <button
          onClick={handleResetView}
          className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          title="重置全路段全景"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-2 left-3 flex items-center gap-2 text-[10px] text-slate-500 font-mono pointer-events-none">
        <MoveHorizontal className="w-3 h-3 text-slate-400" />
        <span>雙向三車道主線走廊 (2.4 km) | 橫向真實車距防重疊 | 可拖曳平移</span>
      </div>
    </div>
  );
};
