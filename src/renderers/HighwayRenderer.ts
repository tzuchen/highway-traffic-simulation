import { RoadConfig, Vehicle } from '../sim/types';
import { SIM_CONSTANTS } from '../sim/constants';

export class HighwayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Viewport camera transform
  public offsetX = 0;
  public offsetY = 0;
  public scale = 0.55; // pixels per meter

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

  public fitToRoad(roadLength: number, roadLanes: number, canvasWidth: number, canvasHeight: number): void {
    const laneWidthPx = 36;
    const roadHeightPx = roadLanes * laneWidthPx;
    this.scale = Math.min((canvasWidth - 100) / roadLength, (canvasHeight - 60) / roadHeightPx);
    this.offsetX = 50;
    this.offsetY = (canvasHeight - roadHeightPx) / 2;
  }

  public render(road: RoadConfig, vehicles: Vehicle[]): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Background grass / landscape
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);

    const laneHeight = 36;
    const roadTotalHeight = road.numLanes * laneHeight;
    const roadWidthPx = road.length * this.scale;

    // 1. Road Asphalt Base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, roadWidthPx, roadTotalHeight);

    // Shoulder / Road Borders
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(roadWidthPx, 0);
    ctx.moveTo(0, roadTotalHeight);
    ctx.lineTo(roadWidthPx, roadTotalHeight);
    ctx.stroke();

    // 2. Lane markings
    for (let l = 1; l < road.numLanes; l++) {
      const y = l * laneHeight;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 16]); // Dashed white lines
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(roadWidthPx, y);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash

    // 3. Bottleneck / Dropped Lane Markings
    for (const lane of road.lanes) {
      if (lane.dropStart !== undefined && lane.dropEnd !== undefined) {
        const yTop = lane.index * laneHeight;
        const startPx = lane.dropStart * this.scale;
        const endPx = lane.dropEnd * this.scale;

        // Diagonal hazard stripes on closing zone
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(startPx, yTop, endPx - startPx, laneHeight);

        // Chevron warning signs
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        for (let x = startPx; x < endPx; x += 25) {
          ctx.beginPath();
          ctx.moveTo(x, yTop + laneHeight);
          ctx.lineTo(x + 15, yTop);
          ctx.stroke();
        }

        // Concrete barrier at dropEnd
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(endPx, yTop, 6, laneHeight);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('車道縮減 ⛔', endPx + 10, yTop + laneHeight / 2 + 4);
      }
    }

    // 4. On-Ramp Visualization (if active)
    if (road.onRamp && road.onRamp.active) {
      const rampStartPx = road.onRamp.start * this.scale;
      const rampEndPx = road.onRamp.end * this.scale;
      const rampY = road.numLanes * laneHeight;

      // Acceleration Lane base
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(rampStartPx - 40, rampY + 30);
      ctx.lineTo(rampStartPx, rampY + laneHeight);
      ctx.lineTo(rampEndPx, rampY);
      ctx.lineTo(rampStartPx, rampY);
      ctx.closePath();
      ctx.fill();

      // Yellow taper line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rampStartPx - 40, rampY + 30);
      ctx.lineTo(rampStartPx, rampY + laneHeight);
      ctx.lineTo(rampEndPx, rampY);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('匝道匯流 ↗', rampStartPx, rampY + 45);
    }

    // 5. Distance Milestone Ticks
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    for (let x = 0; x <= road.length; x += 400) {
      const xPx = x * this.scale;
      ctx.fillRect(xPx, roadTotalHeight + 4, 1, 6);
      ctx.fillText(`${x}m`, xPx - 12, roadTotalHeight + 22);
    }

    // 6. Draw Vehicles
    for (const v of vehicles) {
      const vX = (v.x - v.profile.length) * this.scale;
      const vY = v.y * laneHeight + (laneHeight - v.profile.width * 7) / 2;
      const vLen = Math.max(8, v.profile.length * this.scale);
      const vWidth = Math.max(6, v.profile.width * 7);

      // Color mapping by speed
      const speedKmh = v.v * 3.6;
      let bodyColor = '#10b981'; // Green: Free flow > 80 km/h
      if (speedKmh < 20) {
        bodyColor = '#ef4444'; // Red: Severe jam
      } else if (speedKmh < 45) {
        bodyColor = '#f97316'; // Orange: Congested
      } else if (speedKmh < 75) {
        bodyColor = '#eab308'; // Yellow: Moderate
      }

      if (v.hasIncident) {
        bodyColor = '#dc2626'; // Incident red
      }

      // Vehicle body
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(vX, vY, vLen, vWidth, 2);
      ctx.fill();

      // Windshield
      ctx.fillStyle = '#0f172a';
      const windshieldX = vX + vLen * 0.65;
      ctx.fillRect(windshieldX, vY + 1, vLen * 0.15, vWidth - 2);

      // Special vehicle badges
      if (v.type === 'truck') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.strokeRect(vX, vY, vLen, vWidth);
      } else if (v.type === 'acc') {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vX, vY, vLen, vWidth);
      }

      // Brake Lights (Glowing Red dots on rear)
      if (v.isBraking) {
        ctx.fillStyle = '#ff0033';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 6;
        ctx.fillRect(vX - 1, vY + 1, 2, 2.5);
        ctx.fillRect(vX - 1, vY + vWidth - 3.5, 2, 2.5);
        ctx.shadowBlur = 0; // Reset blur
      }

      // Headlights (Light beam on front)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(vX + vLen - 1, vY + 1, 2, 2);
      ctx.fillRect(vX + vLen - 1, vY + vWidth - 3, 2, 2);

      // Incident warning triangle
      if (v.hasIncident) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('⚠️', vX + vLen / 2 - 6, vY - 4);
      }
    }

    ctx.restore();
  }
}
