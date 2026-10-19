import { RoadConfig, Vehicle } from '../sim/types';

export class HighwayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Viewport camera transform
  public offsetX = 40;
  public offsetY = 0;
  public scale = 0.6; // pixels per meter
  public minScale = 0.6; // strictly clamped to full road width

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
    // Exactly fit the 2.4km road across canvas width with 40px margins
    const sideMargin = 40;
    this.minScale = Math.max(0.1, (canvasWidth - sideMargin * 2) / roadLength);
    this.scale = this.minScale;
    this.offsetX = sideMargin;
    this.offsetY = Math.max(25, (canvasHeight - roadTotalHeight) / 2);
  }

  public zoom(factor: number, canvasWidth: number): void {
    const newScale = this.scale * factor;
    // Never allow zoom-out below minScale (prevents road from shrinking smaller than canvas width)
    if (newScale <= this.minScale * 1.02) {
      this.scale = this.minScale;
      this.offsetX = 40;
    } else {
      // Zoom centered at canvas center
      const centerRoadX = (canvasWidth / 2 - this.offsetX) / this.scale;
      this.scale = Math.min(3.5, newScale);
      this.offsetX = canvasWidth / 2 - centerRoadX * this.scale;
    }
  }

  public focusOnLocation(xMeters: number, canvasWidth: number): void {
    // Zoom in to 2.2x and center on specific location
    this.scale = Math.max(1.8, this.minScale * 2.8);
    this.offsetX = canvasWidth / 2 - xMeters * this.scale;
  }

  public render(road: RoadConfig, vehicles: Vehicle[]): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // Background terrain
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

    // 6. Draw Vehicles with Mathematical Anti-Overlap Guarantee
    // Group vehicles by visual lane (rounding y to nearest lane)
    const vehiclesByLane: Vehicle[][] = Array.from({ length: road.numLanes }, () => []);
    for (const v of vehicles) {
      const l = Math.max(0, Math.min(road.numLanes - 1, Math.round(v.y)));
      vehiclesByLane[l].push(v);
    }
    for (let l = 0; l < road.numLanes; l++) {
      vehiclesByLane[l].sort((a, b) => a.x - b.x);
    }

    for (let l = 0; l < road.numLanes; l++) {
      const laneList = vehiclesByLane[l];
      for (let i = 0; i < laneList.length; i++) {
        const v = laneList[i];
        const prevCar = laneList[i - 1]; // Follower behind on same lane
        const nextCar = laneList[i + 1]; // Leader ahead on same lane

        const isTruck = v.type === 'truck';
        const isAcc = v.type === 'acc';

        // Base proportional length scaling with zoom
        let vLen = Math.max(
          isTruck ? 14 : 7,
          Math.min(isTruck ? 54 : 26, Math.round(v.profile.length * Math.max(1.2, this.scale * 2.2)))
        );

        // A. Anti-Overlap with Follower behind:
        // Ego's rear bumper (vFrontX - vLen) cannot penetrate follower's front bumper
        if (prevCar) {
          const distToFollowerPx = (v.x - prevCar.x) * this.scale;
          if (vLen >= distToFollowerPx - 1) {
            vLen = Math.max(3, distToFollowerPx - 2);
          }
        }

        // B. Anti-Overlap with Leader ahead:
        // Ego's front bumper cannot penetrate leader's rear bumper
        let vFrontX = v.x * this.scale;
        if (nextCar) {
          const leaderRearX = (nextCar.x - nextCar.profile.length) * this.scale;
          if (vFrontX > leaderRearX - 1) {
            vFrontX = leaderRearX - 1;
          }
        }

        const vWidth = Math.max(4, Math.min(isTruck ? 13 : 10.5, Math.round(vLen * 0.44)));
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

        // 1. Tires (draw if vehicle is reasonably sized)
        if (vLen >= 12) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(vX + vLen - 6, vY - 1, 4, 1.5);
          ctx.fillRect(vX + vLen - 6, vY + vWidth - 0.5, 4, 1.5);
          ctx.fillRect(vX + 2, vY - 1, 4, 1.5);
          ctx.fillRect(vX + 2, vY + vWidth - 0.5, 4, 1.5);
        }

        // 2. Vehicle Body (Horizontal rectangle)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.roundRect(vX, vY, vLen, vWidth, Math.min(3, vLen * 0.2));
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // 3. Roof & Glass (Windshield)
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

        // 4. Front Headlights (Facing Right)
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(vX + vLen - 1, vY + 1, 1, 2);
        ctx.fillRect(vX + vLen - 1, vY + vWidth - 3, 1, 2);

        // 5. Rear Brake Lights (Facing Left)
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
