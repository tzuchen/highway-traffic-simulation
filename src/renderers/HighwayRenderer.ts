import { RoadConfig, Vehicle } from '../sim/types';

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
    const laneHeight = 36;
    const roadTotalHeight = roadLanes * laneHeight;
    // Fit full road length horizontally across canvas with 60px margins
    this.scale = Math.max(0.3, (canvasWidth - 120) / roadLength);
    this.offsetX = 60;
    this.offsetY = Math.max(25, (canvasHeight - roadTotalHeight) / 2);
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

    // 6. Draw Vehicles (Realistic Top-down Horizontal Rectangles)
    for (const v of vehicles) {
      // Determine vehicle dimensions (Horizontal is unambiguously the long side)
      const isTruck = v.type === 'truck';
      const isAcc = v.type === 'acc';

      // Width fits comfortably in 36px lane; Length is 2.4x ~ 4.5x width
      const vWidth = isTruck ? 13 : 11;
      const baseLen = isTruck ? 54 : 26;
      // Slight scale adaptation if zoomed in
      const vLen = Math.max(baseLen, Math.round(v.profile.length * Math.max(1.8, this.scale * 2.8)));

      // Coordinates: front is at x * scale, extending rearwards to the left
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

      // A. Wheels / Tires (4 black notches on top/bottom edges)
      ctx.fillStyle = '#0f172a';
      // Front tires (right side)
      ctx.fillRect(vX + vLen - 8, vY - 1.5, 5, 2);
      ctx.fillRect(vX + vLen - 8, vY + vWidth - 0.5, 5, 2);
      // Rear tires (left side)
      ctx.fillRect(vX + 3, vY - 1.5, 5, 2);
      ctx.fillRect(vX + 3, vY + vWidth - 0.5, 5, 2);

      if (isTruck) {
        // Extra middle tires for long truck
        ctx.fillRect(vX + vLen * 0.45, vY - 1.5, 5, 2);
        ctx.fillRect(vX + vLen * 0.45, vY + vWidth - 0.5, 5, 2);
      }

      // B. Vehicle Body (Aerodynamic horizontal rounded rectangle)
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(vX, vY, vLen, vWidth, 3.5);
      ctx.fill();

      // Subtle chassis outline
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // C. Roof Cabin & Glass
      if (isTruck) {
        // Truck Cabin (front 15px)
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(vX + vLen - 13, vY + 1.5, 3.5, vWidth - 3); // Windshield
        // Trailer separation line
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(vX + vLen - 16, vY);
        ctx.lineTo(vX + vLen - 16, vY + vWidth);
        ctx.stroke();

        // Cargo box lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        for (let cx = vX + 6; cx < vX + vLen - 18; cx += 8) {
          ctx.beginPath();
          ctx.moveTo(cx, vY + 2);
          ctx.lineTo(cx, vY + vWidth - 2);
          ctx.stroke();
        }
      } else {
        // Passenger Car & ACC Top-down Cabin
        // Windshield (front dark curved glass)
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(vX + vLen * 0.62, vY + 1.5, vLen * 0.16, vWidth - 3, 1.5);
        ctx.fill();

        // Rear window (rear dark glass)
        ctx.beginPath();
        ctx.roundRect(vX + vLen * 0.18, vY + 1.5, vLen * 0.12, vWidth - 3, 1.5);
        ctx.fill();

        // Roof panel highlight in between
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(vX + vLen * 0.32, vY + 2.5, vLen * 0.28, vWidth - 5);

        // Side mirrors
        ctx.fillStyle = bodyColor;
        ctx.fillRect(vX + vLen * 0.68, vY - 1.5, 2, 1.5);
        ctx.fillRect(vX + vLen * 0.68, vY + vWidth, 2, 1.5);

        // Special ACC Tech Dome
        if (isAcc) {
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(vX + vLen * 0.45, vY + vWidth / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // D. Front Headlights (Facing Right)
      ctx.fillStyle = '#fef08a'; // Warm white
      ctx.fillRect(vX + vLen - 1.5, vY + 1.5, 1.5, 2);
      ctx.fillRect(vX + vLen - 1.5, vY + vWidth - 3.5, 1.5, 2);

      // E. Rear Brake Lights (Facing Left)
      if (v.isBraking) {
        // Glowing bright red brake lights
        ctx.fillStyle = '#ff1e27';
        ctx.shadowColor = '#ff1e27';
        ctx.shadowBlur = 8;
        ctx.fillRect(vX - 1, vY + 1, 2, 3);
        ctx.fillRect(vX - 1, vY + vWidth - 4, 2, 3);
        ctx.shadowBlur = 0; // Reset
      } else {
        // Subtle dark red taillights
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(vX, vY + 1.5, 1.5, 2);
        ctx.fillRect(vX, vY + vWidth - 3.5, 1.5, 2);
      }

      // Incident warning marker
      if (v.hasIncident) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('⚠️', vX + vLen / 2 - 6, vY - 5);
      }
    }

    ctx.restore();
  }
}
