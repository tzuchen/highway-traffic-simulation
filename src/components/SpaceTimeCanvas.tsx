import React, { useRef, useEffect } from 'react';
import { SpaceTimeRenderer } from '../renderers/SpaceTimeRenderer';
import { TrajectoryPoint } from '../sim/types';

interface SpaceTimeCanvasProps {
  trajectories: TrajectoryPoint[];
  currentTime: number;
  roadLength: number;
  bottleneckX?: number;
}

export const SpaceTimeCanvas: React.FC<SpaceTimeCanvasProps> = ({
  trajectories,
  currentTime,
  roadLength,
  bottleneckX,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SpaceTimeRenderer | null>(null);

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
    rendererRef.current.render(trajectories, currentTime, roadLength, bottleneckX);
  }, [trajectories, currentTime, roadLength, bottleneckX]);

  return (
    <div className="relative w-full h-[280px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner" ref={containerRef}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-2 left-3 text-[10px] text-slate-500 font-mono pointer-events-none">
        時空軌跡圖 (Space-Time Trajectory Diagram) | 車流斜率代表即時車速，向下傾斜密集條帶代表逆流傳播之衝擊波
      </div>
    </div>
  );
};
