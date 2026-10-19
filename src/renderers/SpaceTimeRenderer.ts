import { TrajectoryPoint } from '../sim/types';

export class SpaceTimeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  public render(
    trajectories: TrajectoryPoint[],
    currentTime: number,
    roadLength: number,
    bottleneckX?: number
  ): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    const margin = { top: 25, right: 30, bottom: 35, left: 55 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(margin.left, margin.top, plotWidth, plotHeight);

    // Time window: past 120 seconds
    const timeWindowSec = 120;
    const minTime = Math.max(0, currentTime - timeWindowSec);
    const maxTime = minTime + timeWindowSec;

    // Coordinate mapping functions
    const getX = (t: number) => margin.left + ((t - minTime) / timeWindowSec) * plotWidth;
    // Y-axis: 0m at bottom, roadLength at top
    const getY = (dist: number) => margin.top + plotHeight - (dist / roadLength) * plotHeight;

    // 1. Grid Lines & Axis Ticks
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Distance ticks (every 400m)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let d = 0; d <= roadLength; d += 400) {
      const y = getY(d);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotWidth, y);
      ctx.stroke();
      ctx.fillText(`${d}m`, margin.left - 8, y + 3);
    }

    // Time ticks (every 20s)
    ctx.textAlign = 'center';
    for (let t = Math.ceil(minTime / 20) * 20; t <= maxTime; t += 20) {
      const x = getX(t);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + plotHeight);
      ctx.stroke();
      ctx.fillText(`${Math.round(t)}s`, x, margin.top + plotHeight + 16);
    }

    // 2. Bottleneck Marker Line (e.g. 1300m)
    if (bottleneckX !== undefined) {
      const bY = getY(bottleneckX);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, bY);
      ctx.lineTo(margin.left + plotWidth, bY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`瓶頸縮減點 (${bottleneckX}m)`, margin.left + 10, bY - 4);
    }

    // 3. Draw Vehicle Trajectories (High-performance Batched Strokes)
    const redLines: number[] = [];
    const orangeLines: number[] = [];
    const yellowLines: number[] = [];
    const greenLines: number[] = [];

    // Group trajectory points by vehicleId (points already arrived in chronological order)
    const vehicleTracks = new Map<number, TrajectoryPoint[]>();
    for (const pt of trajectories) {
      if (pt.time >= minTime && pt.time <= maxTime) {
        let list = vehicleTracks.get(pt.vehicleId);
        if (!list) {
          list = [];
          vehicleTracks.set(pt.vehicleId, list);
        }
        list.push(pt);
      }
    }

    for (const [, pts] of vehicleTracks) {
      if (pts.length < 2) continue;

      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];

        // If time jump too large (despawn / wrap), skip
        if (p2.time - p1.time > 2.0) continue;

        const x1 = getX(p1.time);
        const y1 = getY(p1.x);
        const x2 = getX(p2.time);
        const y2 = getY(p2.x);

        const avgSpeed = (p1.speedKmh + p2.speedKmh) / 2;

        if (avgSpeed < 20) {
          redLines.push(x1, y1, x2, y2);
        } else if (avgSpeed < 45) {
          orangeLines.push(x1, y1, x2, y2);
        } else if (avgSpeed < 75) {
          yellowLines.push(x1, y1, x2, y2);
        } else {
          greenLines.push(x1, y1, x2, y2);
        }
      }
    }

    // Helper to draw a batch of lines in a single GPU call
    const drawBatch = (coords: number[], color: string, lineWidth: number) => {
      if (coords.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < coords.length; i += 4) {
        ctx.moveTo(coords[i], coords[i + 1]);
        ctx.lineTo(coords[i + 2], coords[i + 3]);
      }
      ctx.stroke();
    };

    drawBatch(greenLines, '#10b981', 1.0);
    drawBatch(yellowLines, '#eab308', 1.2);
    drawBatch(orangeLines, '#f97316', 1.6);
    drawBatch(redLines, '#ef4444', 2.2);

    // 4. Plot Border & Titles
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(margin.left, margin.top, plotWidth, plotHeight);

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('模擬時間 (t / 秒)', margin.left + plotWidth / 2, height - 6);

    ctx.save();
    ctx.translate(16, margin.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('高速公路里程 (x / 公尺)', 0, 0);
    ctx.restore();

    // Legend badge
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#10b981';
    ctx.fillText('■ 順暢 >75km/h', width - margin.right - 180, margin.top - 8);
    ctx.fillStyle = '#eab308';
    ctx.fillText('■ 減速 45-75', width - margin.right - 100, margin.top - 8);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('■ 壅塞 <20 (波前)', width - margin.right, margin.top - 8);
  }
}
