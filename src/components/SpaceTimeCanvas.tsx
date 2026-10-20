import React, { useRef, useEffect, useState } from 'react';
import { SpaceTimeRenderer } from '../renderers/SpaceTimeRenderer';
import { TrajectoryPoint } from '../sim/types';
import { Activity } from 'lucide-react';

interface SpaceTimeCanvasProps {
  trajectories: TrajectoryPoint[];
  currentTime: number;
  roadLength: number;
  bottleneckX?: number;
  selectedVehicleId?: number | null;
}

export const SpaceTimeCanvas: React.FC<SpaceTimeCanvasProps> = ({
  trajectories,
  currentTime,
  roadLength,
  bottleneckX,
  selectedVehicleId = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SpaceTimeRenderer | null>(null);
  const [showShockwave, setShowShockwave] = useState(true);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const renderer = new SpaceTimeRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      renderer.resize(width, height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.selectedVehicleId = selectedVehicleId ?? null;
    rendererRef.current.showTheoreticalShockwave = showShockwave;
    rendererRef.current.render(trajectories, currentTime, roadLength, bottleneckX);
  }, [trajectories, currentTime, roadLength, bottleneckX, selectedVehicleId, showShockwave]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rendererRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const pt = rendererRef.current.getTimeAndDistAt(screenX, screenY, currentTime, roadLength);
    rendererRef.current.hoverCrosshair = pt;
    rendererRef.current.render(trajectories, currentTime, roadLength, bottleneckX);
  };

  const handleMouseLeave = () => {
    if (!rendererRef.current) return;
    rendererRef.current.hoverCrosshair = null;
    rendererRef.current.render(trajectories, currentTime, roadLength, bottleneckX);
  };

  return (
    <div
      className="relative w-full h-[280px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner"
      ref={containerRef}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full cursor-crosshair"
      />

      <div className="absolute top-2.5 left-3 text-[10px] text-slate-400 font-mono pointer-events-none flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        <span>時空軌跡圖 (Space-Time Trajectory) | 滑鼠移入可查看精確 (t, x) 坐標 | 點擊上方車輛可在此同步高亮軌跡</span>
      </div>

      <div className="absolute top-2 right-3 flex items-center gap-2">
        <button
          onClick={() => setShowShockwave(!showShockwave)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono transition-all border cursor-pointer ${
            showShockwave
              ? 'bg-rose-950/60 border-rose-800/80 text-rose-300'
              : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="顯示/隱藏理論 LWR 衝擊波逆傳斜率參考線 (w ≈ -15 km/h)"
        >
          <Activity className="w-3 h-3 text-rose-400" />
          <span>理論衝擊波斜率 {showShockwave ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
};
