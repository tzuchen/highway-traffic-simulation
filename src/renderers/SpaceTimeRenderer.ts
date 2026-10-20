import { TrajectoryPoint } from '../sim/types';

export class SpaceTimeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public selectedVehicleId: number | null = null;
  public showTheoreticalShockwave = true;
  public hoverCrosshair: { t: number; x: number } | null = null;

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

  public getTimeAndDistAt(
    screenX: number,
    screenY: number,
    currentTime: number,
    roadLength: number
  ): { t: number; x: number } | null {
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;
    const margin = { top: 25, right: 30, bottom: 35, left: 55 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    if (
      screenX < margin.left ||
      screenX > margin.left + plotWidth ||
      screenY < margin.top ||
      screenY > margin.top + plotHeight
    ) {
      return null;
    }

    const timeWindowSec = 120;
    const minTime = Math.max(0, currentTime - timeWindowSec);
    const t = minTime + ((screenX - margin.left) / plotWidth) * timeWindowSec;
    const x = ((margin.top + plotHeight - screenY) / plotHeight) * roadLength;

    return { t, x };
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

    // 2.5 Theoretical Shockwave Slope Guide (w = -15 km/h = -4.167 m/s)
    if (this.showTheoreticalShockwave && bottleneckX !== undefined) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);

      const shockwaveV = -4.167; // -15 km/h in m/s
      const firstOriginT = Math.floor(minTime / 30) * 30;
      for (let t0 = firstOriginT; t0 <= maxTime; t0 += 30) {
        const dt = 80;
        const tEnd = t0 + dt;
        const xEnd = bottleneckX + shockwaveV * dt;

        if (tEnd >= minTime && t0 <= maxTime) {
          const sx = getX(t0);
          const sy = getY(bottleneckX);
          const ex = getX(tEnd);
          const ey = getY(xEnd);

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 3. Draw Vehicle Trajectories (High-performance Batched Strokes)
    const redLines: number[] = [];
    const orangeLines: number[] = [];
    const yellowLines: number[] = [];
    const greenLines: number[] = [];

    // Group trajectory points by vehicleId
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

    // 3.5 Linked Selected Vehicle Trajectory (Neon Cyan Highlight)
    if (this.selectedVehicleId !== null) {
      const selectedPts = vehicleTracks.get(this.selectedVehicleId);
      if (selectedPts && selectedPts.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 3.2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < selectedPts.length - 1; i++) {
          const p1 = selectedPts[i];
          const p2 = selectedPts[i + 1];
          if (p2.time - p1.time > 2.0) continue;
          const x1 = getX(p1.time);
          const y1 = getY(p1.x);
          const x2 = getX(p2.time);
          const y2 = getY(p2.x);
          if (!started) {
            ctx.moveTo(x1, y1);
            started = true;
          }
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();

        // Marker dot at latest trajectory point
        const lastPt = selectedPts[selectedPts.length - 1];
        const headX = getX(lastPt.time);
        const headY = getY(lastPt.x);
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(headX, headY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`🚗 #${this.selectedVehicleId} (${Math.round(lastPt.speedKmh)} km/h)`, headX + 8, headY - 4);
        ctx.restore();
      }
    }

    // 3.8 Hover Crosshair
    if (this.hoverCrosshair) {
      const { t, x } = this.hoverCrosshair;
      if (t >= minTime && t <= maxTime && x >= 0 && x <= roadLength) {
        const hX = getX(t);
        const hY = getY(x);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(hX, margin.top);
        ctx.lineTo(hX, margin.top + plotHeight);
        ctx.stroke();

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(margin.left, hY);
        ctx.lineTo(margin.left + plotWidth, hY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Coordinate tooltip badge
        const badgeText = `t: ${t.toFixed(1)}s | x: ${Math.round(x)}m`;
        ctx.font = '10px monospace';
        const badgeW = ctx.measureText(badgeText).width + 14;
        const badgeH = 20;
        const badgeX = Math.min(width - margin.right - badgeW, Math.max(margin.left, hX + 8));
        const badgeY = Math.max(margin.top + 4, Math.min(margin.top + plotHeight - badgeH - 4, hY - 26));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(badgeText, badgeX + 7, badgeY + 14);
        ctx.restore();
      }
    }

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
    ctx.fillText('■ 順暢 >75km/h', width - margin.right - 260, margin.top - 8);
    ctx.fillStyle = '#eab308';
    ctx.fillText('■ 減速 45-75', width - margin.right - 180, margin.top - 8);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('■ 壅塞 <20', width - margin.right - 110, margin.top - 8);
    ctx.fillStyle = '#f43f5e';
    ctx.fillText('-- 理論衝擊波 (-15km/h)', width - margin.right, margin.top - 8);
  }
}

