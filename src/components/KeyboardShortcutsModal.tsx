import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: '播放 / 暫停模擬 (Play / Pause)' },
    { key: 'R', desc: '重設當前情境 (Reset Simulation)' },
    { key: '1 - 4', desc: '快速切換 4 大經典交通流情境' },
    { key: 'S', desc: '投放狂飆超速超車狂 (Spawn Speeder)' },
    { key: 'F', desc: '鏡頭自動聚焦至塞車波前 / 瓶頸點' },
    { key: 'B', desc: '手動觸發幽靈車流急煞波' },
    { key: 'Esc', desc: '取消選取車輛 / 關閉說明彈窗' },
    { key: '?', desc: '開啟 / 關閉本快捷鍵指南' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <span>鍵盤快捷鍵指南 (Keyboard Shortcuts)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          {shortcuts.map((sc, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-300">{sc.desc}</span>
              <kbd className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-md font-mono text-[11px] text-cyan-300 font-bold shadow-inner">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>提示：在畫布上可直接點擊車輛進行微觀物理檢視</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-200 rounded-lg font-medium transition-all cursor-pointer"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
