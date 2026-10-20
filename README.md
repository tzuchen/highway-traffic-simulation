# 高速公路車流與塞車相變模擬分析系統 (Highway Traffic Flow & Congestion Simulator)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-purple.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-37%20Passed-brightgreen.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一個兼具**微觀高保真物理動態**、**真實駕駛行為決策**與**宏觀交通工程定量分析**的高性能高速公路車流模擬平台。精準模擬瓶頸回堵、車道縮減、匝道匯流、幽靈塞車震盪波與各類駕駛個性，解答交通工程核心三大難題：
1. **何種情況下會引爆塞車？**（臨界容量崩潰、匯入交織紊流、單車急煞誘發之字串不穩定性）
2. **塞車會如何蔓延與持續多久？**（排隊長度增長、容量驟降效應 Capacity Drop、逆向衝擊波速）
3. **如何有效緩解與疏導？**（可變速限、匝道儀控、動態消散倒數預測）

---

## 🌟 系統特色與最新升級亮點

### 🔍 1. 全路段雷達放大鏡 ＋ 橫縱 1:1 等比例微觀真實視野
- **徹底終結視角縮放幾何失真**：舊型模擬器在拉遠視角時常因橫縱座標比例不均導致車身與車道嚴重變形。
- **圖一：全路段概覽雷達圖（Full Corridor Overview）**：
  - 完整呈現 0 – 2000m 高速公路全線車流、瓶頸路段與回堵震盪波。
  - 疊加**半透明互動式放大鏡視窗（Interactive Loupe Viewport）**，支援滑鼠隨意拖曳、點選任意里程跳轉或鎖定車輛追蹤。
- **圖二：微觀等比例真實細部圖（Detailed Microscopic 1:1 View）**：
  - 放大鏡對應區域以**橫縱嚴格 1:1 等比例（$s_x = s_y$）**高解析渲染，車身尺寸、車道寬度（3.75m）與車距皆為真實物理尺度。
  - 具備指數阻尼相機平滑平移（Camera Lerp），切換視角如絲般順暢。

### 🚗 2. 高保真車輛動力學與阿克曼前輪轉向幾何
- **嚴格非完整滾動約束（Non-Holonomic Rolling Constraint）**：
  - 車身航向角 $\psi$ 於每微秒嚴格對齊位移速度向量（$\theta_v = \operatorname{atan2}(\dot{y}, \dot{x})$），**徹底消滅如氣墊船般的「螃蟹式 Y 軸側向漂移」（Zero Side-Slip: $\beta \equiv 0$）**。
- **阿克曼前輪獨立轉向與反向回正（Counter-Steer）**：
  - 前輪角度 $\delta$ 隨五次多項式軌跡曲率獨立動態轉向；在換道中後段主動進行**反向轉向回正**以煞停側向慣性，完美重現真車操駕動態。
- **低速大角度切入與車身外擺（Swung Footprint）**：
  - 依當前車速自適應計算匯入距離 $L_{\text{merge}}(v)$。在低速塞車擠入時，小車轉向偏角達 **$20^\circ \sim 25^\circ$**，大卡車轉向角達 **$14^\circ \sim 16^\circ$**，車頭與車尾真實突出跨越相鄰車道。
- **五次多項式平滑軌跡（Quintic Polynomial Transition）**：
  - 換道側向軌跡採用 $q(p) = 10p^3 - 15p^4 + 6p^5$，起點與終點之側向速度與加速度均嚴格為零，換道平順無折角。
- **精緻視覺光影細節**：
  - 換道時 4Hz 同步閃爍琥珀色方向燈、車頭投射動態半透明大燈光錐（Headlights）、夜行模式與煞車紅光尾燈。

### 🏎️ 3. 狂飆超速超車狂（Speeder / Speed Demon）與單鍵投放
- **專屬車種與極端個性**：
  - 期望車速高達 **$145 \sim 160\text{ km/h}$**，突破法規速限拘束（`obeysSpeedLimit = false`）。
  - 安全車頭時距壓至極限 $T = 0.7\text{s}$，最大加速度 $a_{\max} = 3.2\text{ m/s}^2$。
