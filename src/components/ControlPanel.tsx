import React from 'react';
import { Play, Pause, RotateCcw, Zap, AlertTriangle, ShieldCheck, Sliders, FastForward } from 'lucide-react';
import { SimulationParams } from '../sim/simulation';

interface ControlPanelProps {
  isRunning: boolean;
  onTogglePlay: () => void;
  speedMultiplier: number;
  onChangeSpeed: (multiplier: number) => void;
  onReset: () => void;
  params: SimulationParams;
  onChangeParams: (newParams: Partial<SimulationParams>) => void;
  onTriggerPhantomBrake: () => void;
  onToggleIncident: () => void;
  hasActiveIncident: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning,
  onTogglePlay,
  speedMultiplier,
  onChangeSpeed,
  onReset,
  params,
  onChangeParams,
  onTriggerPhantomBrake,
  onToggleIncident,
  hasActiveIncident,
}) => {
  const speedOptions = [0.5, 1, 2, 5];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          即時控制與干預實驗台
        </h2>
        {/* Play / Pause / Reset controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onTogglePlay}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? '暫停' : '播放'}</span>
          </button>

          <button
            onClick={onReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all border border-slate-800"
            title="重設車流"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px] font-mono">
            {speedOptions.map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-2 py-1 rounded transition-all ${
                  speedMultiplier === s
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Inflow Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">上游流入量 (Inflow Demand):</span>
            <span className="font-mono text-blue-400 font-bold">{params.inflowVehPerHour} veh/h</span>
          </div>
          <input
            type="range"
            min={1500}
            max={5500}
            step={100}
            value={params.inflowVehPerHour}
            onChange={(e) => onChangeParams({ inflowVehPerHour: Number(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>離峰 1500</span>
            <span>瓶頸極限 ~3600</span>
            <span>尖峰 5500</span>
          </div>
        </div>

        {/* Truck Mix */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">大貨車比例 (Truck Ratio):</span>
            <span className="font-mono text-amber-400 font-bold">{params.truckPercentage}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={5}
            value={params.truckPercentage}
            onChange={(e) => onChangeParams({ truckPercentage: Number(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>加減速慢、車距大</span>
            <span>40%</span>
          </div>
        </div>

        {/* ACC Jam-Buster Mix */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">自駕車/ACC (Jam-Buster):</span>
            <span className="font-mono text-cyan-400 font-bold">{params.accPercentage}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={params.accPercentage}
            onChange={(e) => onChangeParams({ accPercentage: Number(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>緊跟平滑、吸收煞車波</span>
            <span>50%</span>
          </div>
        </div>
      </div>

      {/* Action Triggers & Mitigations */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
        <button
          onClick={onTriggerPhantomBrake}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 transition-all shadow-sm"
        >
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span>觸發幽靈點煞</span>
        </button>

        <button
          onClick={onToggleIncident}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm border ${
            hasActiveIncident
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 animate-pulse'
              : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border-rose-800/60'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>{hasActiveIncident ? '排除事故路障' : '製造突發事故'}</span>
        </button>

        <button
          onClick={() => onChangeParams({ rampMeteringActive: !params.rampMeteringActive })}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
            params.rampMeteringActive
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>匝道儀控: {params.rampMeteringActive ? '已開啟' : '關閉'}</span>
        </button>

        <button
          onClick={() => onChangeParams({ variableSpeedLimitActive: !params.variableSpeedLimitActive })}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
            params.variableSpeedLimitActive
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <FastForward className="w-3.5 h-3.5 text-sky-400" />
          <span>可變速限 (VSL): {params.variableSpeedLimitActive ? '60 km/h' : '自由'}</span>
        </button>
      </div>
    </div>
  );
};
