import React from 'react';
import { VehicleTelemetry } from '../sim/types';
import { X, Eye, EyeOff, AlertTriangle, Gauge, ArrowRight, Zap, ShieldCheck } from 'lucide-react';

interface VehicleInspectorProps {
  telemetry: VehicleTelemetry | null;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onInduceBrake: (vehicleId: number) => void;
  onClose: () => void;
}

export const VehicleInspector: React.FC<VehicleInspectorProps> = ({
  telemetry,
  isFollowing,
  onToggleFollow,
  onInduceBrake,
  onClose,
}) => {
  if (!telemetry) return null;

  const { vehicle, leader, actualGapMeters, desiredGapMeters, speedKmh, desiredSpeedKmh, acceleration, relativeClosingSpeedKmh, statusLabel } =
    telemetry;

  // Type badge formatting
  let typeLabel = '小客車 (Sedan)';
  let typeBadgeClass = 'bg-blue-900/60 text-blue-300 border-blue-700/60';
  if (vehicle.type === 'speeder' || vehicle.personality === 'speeder') {
    typeLabel = '🏎️ 狂飆超速超車狂 (Speeder)';
    typeBadgeClass = 'bg-rose-950/90 text-rose-300 border-rose-500 shadow-sm shadow-rose-500/30 animate-pulse';
  } else if (vehicle.type === 'truck') {
    typeLabel = '大型車 / 貨車 (Truck)';
    typeBadgeClass = 'bg-amber-900/60 text-amber-300 border-amber-700/60';
  } else if (vehicle.type === 'acc') {
    typeLabel = 'ACC 智慧車 (Jam-Buster)';
    typeBadgeClass = 'bg-cyan-900/60 text-cyan-300 border-cyan-700/60';
  }

  // Speed bar percentage
  const speedPct = Math.min(100, Math.max(0, (speedKmh / (desiredSpeedKmh || 100)) * 100));

  // Accel bar (ranges from -4 m/s^2 to +2 m/s^2)
  const isBrakingHard = acceleration < -1.5;
  const isAccelerating = acceleration > 0.3;

  return (
    <div className="bg-slate-900/95 border border-cyan-800/60 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-xs text-slate-200 transition-all animate-fadeIn">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-cyan-400 font-bold text-sm tracking-wide">
            #{vehicle.id}
          </span>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${typeBadgeClass}`}>
            {typeLabel}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300">
            {telemetry.personalityLabel}
          </span>
          <span className="text-[11px] font-medium text-slate-400">· {statusLabel}</span>
        </div>


        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleFollow}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
              isFollowing
                ? 'bg-cyan-500/20 border-cyan-500/80 text-cyan-300 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="視角平移鎖定此車輛，鏡頭隨車前進"
          >
            {isFollowing ? <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
            <span>{isFollowing ? '解除鎖定' : '鏡頭跟隨'}</span>
          </button>

          <button
            onClick={() => onInduceBrake(vehicle.id)}
            disabled={vehicle.hasIncident}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 text-[11px] font-medium transition-all cursor-pointer disabled:opacity-40"
            title="對此車輛施加瞬間強效減速，引發後方 IDM 跟車反應"
          >
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span>誘發急煞</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer ml-1"
            title="關閉檢視 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Speeder Chronic Weaving & Shockwave Diagnostics */}
      {(vehicle.type === 'speeder' || vehicle.personality === 'speeder') && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏎️</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-300">狂飆超速超車狂即時破壞指數</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-900/80 text-rose-200 border border-rose-700 font-mono">
                  超速 {telemetry.speedingPct && telemetry.speedingPct > 0 ? `+${telemetry.speedingPct}%` : '超速中'}
                </span>
              </div>
              <p className="text-[11px] text-rose-400/90 mt-0.5">
                零禮貌強插 (p=0.02) · 超車門檻 0.04 m/s² · 穿梭換道冷卻 0.8s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-rose-900/60 text-center">
              <span className="text-[10px] text-slate-400 block">累計超車數</span>
              <span className="text-base font-bold text-cyan-300">
                {telemetry.overtakeCount ?? 0} <span className="text-[10px] font-normal text-slate-400">輛</span>
              </span>
            </div>
            <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-rose-900/60 text-center">
              <span className="text-[10px] text-slate-400 block">誘發後車急煞衝擊波</span>
              <span className="text-base font-bold text-rose-400">
                {telemetry.inducedBrakesCount ?? 0} <span className="text-[10px] font-normal text-slate-400">次</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Physics Telemetry Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {/* Metric 1: Speed */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center gap-1">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span>即時車速</span>
            </span>
            <span className="font-mono text-[10px] text-slate-500">期望 {Math.round(desiredSpeedKmh)}</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold font-mono text-cyan-300">{Math.round(speedKmh)}</span>
            <span className="text-[10px] text-slate-400 ml-1">km/h ({vehicle.v.toFixed(1)} m/s)</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                speedKmh < 25 ? 'bg-rose-500' : speedKmh < 60 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${speedPct}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Acceleration */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>動態加速度 (a)</span>
            <span className="font-mono text-[10px] text-slate-500">上限 +{vehicle.profile.maxAccel}</span>
          </div>
          <div className="my-1">
            <span
              className={`text-xl font-bold font-mono ${
                isBrakingHard ? 'text-rose-400' : isAccelerating ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {acceleration >= 0 ? `+${acceleration.toFixed(2)}` : acceleration.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 ml-1">m/s²</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {vehicle.isBraking ? (
              <span className="text-rose-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                煞車尾燈亮起
              </span>
            ) : acceleration > 0.2 ? (
              <span className="text-emerald-400 font-medium">前向加速中</span>
            ) : (
              <span className="text-slate-500 font-mono">巡航穩態</span>
            )}
          </div>
        </div>

        {/* Metric 3: Actual vs Desired Gap */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>前車淨間距 (s)</span>
            <span className="font-mono text-[10px] text-slate-500">
              s*期望: {desiredGapMeters ? `${desiredGapMeters.toFixed(1)}m` : '無前車'}
            </span>
          </div>
          <div className="my-1">
            {actualGapMeters !== null ? (
              <>
                <span
                  className={`text-xl font-bold font-mono ${
                    desiredGapMeters && actualGapMeters < desiredGapMeters * 0.85
                      ? 'text-amber-400'
                      : 'text-slate-200'
                  }`}
                >
                  {actualGapMeters.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400 ml-1">m</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-emerald-400">前方完全淨空</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {actualGapMeters !== null && desiredGapMeters !== null ? (
              actualGapMeters < desiredGapMeters ? (
                <span className="text-amber-400">間距受壓 -{(desiredGapMeters - actualGapMeters).toFixed(1)}m</span>
              ) : (
                <span className="text-emerald-400">間距充裕 +{(actualGapMeters - desiredGapMeters).toFixed(1)}m</span>
              )
            ) : (
              <span>自由加速</span>
            )}
          </div>
        </div>

        {/* Metric 4: Lane & MOBIL Status */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>車道與換道</span>
            <span className="font-mono text-[10px] text-slate-500">
              冷卻 {Math.max(0, vehicle.laneChangeCooldown).toFixed(1)}s
            </span>
          </div>
          <div className="my-1 flex items-center gap-1.5 font-mono text-sm font-bold text-slate-200">
            <span>車道 {vehicle.currentLane + 1}</span>
            {vehicle.laneChangeProgress > 0 && (
              <>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="text-cyan-400">車道 {vehicle.targetLane + 1}</span>
              </>
            )}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
            <ShieldCheck className="w-3 h-3 text-cyan-400" />
            <span>p={vehicle.profile.politeness.toFixed(2)} | 超車門檻 {vehicle.profile.laneChangeThreshold.toFixed(2)} m/s²</span>
          </div>

        </div>
      </div>

      {/* Leader & Follower Context Sub-strip */}
      <div className="bg-slate-950/40 rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono">
        <div>
          <span>前導車: </span>
          {leader ? (
            <span className="text-slate-300 font-semibold">
              #{leader.id} ({leader.type}, {Math.round(leader.v * 3.6)} km/h)
              {relativeClosingSpeedKmh !== null && (
                <span className={relativeClosingSpeedKmh > 5 ? ' text-rose-400' : ' text-slate-400'}>
                  {' '}
                  · 相對逼近率: {relativeClosingSpeedKmh > 0 ? `+${Math.round(relativeClosingSpeedKmh)}` : Math.round(relativeClosingSpeedKmh)} km/h
                </span>
              )}
            </span>
          ) : (
            <span className="text-emerald-400">無前車 (自由車流領頭)</span>
          )}
        </div>

        <div>
          <span>縱向坐標: </span>
          <span className="text-slate-200 font-semibold">{Math.round(vehicle.x)} m</span>
          <span className="text-slate-500 ml-2">| 車頭時距 T={vehicle.profile.timeHeadway}s</span>
        </div>
      </div>
    </div>
  );
};