- **極度自私與無情超車決策**：
  - 換道門檻 $a_{\text{th}} = 0.03\text{ m/s}^2$、禮貌度 $p \le 0.01$、換道冷卻時間縮短至 $0.8\text{s}$，在車流縫隙中左穿右插。
- **一鍵投放（單鍵觸發）**：
  - 控制面板提供專屬按鈕 **「🏎️ 投放狂飆車 (S)」**，亦可隨時敲擊鍵盤 **<kbd>S</kbd>**。
  - 系統於起點最暢通車道以約 $137\text{ km/h}$ 瞬間彈射進道，並自動選取車輛且鎖定放大鏡鏡頭追蹤。
- **即時交通破壞指數 HUD**：
  - 即時診斷該狂飆車對公路造成的連鎖衝擊：
    * ⚡ **超車次數 (`overtakeCount`)**：累計超越前車總數。
    * 🚨 **誘發急煞 (`inducedBrakesCount`)**：逼迫後車採取緊急煞車（$a \le -2.0\text{ m/s}^2$）引發回傳震盪波的次數。
    * ⚠️ **超速幅度 (`speedingPct`)**：高於道路限速的即時百分比。

### 🧠 4. 智慧出車與塞車擠入機制
- **兩段式非同步出車（Asynchronous Poisson Spawning）**：
  - 各車道不再齊頭並進，改採獨立隨機泊松間隔出車，更加貼近現實車流分佈。
- **出車動態降速與安全防撞適配**：
  - 出車時即時感知起點下游車速與空間，若前方遭遇回堵，自動下調進道初速並收窄間距，杜絕進場即追撞。
- **車道速度差超前感知（Downstream Speed Gradient Bonus）**：
  - 駕駛視線超前掃描下游 75m 車流速度；當相鄰車道顯著暢通時，獲得額外換道動能加成（$+0.35 \sim +1.2\text{ m/s}^2$）。
- **駕駛急躁度累積與主動縫隙擠入（Impatience & Squeezing）**：
  - 受困於慢速車道時累積急躁度 $I_{\text{impatience}}$，禮貌度自然下降、超車門檻降低，後車煞車容許度適度放寬，展現塞車時「往暢通車道擠」的真實現象。
- **壅塞中途換道慢速蠕行前進（Creep Forward Guarantee）**：
  - 當車輛卡在兩車道中間且車速過低時，主動施加溫和蠕行加速度（$3 \sim 7\text{ km/h}$）持續推進，破除死鎖卡死。

### 📊 5. 宏觀交通工程定量診斷
- **LWR 逆向衝擊波速追蹤**：$w = \frac{\Delta q}{\Delta k}$，精確量測塞車波向上游回傳速率。
- **動態消散倒數預測**：考量 12% 容量驟降效應（Capacity Drop），動態推算完全緩解所需時間 $T_{\text{clear}}$。
- **時空軌跡圖（Space-Time Diagram, $x-t$ 平面）**：GPU 批次化渲染數萬條軌跡，塞車波斜率與排隊長度一目了然。

---

## 🚘 車種與駕駛個性矩陣

