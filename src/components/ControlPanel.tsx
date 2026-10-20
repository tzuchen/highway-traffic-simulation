import React from 'react';
import { Play, Pause, RotateCcw, Zap, AlertTriangle, ShieldCheck, Sliders, FastForward, Plus, Minus } from 'lucide-react';
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
  onSpawnSpeeder: () => void;
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
  onSpawnSpeeder,
}) => {
  const speedOptions = [0.5, 1, 2, 5];

  const handleInflowChange = (val: number) => {
    const clamped = Math.max(1500, Math.min(5500, val));
    onChangeParams({ inflowVehPerHour: clamped });
  };

  const handleTruckChange = (val: number) => {
    const clamped = Math.max(0, Math.min(40, val));
    onChangeParams({ truckPercentage: clamped });
  };

  const handleAccChange = (val: number) => {
    const clamped = Math.max(0, Math.min(50, val));
    onChangeParams({ accPercentage: clamped });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col gap-5 backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          即時控制與干預實驗台
        </h2>
        {/* Play / Pause / Reset controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onTogglePlay}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isRunning ? '暫停' : '播放'}</span>
            <kbd className="text-[9px] px-1 py-0.2 bg-black/30 rounded font-mono font-normal">Space</kbd>
          </button>

          <button
            onClick={onReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all border border-slate-800 cursor-pointer"
            title="重設車流 (快捷鍵 R)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>


          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[11px] font-mono">
            {speedOptions.map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
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

      {/* Sliders Grid with Quick +/- Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Inflow Slider */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">流入量 (Inflow):</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleInflowChange(params.inflowVehPerHour - 200)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="減少 200"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono text-blue-400 font-bold px-1.5 py-0.5 bg-blue-950/80 rounded border border-blue-900/60">
                {params.inflowVehPerHour} <span className="text-[10px] text-slate-400 font-normal">veh/h</span>
              </span>
              <button
                onClick={() => handleInflowChange(params.inflowVehPerHour + 200)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="增加 200"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="py-1">
            <input
              type="range"
              min={1500}
              max={5500}
              step={100}
              value={params.inflowVehPerHour}
              onInput={(e) => handleInflowChange(Number((e.target as HTMLInputElement).value))}
              onChange={(e) => handleInflowChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>離峰 1500</span>
            <span className="text-amber-500/80 font-medium">臨界 ~3600</span>
            <span>尖峰 5500</span>
          </div>
        </div>

        {/* Truck Mix */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">大貨車比例 (Truck):</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleTruckChange(params.truckPercentage - 5)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="減少 5%"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono text-amber-400 font-bold px-1.5 py-0.5 bg-amber-950/80 rounded border border-amber-900/60">
                {params.truckPercentage}%
              </span>
              <button
                onClick={() => handleTruckChange(params.truckPercentage + 5)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="增加 5%"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="py-1">
            <input
              type="range"
              min={0}
              max={40}
              step={5}
              value={params.truckPercentage}
              onInput={(e) => handleTruckChange(Number((e.target as HTMLInputElement).value))}
              onChange={(e) => handleTruckChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>時距大、加減速慢</span>
            <span>40%</span>
          </div>
        </div>

        {/* ACC Jam-Buster Mix */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">自駕車/ACC (Buster):</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleAccChange(params.accPercentage - 5)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="減少 5%"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono text-cyan-400 font-bold px-1.5 py-0.5 bg-cyan-950/80 rounded border border-cyan-900/60">
                {params.accPercentage}%
              </span>
              <button
                onClick={() => handleAccChange(params.accPercentage + 5)}
                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="增加 5%"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="py-1">
            <input
              type="range"
              min={0}
              max={50}
              step={5}
              value={params.accPercentage}
              onInput={(e) => handleAccChange(Number((e.target as HTMLInputElement).value))}
              onChange={(e) => handleAccChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>吸收煞車波、平滑車流</span>
            <span>50%</span>
          </div>
        </div>
      </div>

      {/* Action Triggers & Mitigations */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80">
        <button
          onClick={onSpawnSpeeder}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-rose-950/70 hover:bg-rose-900/90 text-rose-200 border border-rose-700/80 transition-all shadow-sm shadow-rose-950/50 cursor-pointer active:scale-95 group"
          title="投放一輛 150 km/h 極端狂飆、零禮貌度、頻繁穿梭超車的車輛，觀察其對全線車流衝擊波的破壞效應！(快捷鍵 S)"
        >
          <span className="text-sm group-hover:scale-110 transition-transform">🏎️</span>
          <span>投放狂飆車</span>
          <kbd className="text-[9px] px-1 py-0.2 bg-rose-900/80 border border-rose-600/70 rounded font-mono text-rose-200">S</kbd>
        </button>

        <button
          onClick={onTriggerPhantomBrake}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 transition-all shadow-sm cursor-pointer active:scale-95"
          title="手動觸發車流前車急煞波 (快捷鍵 B)"
        >
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          <span>觸發幽靈點煞</span>
          <kbd className="text-[9px] px-1 py-0.2 bg-purple-900/60 border border-purple-700/60 rounded font-mono text-purple-200">B</kbd>
        </button>


        <button
          onClick={onToggleIncident}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-sm border cursor-pointer active:scale-95 ${
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
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer active:scale-95 ${
            params.rampMeteringActive
              ? 'bg-blue-600 text-white border-blue-400 shadow-md'
              : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>匝道儀控: {params.rampMeteringActive ? '已開啟' : '關閉'}</span>
        </button>

        <button
          onClick={() => onChangeParams({ variableSpeedLimitActive: !params.variableSpeedLimitActive })}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer active:scale-95 ${
            params.variableSpeedLimitActive
              ? 'bg-blue-600 text-white border-blue-400 shadow-md'
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
