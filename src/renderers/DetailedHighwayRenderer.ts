import { RoadConfig, Vehicle } from '../sim/types';
import { SIM_CONSTANTS, quinticTrajectory, getKinematicLaneChangeDuration } from '../sim/constants';
import { getBallisticDisplacement } from '../sim/idm';

export class DetailedHighwayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public marginX = 24;
  public roadTopY = 40;
  public scale = 4.8; // Isotropic scale (pixels per meter, identical in X and Y)
  public laneHeight = 18;

  public selectedVehicleId: number | null = null;
  public hoveredVehicleId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Cannot get 2D context for DetailedHighwayRenderer');
    this.ctx = ctx;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  public getVehicleAt(
    screenX: number,
    screenY: number,
    road: RoadConfig,
    vehicles: Vehicle[],
    windowStartM: number,
    windowEndM: number
  ): Vehicle | null {
    const usableW = Math.max(10, this.canvas.width / window.devicePixelRatio - 2 * this.marginX);
    const windowLengthM = Math.max(10, windowEndM - windowStartM);
    const scale = usableW / windowLengthM;
    const laneH = SIM_CONSTANTS.LANE_WIDTH_METERS * scale;

    const relX = screenX - this.marginX;
    const clickXMeters = windowStartM + relX / scale;
    const clickLane = (screenY - this.roadTopY) / laneH - 0.5;

    let closestVehicle: Vehicle | null = null;
    let minDistanceSq = Infinity;

    for (const v of vehicles) {
      if (v.x < windowStartM - 15 || v.x > windowEndM + 15) continue;

      const laneDist = Math.abs(v.y - clickLane);
      if (laneDist <= 0.8) {
        const front = v.x + 3;
        const rear = v.x - v.profile.length - 3;
        if (clickXMeters >= rear && clickXMeters <= front) {
          const distSq = Math.pow(v.x - clickXMeters, 2) + Math.pow(laneDist * 4, 2);
          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestVehicle = v;
          }
        }
      }
    }

    return closestVehicle;
  }

  public render(
    road: RoadConfig,
    vehicles: Vehicle[],
    windowStartM: number,
    windowEndM: number,
    simTime?: number,
    subFrameSec: number = 0
  ): void {
    const ctx = this.ctx;
    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    // 1. Clear Background
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, width, height);

    // 2. TRUE ISOTROPIC 1:1 SCALE COMPUTATION
    // sx === sy strictly!
    const usableW = Math.max(10, width - 2 * this.marginX);
    const windowLengthM = Math.max(10, windowEndM - windowStartM);
    this.scale = usableW / windowLengthM; // Pixels per meter

    const laneWidthMeters = SIM_CONSTANTS.LANE_WIDTH_METERS; // 3.75m
    this.laneHeight = laneWidthMeters * this.scale;

    const roadTotalHeight = road.numLanes * this.laneHeight;
    const shoulderTopH = 2.5 * this.scale; // 2.5m inner shoulder
    const shoulderBottomH = 3.0 * this.scale; // 3.0m outer hard shoulder
    const corridorTotalH = roadTotalHeight + shoulderTopH + shoulderBottomH;

    this.roadTopY = Math.round((height - corridorTotalH) / 2) + shoulderTopH;

    // 3. Draw Road Bed, Shoulders & Guardrails
    const roadX1 = this.marginX;
    const roadX2 = this.marginX + usableW;

    // Grass / Terrain verge
    ctx.fillStyle = '#0d1527';
    ctx.fillRect(roadX1, this.roadTopY - shoulderTopH - 6, usableW, corridorTotalH + 12);

    // Guardrails
    ctx.fillStyle = '#475569';
    ctx.fillRect(roadX1, this.roadTopY - shoulderTopH - 3, usableW, 2);
    ctx.fillRect(roadX1, this.roadTopY + roadTotalHeight + shoulderBottomH + 1, usableW, 2);

    // Roadbed Asphalt
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(roadX1, this.roadTopY - shoulderTopH, usableW, corridorTotalH);

    // Shoulders pavement (slightly darker tone)
    ctx.fillStyle = '#172033';
    ctx.fillRect(roadX1, this.roadTopY - shoulderTopH, usableW, shoulderTopH);
    ctx.fillRect(roadX1, this.roadTopY + roadTotalHeight, usableW, shoulderBottomH);

    // Road Edge Solid Lines
    ctx.strokeStyle = '#eab308'; // Yellow median line (top)
    ctx.lineWidth = Math.max(1.5, this.scale * 0.15);
    ctx.beginPath();
    ctx.moveTo(roadX1, this.roadTopY);
    ctx.lineTo(roadX2, this.roadTopY);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc'; // White solid shoulder line (bottom)
    ctx.lineWidth = Math.max(1.5, this.scale * 0.15);
    ctx.beginPath();
    ctx.moveTo(roadX1, this.roadTopY + roadTotalHeight);
    ctx.lineTo(roadX2, this.roadTopY + roadTotalHeight);
    ctx.stroke();

    // 4. Dashed Lane Separators (Physical 6m stripe, 9m gap, anchored to road meters)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1.2, this.scale * 0.12);
    const dashLenPx = Math.max(8, 6.0 * this.scale);
    const gapLenPx = Math.max(12, 9.0 * this.scale);
    const periodPx = dashLenPx + gapLenPx;
    ctx.setLineDash([dashLenPx, gapLenPx]);
    ctx.lineDashOffset = -((windowStartM * this.scale) % periodPx);

    for (let l = 1; l < road.numLanes; l++) {
      const laneY = this.roadTopY + l * this.laneHeight;
      ctx.beginPath();
      ctx.moveTo(roadX1, laneY);
      ctx.lineTo(roadX2, laneY);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset dash
    ctx.lineDashOffset = 0;

    // 5. Bottleneck / Lane Drop Zones in visible segment
    for (const lane of road.lanes) {
      if (lane.dropEnd !== undefined) {
        const dropStartM = lane.dropStart ?? (lane.dropEnd - 100);
        // Intersect with current visible window
        const overlapStartM = Math.max(windowStartM, dropStartM);
        const overlapEndM = Math.min(windowEndM, lane.dropEnd);

        if (overlapEndM > overlapStartM) {
          const x1 = roadX1 + (overlapStartM - windowStartM) * this.scale;
          const x2 = roadX1 + (overlapEndM - windowStartM) * this.scale;
          const laneY = this.roadTopY + lane.index * this.laneHeight;

          // Red hash fill
          ctx.fillStyle = 'rgba(220, 38, 38, 0.35)';
          ctx.fillRect(x1, laneY, x2 - x1, this.laneHeight);

          // Diagonal hatch lines
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1.5;
          const step = 14;
          for (let hx = x1; hx < x2 + this.laneHeight; hx += step) {
            ctx.beginPath();
            ctx.moveTo(hx, laneY);
            ctx.lineTo(hx - this.laneHeight, laneY + this.laneHeight);
            ctx.stroke();
          }
        }

        // Drop End Barrier
        if (lane.dropEnd >= windowStartM && lane.dropEnd <= windowEndM) {
          const barrierX = roadX1 + (lane.dropEnd - windowStartM) * this.scale;
          const laneY = this.roadTopY + lane.index * this.laneHeight;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(barrierX - 4, laneY, 5, this.laneHeight);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#f87171';
          ctx.fillText('⛔ 終止封閉', barrierX - 58, laneY + this.laneHeight / 2 + 4);
        }
      }
    }

    // 6. Kilometer & Meter Ticks in Visible Window
    ctx.font = '10px monospace';
    ctx.fillStyle = '#64748b';
    const tickIntervalM = windowLengthM <= 200 ? 25 : 50;
    const firstTickM = Math.ceil(windowStartM / tickIntervalM) * tickIntervalM;

    for (let tm = firstTickM; tm <= windowEndM; tm += tickIntervalM) {
      const tx = roadX1 + (tm - windowStartM) * this.scale;
      ctx.fillRect(tx, this.roadTopY + roadTotalHeight + shoulderBottomH + 2, 1, 5);
      ctx.fillText(`${tm}m`, tx - 12, this.roadTopY + roadTotalHeight + shoulderBottomH + 16);
    }

    // 7. Render Detailed Vehicles (1:1 Isotropic Real Dimensions)
    const visibleVehicles = vehicles
      .filter((v) => v.x >= windowStartM - 15 && v.x <= windowEndM + 15)
      .sort((a, b) => a.x - b.x);

    let selectedVehicleRenderData: {
      vX: number;
      vY: number;
      vLen: number;
      vWidth: number;
      pivotX: number;
      pivotY: number;
      localX: number;
      localY: number;
      headingAngleRad: number;
      v: Vehicle;
    } | null = null;

    for (const v of visibleVehicles) {
      const isTruck = v.type === 'truck';
      const isAcc = v.type === 'acc';
      const isSelected = v.id === this.selectedVehicleId;
      const isHovered = v.id === this.hoveredVehicleId;

      // TRUE PHYSICAL 1:1 DIMENSIONS (in pixels)
      const vLen = v.profile.length * this.scale; // e.g. 4.5m * scale
      const vWidth = (v.profile.width ?? (isTruck ? 2.5 : 1.8)) * this.scale; // e.g. 1.8m * scale

      // Sub-frame ballistic interpolation with exact zero-velocity stopping clamp (eliminates jam jitter)
      const interpX = v.x + getBallisticDisplacement(v.v, v.a, subFrameSec);

      let interpProgress = v.laneChangeProgress;
      let interpY = v.y;

      const vFrontX = roadX1 + (interpX - windowStartM) * this.scale;
      const vX = vFrontX - vLen;

      // TRUE PHYSICAL STEERING HEADING ANGLE
      let headingAngleRad = 0;
      let frontWheelSteerRad = 0;

      if (v.laneChangeProgress > 0) {
        const { duration, mergeLength, maxYawRad, maxWheelSteerRad } = getKinematicLaneChangeDuration(v);

        if (subFrameSec > 0) {
          const rate = (v.isAbortingLaneChange ? -1 : 1) / duration;
          interpProgress = Math.max(0, Math.min(1.0, v.laneChangeProgress + rate * subFrameSec));
          const { q } = quinticTrajectory(interpProgress);
          interpY = v.currentLane + (v.targetLane - v.currentLane) * q;
        }

        const laneDelta = v.targetLane - v.currentLane;
        const { dq, ddq } = quinticTrajectory(interpProgress);
        const abortSign = v.isAbortingLaneChange ? -1 : 1;

        // EXACT NON-HOLONOMIC HEADING ANGLE:
        // Path tangent: tan(psi) = dy/dx = (laneDelta * W * dq * abortSign) / mergeLength
        // By setting headingAngleRad = atan(dy/dx), the vehicle chassis is exactly collinear
        // with the velocity vector (v_x, v_y), eliminating any y-direction drift (zero side-slip).
        // In low-speed short-distance lane changes (mergeLength ~16-19m), heading angle naturally
        // turns up to ~22-25 deg ("轉向大一點"), authentically reflecting sharp low-speed cut-in!
        const tangentSlope = (laneDelta * laneWidthMeters * dq * abortSign) / mergeLength;
        const rawHeading = Math.atan(tangentSlope);
        headingAngleRad = Math.max(-maxYawRad, Math.min(maxYawRad, rawHeading));

        // Front-wheel steering relative to chassis (Ackermann bicycle curvature):
        // Front wheels turn in (ddq > 0) to initiate the yaw rate, and counter-steer (ddq < 0) to align
        const dir = laneDelta > 0 ? 1 : -1;
        frontWheelSteerRad = dir * abortSign * (ddq / 5.77) * maxWheelSteerRad;
      }

      // Center of lane coordinate using interpolated lateral position
      const laneCenterY = this.roadTopY + (interpY + 0.5) * this.laneHeight;
      const vY = laneCenterY - vWidth / 2;

      // Kinematic Ackermann Steering: Pivot is located at the REAR AXLE (not center of mass!)
      // Real front-steered cars pivot around the rear axle; rear wheels have 0 lateral slip,
      // while the front end sweeps outward and pulls the chassis into the turn.
      const rearAxleOffset = vLen * (isTruck ? 0.16 : 0.20);
      const pivotX = vX + rearAxleOffset;
      const pivotY = laneCenterY;

      // Local chassis bounding coordinates relative to the rear axle pivot
      const localX = -rearAxleOffset;
      const localY = -vWidth / 2;

      if (isSelected) {
        selectedVehicleRenderData = {
          vX,
          vY,
          vLen,
          vWidth,
          pivotX,
          pivotY,
          localX,
          localY,
          headingAngleRad,
          v,
        };
      }

      const isSpeeder = v.type === 'speeder' || v.personality === 'speeder';

      // Color mapping by speed (Speeders are highlighted in hot racing rose #f43f5e)
      const speedKmh = v.v * 3.6;
      let bodyColor = '#10b981'; // Green: Free flow > 75 km/h
      if (isSpeeder) {
        bodyColor = '#f43f5e'; // Hot racing crimson/rose for Speeder
      } else if (speedKmh < 20) {
        bodyColor = '#ef4444'; // Red: Severe jam
      } else if (speedKmh < 45) {
        bodyColor = '#f97316'; // Orange: Congested
      } else if (speedKmh < 75) {
        bodyColor = '#eab308'; // Yellow: Moderate
      }
      if (v.hasIncident) bodyColor = '#dc2626';

      ctx.save();
      // Translate to the REAR AXLE pivot: authentic front-steered Ackermann kinematics!
      ctx.translate(pivotX, pivotY);
      if (headingAngleRad !== 0) {
        ctx.rotate(headingAngleRad);
      }

      // 7.1 Tires (with independent front wheel steering & rear axle alignment)
      if (vLen >= 12) {
        ctx.fillStyle = '#0f172a';
        const tireLen = Math.max(3, Math.min(6, vLen * 0.22));
        const tireWidth = Math.max(1.5, Math.min(2.5, vWidth * 0.2));

        // Rear tires: centered precisely on the rear axle pivot (X = 0)
        ctx.fillRect(-tireLen / 2, localY - tireWidth * 0.5, tireLen, tireWidth);
        ctx.fillRect(-tireLen / 2, localY + vWidth - tireWidth * 0.5, tireLen, tireWidth);

        // Front tires: positioned on the front axle and steered by frontWheelSteerRad
        const frontTireCenterX = localX + vLen - vLen * (isTruck ? 0.16 : 0.18);
        const frontTopTireCenterY = localY;
        const frontBottomTireCenterY = localY + vWidth;

        ctx.save();
        ctx.translate(frontTireCenterX, frontTopTireCenterY);
        if (frontWheelSteerRad !== 0) ctx.rotate(frontWheelSteerRad);
        ctx.fillRect(-tireLen / 2, -tireWidth / 2, tireLen, tireWidth);
        ctx.restore();

        ctx.save();
        ctx.translate(frontTireCenterX, frontBottomTireCenterY);
        if (frontWheelSteerRad !== 0) ctx.rotate(frontWheelSteerRad);
        ctx.fillRect(-tireLen / 2, -tireWidth / 2, tireLen, tireWidth);
        ctx.restore();
      }

      // 7.2 Vehicle Chassis Body
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(localX, localY, vLen, vWidth, Math.min(3, vWidth * 0.25));
      ctx.fill();

      ctx.strokeStyle = isHovered ? '#38bdf8' : 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = isHovered ? 1.5 : 0.8;
      ctx.stroke();

      // 7.3 Roof & Windshield Glass
      if (vLen >= 14) {
        ctx.fillStyle = '#0f172a';
        // Front windshield
        ctx.fillRect(localX + vLen * 0.62, localY + 1.2, Math.max(2, vLen * 0.14), vWidth - 2.4);
        // Rear window
        ctx.fillRect(localX + vLen * 0.22, localY + 1.2, Math.max(1.5, vLen * 0.1), vWidth - 2.4);

        if (isAcc) {
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(localX + vLen * 0.45, localY + vWidth / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isSpeeder) {
          // Dual white racing stripe along the center of the speeder
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(localX, localY + vWidth * 0.42, vLen, vWidth * 0.16);
        }
      }

      // 7.4 Headlights & Forward Light Projection Beams
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(localX + vLen - 1, localY + 1, 1.2, 2);
      ctx.fillRect(localX + vLen - 1, localY + vWidth - 3, 1.2, 2);

      if (vLen >= 12) {
        const beamLen = Math.min(32, 12.0 * this.scale);
        const beamGrad = ctx.createLinearGradient(localX + vLen, 0, localX + vLen + beamLen, 0);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.20)');
        beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(localX + vLen, localY + 1);
        ctx.lineTo(localX + vLen + beamLen, localY - 3);
        ctx.lineTo(localX + vLen + beamLen, localY + vWidth + 3);
        ctx.lineTo(localX + vLen, localY + vWidth - 1);
        ctx.closePath();
        ctx.fill();
      }

      // 7.5 Rear Brake Lights
      if (v.isBraking) {
        ctx.fillStyle = '#ff1e27';
        ctx.shadowColor = '#ff1e27';
        ctx.shadowBlur = 6;
        ctx.fillRect(localX - 1, localY + 1, 1.5, 2.5);
        ctx.fillRect(localX - 1, localY + vWidth - 3.5, 1.5, 2.5);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(localX, localY + 1, 1, 2);
        ctx.fillRect(localX, localY + vWidth - 3, 1, 2);
      }

      // 7.6 Flashing Amber Turn Signals
      if (v.laneChangeProgress > 0) {
        const blinkTime = simTime !== undefined ? simTime : Date.now() / 1000;
        const isBlinkOn = Math.floor(blinkTime / 0.35) % 2 === 0;
        if (isBlinkOn) {
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 6;

          const returningToUp = v.isAbortingLaneChange
            ? v.currentLane < v.targetLane
            : v.targetLane < v.currentLane;

          if (returningToUp) {
            ctx.fillRect(localX + vLen - 2, localY - 0.5, 2.5, 2);
            ctx.fillRect(localX, localY - 0.5, 2, 2);
          } else {
            ctx.fillRect(localX + vLen - 2, localY + vWidth - 1.5, 2.5, 2);
            ctx.fillRect(localX, localY + vWidth - 1.5, 2, 2);
          }
          ctx.shadowBlur = 0;
        }
      }

      // Incident Marker
      if (v.hasIncident) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('⚠️', localX + vLen / 2 - 6, localY - 6);
      }

      ctx.restore();
    }

    // 8. Selected Vehicle HUD Reticle
    if (selectedVehicleRenderData) {
      const { vLen, vWidth, pivotX, pivotY, localX, localY, headingAngleRad } = selectedVehicleRenderData;
      const pad = 4;

      ctx.save();
      ctx.translate(pivotX, pivotY);
      if (headingAngleRad !== 0) ctx.rotate(headingAngleRad);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.strokeRect(localX - pad, localY - pad, vLen + pad * 2, vWidth + pad * 2);

      // Corner brackets
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      const bLen = 5;
      const left = localX - pad;
      const right = localX + vLen + pad;
      const top = localY - pad;
      const bot = localY + vWidth + pad;

      ctx.beginPath();
      ctx.moveTo(left, top + bLen); ctx.lineTo(left, top); ctx.lineTo(left + bLen, top);
      ctx.moveTo(right - bLen, top); ctx.lineTo(right, top); ctx.lineTo(right, top + bLen);
      ctx.moveTo(left, bot - bLen); ctx.lineTo(left, bot); ctx.lineTo(left + bLen, bot);
      ctx.moveTo(right - bLen, bot); ctx.lineTo(right, bot); ctx.lineTo(right, bot - bLen);
      ctx.stroke();

      ctx.restore();
    }

    // 9. Physical Scale Bar Indicator
    const barM = 20; // 20-meter scale bar
    const barPx = barM * this.scale;
    const barX = roadX1 + 8;
    const barY = height - 12;

    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(barX, barY, barPx, 2);
    ctx.fillRect(barX, barY - 3, 1, 5);
    ctx.fillRect(barX + barPx, barY - 3, 1, 5);
    ctx.font = '10px monospace';
    ctx.fillText(`20m 實體比例尺 (1m = ${this.scale.toFixed(1)}px)`, barX + barPx + 8, barY + 3);
  }
}