| 車種 / 個性 | 外觀代表色 | 期望車速 ($v_0$) | 車頭時距 ($T$) | 換道門檻 ($a_{\text{th}}$) | 禮貌度 ($p$) | 駕駛風格說明 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **🏎️ 狂飆超車狂 (Speeder)** | 螢光玫瑰紅 + 賽車雙白線 | $145 \sim 160\text{ km/h}$ | $0.65 \sim 0.8\text{ s}$ | $0.03\text{ m/s}^2$ | $0.01$ | 忽視限速、貼車極近、連續穿梭、誘發後車急煞塞車波 |
| **⚡ 積極超車型 (Aggressive)** | 琥珀金黃色 | $125 \sim 138\text{ km/h}$ | $0.95 \sim 1.15\text{ s}$ | $0.12\text{ m/s}^2$ | $0.10$ | 偏好內側快車道、頻繁超車、對慢車容忍度低 |
| **🚗 標準順流型 (Normal)** | 青藍色 / 寶藍色 | $105 \sim 117\text{ km/h}$ | $1.35 \sim 1.65\text{ s}$ | $0.22\text{ m/s}^2$ | $0.35$ | 遵守速限、安分巡航、車流流暢時適度換道 |
| **🛡️ 謹慎防禦型 (Cautious)** | 翡翠草綠色 | $88 \sim 100\text{ km/h}$ | $1.90 \sim 2.50\text{ s}$ | $0.45\text{ m/s}^2$ | $0.60$ | 保留極大安全跟車間距、極少主動超車、高度禮讓後車 |
| **🚛 重型聯結車 (Truck)** | 深金屬鐵灰色 | $80 \sim 90\text{ km/h}$ | $2.20 \sim 2.80\text{ s}$ | $0.50\text{ m/s}^2$ | $0.70$ | 車長 14m、加速緩慢、質量大、轉向外擺輪廓明顯 |

---

## ⌨️ 鍵盤快捷鍵一覽 (Keyboard Shortcuts)

| 快速鍵 | 功能說明 |
| :---: | :--- |
| <kbd>Space</kbd> | 播放 / 暫停模擬（Toggle Play / Pause） |
| <kbd>R</kbd> | 重置當前模擬場景（Reset Scenario） |
| <kbd>S</kbd> | **投放狂飆超速超車狂（Spawn Speeder）並自動鏡頭鎖定跟隨** |
| <kbd>1</kbd> ~ <kbd>4</kbd> | 切換情境：車道縮減（1）、匝道匯流（2）、幽靈塞車（3）、事故封閉（4） |
| <kbd>F</kbd> | 聚焦塞車核心瓶頸段（Focus Jam Bottleneck） |
| <kbd>A</kbd> | 全路段水平最適化視野（Fit Highway View） |
| <kbd>T</kbd> | 開啟 / 關閉即時遠端遙測面板（Toggle Telemetry Overlay） |
| <kbd>+</kbd> / <kbd>-</kbd> | 加速 / 減速模擬運行速率（1x ~ 5x） |
| <kbd>?</kbd> | 開啟快捷鍵說明指南彈窗（Keyboard Shortcuts Modal） |

---

## 🚀 快速上手 (Quick Start)

### 環境需求
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

### 安裝與啟動
```bash
# 1. 複製儲存庫
git clone https://github.com/tzuchen/highway-traffic-simulation.git
cd highway-traffic-simulation

# 2. 安裝依賴套件
npm install

# 3. 啟動 Vite 本地開發伺服器
npm run dev
```

啟動後請以瀏覽器開啟：`http://localhost:3000`

### 執行全套物理與不變量測試
本專案包含 5 組 Vitest 自動化測試套件，涵蓋 37 項物理不變量、邊界奇異點、MOBIL 安全性與壓力測試：
```bash
npm test
```

### 生產版本打包建置
```bash
npm run build
npm run preview
```

---

## 📐 核心理論與公式 (Theoretical Foundations)

### 1. 智慧駕駛人模型 (IDM) 彈道跟馳加速度
$$\frac{dv}{dt} = a \left[ 1 - \left(\frac{v}{v_0}\right)^\delta - \left(\frac{s^*(v, \Delta v)}{s}\right)^2 \right]$$

$$s^*(v, \Delta v) = s_0 + \max\left(0, v T + \frac{v \Delta v}{2\sqrt{ab}}\right)$$

* $v_0$：期望車速（狂飆車為 $145 \sim 160\text{ km/h}$）
* $T$：安全車頭時距（$0.7\text{s} \sim 2.5\text{s}$）
* $s_0$：靜止安全間距（$1.0\text{m} \sim 2.0\text{m}$）
* $a$：最大舒適加速度；$b$：舒適減速度

