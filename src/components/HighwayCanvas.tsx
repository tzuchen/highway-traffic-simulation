import React, { useRef, useEffect } from 'react';
import { HighwayRenderer } from '../renderers/HighwayRenderer';
import { RoadConfig, Vehicle } from '../sim/types';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

interface HighwayCanvasProps {
  road: RoadConfig;
  vehicles: Vehicle[];
}

export const HighwayCanvas: React.FC<HighwayCanvasProps> = ({ road, vehicles }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HighwayRenderer | null>(null);

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
    rendererRef.current.scale = Math.max(0.2, Math.min(2.5, rendererRef.current.scale * factor));
    rendererRef.current.render(road, vehicles);
  };

  const handleResetView = () => {
    if (!rendererRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    rendererRef.current.fitToRoad(road.length, road.numLanes, width, height);
    rendererRef.current.render(road, vehicles);
  };

  return (
    <div className="relative w-full h-[220px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col justify-center" ref={containerRef}>
      <canvas ref={canvasRef} className="block w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Canvas Controls */}
      <div className="absolute top-3 right-3 flex items-center space-x-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 backdrop-blur-md">
        <button
          onClick={() => handleZoom(1.2)}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="縮小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
          title="重置全景"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 font-mono pointer-events-none">
        雙向三車道主線走廊 (2.4 km) | 俯視即時渲染
      </div>
    </div>
  );
};
