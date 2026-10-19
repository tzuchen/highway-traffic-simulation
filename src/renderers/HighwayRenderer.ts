import { RoadConfig, Vehicle } from '../sim/types';

export class HighwayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Viewport camera transform
  public offsetX = 0;
  public offsetY = 0;
  public scale = 0.6; // pixels per meter
  public minScale = 0.4; // minimum scale to keep road filling canvas

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
    const laneHeight = 36;
    const roadTotalHeight = roadLanes * laneHeight;
    // Base scale ensures the full 2.4km road stretches across the canvas width
    this.minScale = Math.max(0.35, (canvasWidth - 100) / roadLength);
    this.scale = this.minScale;
    this.offsetX = 50;
    this.offsetY = Math.max(25, (canvasHeight - roadTotalHeight) / 2);
  }

  public zoom(factor: number): void {
    // Zoom in or out, but NEVER shrink road below minScale (so road never shrinks into a small strip)
    const newScale = this.scale * factor;
    this.scale = Math.max(this.minScale, Math.min(3.5, newScale));
  }

  public focusOnLocation(xMeters: number, canvasWidth: number): void {
    // Zoom in to 1.8x and center on specific location (e.g. bottleneck or congestion tail)
    this.scale = Math.max(1.6, this.minScale * 2.5);
    this.offsetX = canvasWidth / 2 - xMeters * this.scale;
  }

  public render(road: RoadConfig, vehicles: Vehicle[]): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Background grass / terrain
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);

    const laneHeight = 36;
    const roadTotalHeight = road.numLanes * laneHeight;
    const roadWidthPx = road.length * this.scale;

    // 1. Road Asphalt Base
    ctx.fillStyle = '#161f30';
    ctx.fillRect(0, 0, roadWidthPx, roadTotalHeight);

    // Shoulder / Road Solid Borders
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(roadWidthPx, 0);
    ctx.moveTo(0, roadTotalHeight);
    ctx.lineTo(roadWidthPx, roadTotalHeight);
    ctx.stroke();

    // 2. Dashed Lane Dividers
    for (let l = 1; l < road.numLanes; l++) {
      const y = l * laneHeight;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([16, 20]);
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
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(startPx, yTop, endPx - startPx, laneHeight);

        // Chevron warning signs
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 2;
        for (let x = startPx; x < endPx; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, yTop + laneHeight);
          ctx.lineTo(x + 18, yTop);
          ctx.stroke();
        }

        // Concrete barrier at dropEnd
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(endPx, yTop, 6, laneHeight);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('車道縮減 ⛔', endPx + 10, yTop + laneHeight / 2 + 3.5);
      }
    }

    // 4. On-Ramp Visualization (if active)
    if (road.onRamp && road.onRamp.active) {
      const rampStartPx = road.onRamp.start * this.scale;
      const rampEndPx = road.onRamp.end * this.scale;
      const rampY = road.numLanes * laneHeight;

      // Acceleration Lane base
      ctx.fillStyle = '#161f30';
      ctx.beginPath();
      ctx.moveTo(rampStartPx - 45, rampY + 32);
      ctx.lineTo(rampStartPx, rampY + laneHeight);
      ctx.lineTo(rampEndPx, rampY);
      ctx.lineTo(rampStartPx, rampY);
      ctx.closePath();
      ctx.fill();

      // Yellow taper line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rampStartPx - 45, rampY + 32);
      ctx.lineTo(rampStartPx, rampY + laneHeight);
      ctx.lineTo(rampEndPx, rampY);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('匝道匯流 ↗', rampStartPx - 20, rampY + 45);
    }

    // 5. Distance Milestone Ticks
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    for (let x = 0; x <= road.length; x += 300) {
      const xPx = x * this.scale;
      ctx.fillRect(xPx, roadTotalHeight + 4, 1, 6);
      ctx.fillText(`${x}m`, xPx - 14, roadTotalHeight + 20);
    }

    // 6. Draw Vehicles with Anti-Overlap Guard
    // Group vehicles by lane and sort by x ascending to calculate leader distance
    const vehiclesByLane: Vehicle[][] = Array.from({ length: road.numLanes }, () => []);
    for (const v of vehicles) {
      if (v.currentLane >= 0 && v.currentLane < road.numLanes) {
        vehiclesByLane[v.currentLane].push(v);
      }
    }
    for (let l = 0; l < road.numLanes; l++) {
      vehiclesByLane[l].sort((a, b) => a.x - b.x);
    }

    for (let l = 0; l < road.numLanes; l++) {
      const laneList = vehiclesByLane[l];
      for (let i = 0; i < laneList.length; i++) {
        const v = laneList[i];
        const nextCar = laneList[i + 1]; // Vehicle ahead on same lane

        const isTruck = v.type === 'truck';
        const isAcc = v.type === 'acc';

        // Base proportional length scaling with zoom
        let vLen = Math.max(
          isTruck ? 16 : 8,
          Math.min(isTruck ? 54 : 26, Math.round(v.profile.length * Math.max(1.2, this.scale * 2.2)))
        );

        // Strict Anti-Overlap Constraint:
        // Ensure distance to front car's rear bumper is always at least 2px
        if (nextCar) {
          const pixelDist = (nextCar.x - v.x) * this.scale;
          if (pixelDist < vLen + 2) {
            vLen = Math.max(4, pixelDist - 2);
          }
        }

        const vWidth = Math.max(4, Math.min(isTruck ? 13 : 10.5, Math.round(vLen * 0.44)));
        const vFrontX = v.x * this.scale;
        const vX = vFrontX - vLen;
        const vY = v.y * laneHeight + (laneHeight - vWidth) / 2;

        // Color mapping by speed
        const speedKmh = v.v * 3.6;
        let bodyColor = '#10b981'; // Green: Free flow > 75 km/h
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

        // A. Tires (only draw if vehicle is large enough)
        if (vLen >= 12) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(vX + vLen - 6, vY - 1, 4, 1.5);
          ctx.fillRect(vX + vLen - 6, vY + vWidth - 0.5, 4, 1.5);
          ctx.fillRect(vX + 2, vY - 1, 4, 1.5);
          ctx.fillRect(vX + 2, vY + vWidth - 0.5, 4, 1.5);
        }

        // B. Vehicle Body (Horizontal rectangle)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.roundRect(vX, vY, vLen, vWidth, Math.min(3, vLen * 0.2));
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // C. Roof & Glass (Windshield)
        if (vLen >= 14) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(vX + vLen * 0.65, vY + 1.5, Math.max(2, vLen * 0.15), vWidth - 3);
          ctx.fillRect(vX + vLen * 0.2, vY + 1.5, Math.max(1.5, vLen * 0.1), vWidth - 3);

          if (isAcc) {
            ctx.fillStyle = '#06b6d4';
            ctx.beginPath();
            ctx.arc(vX + vLen * 0.45, vY + vWidth / 2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // D. Front Headlights (Facing Right)
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(vX + vLen - 1, vY + 1, 1, 2);
        ctx.fillRect(vX + vLen - 1, vY + vWidth - 3, 1, 2);

        // E. Rear Brake Lights (Facing Left)
        if (v.isBraking) {
          ctx.fillStyle = '#ff1e27';
          ctx.shadowColor = '#ff1e27';
          ctx.shadowBlur = 6;
          ctx.fillRect(vX - 1, vY + 1, 1.5, 2.5);
          ctx.fillRect(vX - 1, vY + vWidth - 3.5, 1.5, 2.5);
          ctx.shadowBlur = 0; // Reset
        } else {
          ctx.fillStyle = '#7f1d1d';
          ctx.fillRect(vX, vY + 1, 1, 2);
          ctx.fillRect(vX, vY + vWidth - 3, 1, 2);
        }

        // Incident warning marker
        if (v.hasIncident) {
          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('⚠️', vX + vLen / 2 - 6, vY - 5);
        }
      }
    }

    ctx.restore();
  }
}