### 2. MOBIL 換道利益與安全性準則
車輛由當前車道切換至目標車道的觸發條件：
$$\underbrace{\tilde{a}_c - a_c}_{\text{自身加速度增益}} + p \Big( \underbrace{\tilde{a}_n - a_n}_{\text{目標車道新後車損益}} + \underbrace{\tilde{a}_o - a_o}_{\text{原車道舊後車損益}} \Big) + \Delta a_{\text{bias}} > a_{\text{th}}$$

同時滿足後車安全性約束（Safety Criterion）：
$$\tilde{a}_n \ge -b_{\text{safe}}$$

### 3. 非完整滾動路徑切線約束
車身航向角 $\psi$ 與前輪轉向角 $\delta$：
$$\tan\psi(p) = \frac{dy}{dx} = \frac{\Delta y_{\text{lane}} \cdot q'(p)}{L_{\text{merge}}(v)}$$

$$\tan\delta(p) = L_w \cdot \frac{d^2y}{dx^2}$$

其中 $q(p) = 10p^3 - 15p^4 + 6p^5$ 為五次多項式，$L_w$ 為前後輪軸距。

### 4. LWR 衝擊波速度與排隊消散
$$w = \frac{q_2 - q_1}{k_2 - k_1}$$

$$T_{\text{clear}} = \frac{N_{\text{excess}}}{Q_{\text{discharge}} - q_{\text{in}}} \quad (q_{\text{in}} < Q_{\text{discharge}})$$

其中 $Q_{\text{discharge}} = (1 - d) \times C_{\text{bottleneck}}$，容量驟降係數 $d \approx 0.12$。

---

## 📂 專案架構導覽

```text
highway-traffic-simulation/
├── src/
│   ├── components/
│   │   ├── ControlPanel.tsx              # 控制面板（情境、參數、投放狂飆車）
│   │   ├── Header.tsx                    # 頂部導航與狀態指標
│   │   ├── HighwayCanvas.tsx             # 雙畫布視圖（全景雷達圖 + 1:1 細部圖）
│   │   ├── KeyboardShortcutsModal.tsx    # 快捷鍵說明彈窗
│   │   ├── SpaceTimeCanvas.tsx           # 時空軌跡圖畫布
│   │   └── VehicleInspector.tsx          # 車輛即時遙測探針 HUD（破壞指數）
│   ├── renderers/
│   │   ├── OverviewRenderer.ts           # 全路段概覽圖與互動放大鏡渲染器
│   │   ├── DetailedHighwayRenderer.ts    # 橫縱 1:1 等比例微觀渲染器（轉向/光影）
│   │   └── SpaceTimeRenderer.ts          # GPU 批次時空軌跡渲染器
│   ├── sim/
│   │   ├── analytics.ts                  # 交通工程宏觀指標（衝擊波速、消散預估）
│   │   ├── constants.ts                  # 物理常數、車種配置與駕駛個性參數
│   │   ├── idm.ts                        # IDM 跟馳模型與彈道防碰撞解算
│   │   ├── mobil.ts                      # MOBIL 換道決策、急躁度與速度差感知
│   │   ├── simulation.ts                 # 核心模擬引擎、出車邏輯與事件分發
│   │   └── types.ts                      # 核心資料型別定義
│   ├── App.tsx                           # 應用程式主入口與互動狀態管理
│   └── main.tsx                          # React DOM 掛載點
├── tests/
│   ├── analytics.test.ts                 # 宏觀指標單元測試
│   ├── idm.test.ts                       # IDM 物理極限測試
│   ├── invariants.test.ts                # 500 步連續模擬零碰撞壓力測試
│   ├── interaction.test.ts               # 互動遙測、狂飆車、換道中止與非完整約束測試
│   └── mobil.test.ts                     # MOBIL 換道與速度差擠入測試
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 📄 授權條款 (License)
本專案採用 [MIT License](LICENSE) 授權釋出。
