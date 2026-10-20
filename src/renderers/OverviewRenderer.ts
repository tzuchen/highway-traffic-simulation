import { RoadConfig, Vehicle, CongestionDiagnosis } from '../sim/types';
import { getBallisticDisplacement } from '../sim/idm';

export interface OverviewLoupeState {
  centerM: number;       // Center of loupe in meters
  windowM: number;       // Total width of observation window in meters (e.g. 250m)
  isDragging: boolean;
}

export class OverviewRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public marginX = 28;
  public roadTopY = 32;
  public laneHeight = 12;

  // Selected vehicle for highlight
  public selectedVehicleId: number | null = null;
  public hoveredVehicleId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Cannot get 2D context for OverviewRenderer');
    this.ctx = ctx;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  public getMeterAtScreenX(screenX: number, roadLength: number, canvasWidth: number): number {
    const usableW = Math.max(10, canvasWidth - 2 * this.marginX);
    const relX = screenX - this.marginX;
    const meter = (relX / usableW) * roadLength;
    return Math.max(0, Math.min(roadLength, meter));
  }

  public getScreenXAtMeter(meter: number, roadLength: number, canvasWidth: number): number {
    const usableW = Math.max(10, canvasWidth - 2 * this.marginX);
    return this.marginX + (meter / roadLength) * usableW;
  }

  public getLoupeRect(loupe: OverviewLoupeState, roadLength: number, canvasWidth: number): {
    x: number;
    y: number;
    width: number;
    height: number;
    startM: number;
    endM: number;
  } {
    const halfWin = loupe.windowM / 2;
    const startM = Math.max(0, Math.min(roadLength - loupe.windowM, loupe.centerM - halfWin));
    const endM = Math.min(roadLength, startM + loupe.windowM);

    const xStart = this.getScreenXAtMeter(startM, roadLength, canvasWidth);
    const xEnd = this.getScreenXAtMeter(endM, roadLength, canvasWidth);
    const width = Math.max(20, xEnd - xStart);

    return {
      x: xStart,
      y: 8,
      width,
      height: 78,
      startM,
      endM,
    };
  }

  public render(
    road: RoadConfig,
    vehicles: Vehicle[],
    loupe: OverviewLoupeState,
    diagnosis?: CongestionDiagnosis | null,
    subFrameSec: number = 0
  ): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // 1. Background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    const roadTotalH = road.numLanes * this.laneHeight;
    this.roadTopY = Math.round((height - roadTotalH) / 2) + 6;

    const usableW = Math.max(10, width - 2 * this.marginX);
    const scale = usableW / road.length;

    // 2. Congestion Queue Underglow (if active queue detected)
    if (diagnosis && diagnosis.isCongested && diagnosis.queueTailMeters !== null && diagnosis.queueHeadMeters !== null) {
      const qTailM = Math.max(0, diagnosis.queueTailMeters);
      const qHeadM = Math.min(road.length, diagnosis.queueHeadMeters);
      const qX1 = this.marginX + qTailM * scale;
      const qX2 = this.marginX + qHeadM * scale;
      const qW = Math.max(6, qX2 - qX1);

      ctx.save();
      const qGrad = ctx.createLinearGradient(qX1, 0, qX2, 0);
      qGrad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
      qGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.35)');
      qGrad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');
      ctx.fillStyle = qGrad;
      ctx.fillRect(qX1, this.roadTopY - 4, qW, roadTotalH + 8);
      ctx.restore();
    }

    // 3. Road Surface & Shoulders
    ctx.fillStyle = '#1e293b'; // Road asphalt
    ctx.fillRect(this.marginX, this.roadTopY, usableW, roadTotalH);

    // Hard shoulder lines
    ctx.strokeStyle = '#f8fafc'; // White outer line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.marginX, this.roadTopY + roadTotalH);
    ctx.lineTo(this.marginX + usableW, this.roadTopY + roadTotalH);
    ctx.stroke();

    ctx.strokeStyle = '#eab308'; // Yellow median line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.marginX, this.roadTopY);
    ctx.lineTo(this.marginX + usableW, this.roadTopY);
    ctx.stroke();

    // 4. Lane Separator Dashed Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let l = 1; l < road.numLanes; l++) {
      const y = this.roadTopY + l * this.laneHeight;
      ctx.beginPath();
      ctx.moveTo(this.marginX, y);
      ctx.lineTo(this.marginX + usableW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 5. Bottleneck / Lane Drop Warning Overlay
    for (const lane of road.lanes) {
      if (lane.dropEnd !== undefined) {
        const dropStartM = lane.dropStart ?? (lane.dropEnd - 100);
        const x1 = this.marginX + dropStartM * scale;
        const x2 = this.marginX + lane.dropEnd * scale;
        const laneY = this.roadTopY + lane.index * this.laneHeight;

        ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
        ctx.fillRect(x1, laneY, Math.max(4, x2 - x1), this.laneHeight);

        // Closure barrier diagonal stripes
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x2 - 3, laneY, 3, this.laneHeight);

        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.fillText('🚧 瓶頸', x2 - 24, laneY - 2);
      }
    }

    // 6. On-Ramp Merge Zone
    if (road.onRamp && road.onRamp.active) {
      const rampX1 = this.marginX + road.onRamp.start * scale;
      const rampX2 = this.marginX + road.onRamp.end * scale;
      const bottomY = this.roadTopY + roadTotalH;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fillRect(rampX1, bottomY - 3, rampX2 - rampX1, 5);
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('↗️ 匝道匯入', rampX1, bottomY + 12);
    }

    // 7. Kilometer Milestones
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    const numMarkers = 10;
    for (let i = 0; i <= numMarkers; i++) {
      const m = Math.round((i / numMarkers) * road.length);
      const px = this.marginX + (m / road.length) * usableW;
      ctx.fillRect(px, this.roadTopY + roadTotalH + 1, 1, 3);
      ctx.fillText(`${m}m`, px - 10, this.roadTopY + roadTotalH + 12);
    }

    // 8. Vehicle Pips (Streamlined, compact high-density markers with 60 FPS sub-frame interpolation)
    for (const v of vehicles) {
      const isSelected = v.id === this.selectedVehicleId;
      const isTruck = v.type === 'truck';

      const pipLen = isTruck ? 10 : 5.5;
      const pipWidth = isTruck ? 5 : 4;
      const interpX = v.x + getBallisticDisplacement(v.v, v.a, subFrameSec);
      const px = this.marginX + interpX * scale - pipLen;
      const py = this.roadTopY + v.y * this.laneHeight + (this.laneHeight - pipWidth) / 2;

      const isSpeeder = v.type === 'speeder' || v.personality === 'speeder';

      // Color mapping by speed (Speeder is highlighted in radiant fuchsia #f43f5e)
      const speedKmh = v.v * 3.6;
      let pipColor = '#10b981'; // Green: Free flow > 75 km/h
      if (isSpeeder) {
        pipColor = '#f43f5e';
      } else if (speedKmh < 20) {
        pipColor = '#ef4444'; // Red: Severe jam
      } else if (speedKmh < 45) {
        pipColor = '#f97316'; // Orange: Congested
      } else if (speedKmh < 75) {
        pipColor = '#eab308'; // Yellow: Moderate
      }
      if (v.hasIncident) pipColor = '#dc2626';

      ctx.fillStyle = pipColor;
      ctx.beginPath();
      ctx.roundRect(px, py, pipLen, pipWidth, 1.5);
      ctx.fill();

      // Speeder aura or selected pulsing glow on overview
      if (isSelected) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 2, py - 2, pipLen + 4, pipWidth + 4);
      } else if (isSpeeder) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px - 1.5, py - 1.5, pipLen + 3, pipWidth + 3);
      }
    }

    // 9. Interactive Magnifier Loupe Viewport Box
    const loupeRect = this.getLoupeRect(loupe, road.length, width);

    ctx.save();
    // Glass window fill
    ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
    ctx.fillRect(loupeRect.x, loupeRect.y, loupeRect.width, loupeRect.height);

    // Glowing cyan frame
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 8;
    ctx.strokeRect(loupeRect.x, loupeRect.y, loupeRect.width, loupeRect.height);
    ctx.shadowBlur = 0; // Reset

    // Left and Right drag grip handles
    const handleW = 4;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(loupeRect.x - handleW / 2, loupeRect.y + loupeRect.height / 2 - 8, handleW, 16);
    ctx.fillRect(loupeRect.x + loupeRect.width - handleW / 2, loupeRect.y + loupeRect.height / 2 - 8, handleW, 16);

    // Top pill badge with current meter interval
    const pillText = `🔍 ${Math.round(loupeRect.startM)}m – ${Math.round(loupeRect.endM)}m`;
    ctx.font = 'bold 10px monospace';
    const textWidth = ctx.measureText(pillText).width;
    const pillX = loupeRect.x + (loupeRect.width - textWidth - 12) / 2;
    const pillY = Math.max(1, loupeRect.y - 12);

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, textWidth + 12, 14, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(pillText, pillX + 6, pillY + 10.5);

    ctx.restore();
  }
}
