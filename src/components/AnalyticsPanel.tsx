import React from 'react';
import { CongestionDiagnosis, DetectorReading } from '../sim/types';
import { AlertCircle, CheckCircle2, Clock, Gauge, TrendingDown, ArrowUpRight, ShieldAlert, Cpu } from 'lucide-react';

interface AnalyticsPanelProps {
  diagnosis: CongestionDiagnosis;
  detectors: DetectorReading[];
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ diagnosis, detectors }) => {
  const getStatusBadge = () => {
    switch (diagnosis.state) {
      case 'congested':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            壅塞相變中 (Congested)
          </span>
        );
      case 'meta_stable':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            亞穩態臨界 (Meta-stable)
          </span>
        );
      case 'free':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            自由暢通流 (Free Flow)
          </span>
        );
    }
  };

  const formatSeconds = (sec: number | null) => {
    if (sec === null) return '持續擴展 (無解)';
    if (sec === 0) return '即將消散';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} 分 ${s} 秒`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-5 backdrop-blur-md">
      {/* 1. Header & Primary Diagnosis */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              交通流相變與塞車定量診斷中心
            </h2>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-slate-500">成因診斷:</span>
            <span className="text-slate-200 font-medium">{diagnosis.cause}</span>
          </p>
        </div>
      </div>

      {/* 2. Three Core Questions Direct Answers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Question 1: 何時開始塞車 */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              Q1: 何種情況下會開始塞車？
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>流入需求 q_in:</span>
              <span className="font-mono text-slate-200">{diagnosis.inflowRateVehPerHour} veh/h</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>斷面消散容量 Q_d:</span>
              <span className="font-mono text-slate-200">{diagnosis.dischargeCapacityVehPerHour} veh/h</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>臨界相變條件:</span>
              <span className={`font-medium ${diagnosis.inflowRateVehPerHour > diagnosis.dischargeCapacityVehPerHour ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                {diagnosis.inflowRateVehPerHour > diagnosis.dischargeCapacityVehPerHour ? '需求超出容量 (引爆)' : '低於崩潰閥值'}
              </span>
            </div>
          </div>
        </div>

        {/* Question 2: 塞車會持續多久 */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Q2: 塞車會持續多久？(預估消散)
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>排隊長度:</span>
              <span className="font-mono text-slate-200">
                {diagnosis.queueLengthMeters > 0 ? `${diagnosis.queueLengthMeters} 公尺` : '無排隊'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>累積延誤車輛:</span>
              <span className="font-mono text-slate-200">{diagnosis.excessVehicles} 輛</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>預估緩解時間:</span>
              <span className={`font-mono font-bold ${diagnosis.estimatedClearSeconds !== null ? 'text-sky-400' : diagnosis.isCongested ? 'text-rose-400' : 'text-emerald-400'}`}>
                {diagnosis.isCongested ? formatSeconds(diagnosis.estimatedClearSeconds) : '目前順暢'}
              </span>
            </div>
          </div>
        </div>

        {/* Question 3: 什麼狀況下會緩解 */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              Q3: 什麼狀況下會緩解？
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <p className="leading-relaxed">
              {diagnosis.isCongested
                ? diagnosis.inflowRateVehPerHour > diagnosis.dischargeCapacityVehPerHour
                  ? `需將流入降至 ${diagnosis.dischargeCapacityVehPerHour - 300} veh/h 以下，或啟用匝道儀控/可變速限平滑衝擊波。`
                  : `當前消散速率優於流入量，正以穩定放行速率消退排隊中。`
                : '保持流入量低於瓶頸容量，或維持車流密度 < 25 veh/km/lane 即可避免相變。'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Detailed Physics Shockwave Metrics Banner */}
      <div className="bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">衝擊波逆流速度 (w):</span>
          <span className={`font-mono font-bold text-sm ${diagnosis.shockwaveSpeedKmh < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
            {diagnosis.shockwaveSpeedKmh} km/h
          </span>
          <span className="text-[10px] text-slate-500">(負值代表衝擊波向上游蔓延)</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">容量驟降損失 (Capacity Drop):</span>
          <span className="font-mono text-amber-400 font-bold">-{diagnosis.capacityDropPercent}%</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">全線平均車速:</span>
          <span className="font-mono text-slate-200 font-bold">{diagnosis.avgSpeedKmh} km/h</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">平均車流密度:</span>
          <span className="font-mono text-slate-200 font-bold">{diagnosis.densityVehPerKmPerLane} veh/km/線</span>
        </div>
      </div>

      {/* 4. Virtual Loop Detectors Table */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-blue-400" />
          全線虛擬環道偵測器即時監測 (Virtual Loop Detectors)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {detectors.map((det, idx) => (
            <div key={idx} className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 text-xs flex justify-between items-center">
              <div>
                <div className="font-medium text-slate-300">{det.label}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  密度: {det.densityVehPerKm} veh/km | 流量: {det.flowVehPerHour} veh/h
                </div>
              </div>
              <div className="text-right">
                <span className={`font-mono text-sm font-bold ${det.speedKmh < 35 ? 'text-rose-400' : det.speedKmh < 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {det.speedKmh}
                </span>
                <span className="text-[10px] text-slate-500 ml-1">km/h</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
