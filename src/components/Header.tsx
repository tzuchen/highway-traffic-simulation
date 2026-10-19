import React from 'react';
import { Activity, Car, GitMerge, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { ScenarioType } from '../sim/types';
import { SCENARIOS } from '../sim/scenarios';

interface HeaderProps {
  currentScenario: ScenarioType;
  onSelectScenario: (scenario: ScenarioType) => void;
  simTime: number;
  vehicleCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentScenario,
  onSelectScenario,
  simTime,
  vehicleCount,
}) => {
  const scenarioKeys: ScenarioType[] = ['lane_drop', 'on_ramp', 'phantom_jam', 'accident'];

  const getScenarioIcon = (type: ScenarioType) => {
    switch (type) {
      case 'lane_drop':
        return <GitMerge className="w-4 h-4 text-amber-400" />;
      case 'on_ramp':
        return <Car className="w-4 h-4 text-sky-400" />;
      case 'phantom_jam':
        return <Zap className="w-4 h-4 text-purple-400" />;
      case 'accident':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-500/30">
          <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            高速公路車流與塞車相變模擬分析系統
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300">
              IDM + MOBIL + LWR
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            物理微觀跟馳與宏觀衝擊波定量預測實驗平台
          </p>
        </div>
      </div>

      {/* Scenario Selector Tabs */}
      <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
        {scenarioKeys.map((key) => {
          const sc = SCENARIOS[key];
          const isActive = currentScenario === key;
          return (
            <button
              key={key}
              onClick={() => onSelectScenario(key)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              {getScenarioIcon(key)}
              <span>{sc.title.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Real-time Status Badges */}
      <div className="flex items-center space-x-3 text-xs font-mono">
        <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 text-slate-300">
          <span className="text-slate-500">車流數:</span>
          <span className="text-emerald-400 font-bold">{vehicleCount} 輛</span>
        </div>
        <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 text-slate-300">
          <span className="text-slate-500">模擬時長:</span>
          <span className="text-blue-400 font-bold">{formatTime(simTime)}</span>
        </div>
      </div>
    </header>
  );
};
