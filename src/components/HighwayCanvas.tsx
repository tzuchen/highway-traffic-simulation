import React, { useRef, useEffect } from 'react';
import { HighwayRenderer } from '../renderers/HighwayRenderer';
import { RoadConfig, Vehicle } from '../sim/types';
import { Maximize2, ZoomIn, ZoomOut, MoveHorizontal } from 'lucide-react';

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
    if (!rendererRef.current || !containerRef.current) return;
    rendererRef.current.scale = Math.max(0.2, Math.min(3.0, rendererRef.current.scale * factor));
    rendererRef.current.render(road, vehicles);
  };

  const handleResetView = () => {
    if (!rendererRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    rendererRef.current.fitToRoad(road.length, road.numLanes, width, height);
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
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    rendererRef.current.scale = Math.max(0.15, Math.min(3.0, rendererRef.current.scale * factor));
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
          onClick={() => handleZoom(1.2)}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="放大視角"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="縮小視角"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="重置全路段視圖"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-2 left-3 flex items-center gap-2 text-[10px] text-slate-500 font-mono pointer-events-none">
        <MoveHorizontal className="w-3 h-3 text-slate-400" />
        <span>雙向三車道主線走廊 (2.4 km) | 橫向長車身長方形俯視 | 可拖曳平移與滾輪縮放</span>
      </div>
    </div>
  );
};
