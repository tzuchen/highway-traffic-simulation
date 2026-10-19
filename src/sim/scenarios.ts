import { RoadConfig, ScenarioType } from './types';

export interface ScenarioDefinition {
  type: ScenarioType;
  title: string;
  description: string;
  roadConfig: RoadConfig;
  defaultInflowVehPerHour: number;
  explanation: {
    triggerCondition: string;
    durationMechanism: string;
    clearanceCondition: string;
  };
}

export const SCENARIOS: Record<ScenarioType, ScenarioDefinition> = {
  lane_drop: {
    type: 'lane_drop',
    title: '車道縮減瓶頸 (Lane Drop Bottleneck)',
    description: '3 線道在 1300m 處縮減為 2 線道。當上游總需求超過下游 2 線道通行極限時引爆排隊。',
    defaultInflowVehPerHour: 4200, // 3 lanes @ 1400 -> merges to 2 lanes (capacity ~3600)
    explanation: {
      triggerCondition: '上游流入需求 q_in > 瓶頸下游放行能力 C_bottleneck（約 3,600 veh/h）。',
      durationMechanism: '瓶頸處車輛起步延遲產生約 12% 容量驟降（Capacity Drop），排隊向上游逆流傳播。',
      clearanceCondition: '上游流入率下降至消散容量以下（q_in < 3,200 veh/h），或透過上游可變速限平滑流入。',
    },
    roadConfig: {
      length: 2400,
      numLanes: 3,
      speedLimitKmh: 100,
      lanes: [
        { index: 0, isOpen: true },
        { index: 1, isOpen: true },
        { index: 2, isOpen: true, dropStart: 1250, dropEnd: 1350 }, // Right lane drops
      ],
    },
  },

  on_ramp: {
    type: 'on_ramp',
    title: '交流道匝道匯流 (On-ramp Merge & Weaving)',
    description: '主線 3 車道在 1000m~1300m 處有高流量匝道強行匯入，引發主線車流急煞與交織混亂。',
    defaultInflowVehPerHour: 3800,
    explanation: {
      triggerCondition: '主線高密度車流遇到匝道車輛強行插入，破壞主線車頭時距，誘發微觀煞車波。',
      durationMechanism: '只要匝道持續高流入，主線最外側車道便會持續崩潰並波及內側車道。',
      clearanceCondition: '開啟「匝道儀控（Ramp Metering）」限制匯入率，或主線提前淨空外側車道。',
    },
    roadConfig: {
      length: 2400,
      numLanes: 3,
      speedLimitKmh: 100,
      lanes: [
        { index: 0, isOpen: true },
        { index: 1, isOpen: true },
        { index: 2, isOpen: true },
      ],
      onRamp: {
        start: 1000,
        end: 1250,
        flowVehPerHour: 900,
        active: true,
      },
    },
  },

  phantom_jam: {
    type: 'phantom_jam',
    title: '幽靈塞車測試場 (Phantom Jam / Stop-and-Go)',
    description: '完全無事故、無施工、無縮減車道！高密度均勻車流中，因單一車輛輕微點煞觸發的逆行停走波。',
    defaultInflowVehPerHour: 4800, // High density free flow
    explanation: {
      triggerCondition: '車流密度高於臨界密度 k_c 時，系統處於亞穩態（Meta-stable）。駕駛反應延遲使得微擾被逐車放大。',
      durationMechanism: '衝擊波形成後，以約 -15 ~ -20 km/h 穩定向後方蔓延，即便最初踩煞車的車早已開走。',
      clearanceCondition: '若車流密度下降，或車隊中混入一定比例具平滑效應的 ACC 自駕車吸收煞車波。',
    },
    roadConfig: {
      length: 2400,
      numLanes: 3,
      speedLimitKmh: 100,
      lanes: [
        { index: 0, isOpen: true },
        { index: 1, isOpen: true },
        { index: 2, isOpen: true },
      ],
    },
  },

  accident: {
    type: 'accident',
    title: '突發事故與封閉 (Sudden Accident Blockage)',
    description: '中間車道於 1400m 處發生突發事故停擺，迫使所有車輛緊急變道，模擬排隊累積與排除後的消散動態。',
    defaultInflowVehPerHour: 3600,
    explanation: {
      triggerCondition: '突發車道物理封閉，通行斷面瞬間損失 33% 以上容量。',
      durationMechanism: '車輛在事故點前強行向兩側擠壓換道，導致三線全線癱瘓。',
      clearanceCondition: '事故排除後，車輛逐步以消散容量 Q_discharge 加速駛離，累積排隊線性遞減消散。',
    },
    roadConfig: {
      length: 2400,
      numLanes: 3,
      speedLimitKmh: 100,
      lanes: [
        { index: 0, isOpen: true },
        { index: 1, isOpen: true },
        { index: 2, isOpen: true },
      ],
    },
  },
};
