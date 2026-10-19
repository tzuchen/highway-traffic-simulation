# 高速公路車流與塞車相變模擬分析系統 (Highway Traffic Flow & Congestion Simulator)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-purple.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-38bdf8.svg)](https://tailwindcss.com/)

一個兼具**即時物理視覺化**與**交通工程定量分析**的高速公路車流模擬平台。透過微觀車輛跟馳與宏觀衝擊波理論，精準解答交通工程三大核心問題：
1. **何種情況下會開始塞車？**（瓶頸臨界容量、匯入交織崩潰、字串不穩定性）
2. **塞車會持續多久？**（容量驟降效應 Capacity Drop、排隊長度與累積延誤量計算）
3. **什麼狀況下會緩解？**（供需逆轉閥值、匝道儀控、可變速限、自駕車平滑抑制）

---

## 📸 系統功能亮點

* **微觀物理核心**：
  * **IDM（Intelligent Driver Model）**：採用彈道積分（Ballistic Integration）與精確停車解算（Exact Stopping），消除數值震盪與負速錯誤。
  * **MOBIL（Minimizing Overall Braking Induced by Lane changes）**：博弈型安全與利益換道模型，內建 3 秒冷卻防乒乓跳道與車道縮減強制匯入機制。
* **宏觀交通流定量診斷**：
  * **衝擊波逆流速度追蹤**：$w = \frac{\Delta q}{\Delta k}$ 即時測量塞車波向上游逆行速度。
  * **動態消散倒數預測**：結合 $12\%$ 容量驟降效應，$T_{clear} = \frac{N_{excess}}{Q_d - q_{in}}$ 即時推算完全緩解所需時間。
  * **虛擬環道偵測器陣列**：即時輸出上游、瓶頸段與下游的流量（$q$）、密度（$k$）與調和平均車速（$v$）。
* **雙視覺化視圖**：
  * **2D 高速公路俯視動態**：支援平移、縮放、全景重置，依即時車速色彩漸層映射並即時呈現煞車紅光尾燈。
  * **時空軌跡圖（Space-Time Diagram, $x-t$ 平面）**：車輛前進軌跡直觀展示，逆流衝擊波斜率與排隊長度一目了然。
* **四大經典實驗情境**：
  1. **車道縮減瓶頸（Lane Drop）**：3 線道於 1300m 處縮減為 2 線道。
  2. **匝道匯流交織（On-ramp Merge）**：交流道高流量匯入引發主線崩潰。
  3. **幽靈塞車測試場（Phantom Jam）**：均勻高密度車流中點煞觸發的連鎖停走波。
  4. **突發事故封閉（Accident Blockage）**：中間車道事故封閉與排除後的消散動態。

---

## 🚀 快速上手 (Quick Start)

### 依賴環境
* Node.js >= 18.0.0
* npm

### 安裝與啟動
```bash
# 1. 複製儲存庫
git clone https://github.com/tzuchen/highway-traffic-simulation.git
cd highway-traffic-simulation

# 2. 安裝依賴套件
npm install

# 3. 啟動本地開發伺服器
npm run dev
```

瀏覽器訪問：`http://localhost:3000`

### 建置生產版本
```bash
npm run build
npm run preview
```

---

## 📐 核心理論與公式

### 1. IDM 跟馳加速度
$$\frac{dv}{dt} = a \left[ 1 - \left(\frac{v}{v_0}\right)^\delta - \left(\frac{s^*(v, \Delta v)}{s}\right)^2 \right]$$

$$s^*(v, \Delta v) = s_0 + \max\left(0, v T + \frac{v \Delta v}{2\sqrt{ab}}\right)$$

### 2. LWR 衝擊波速度
$$w = \frac{q_2 - q_1}{k_2 - k_1}$$

### 3. 排隊消散時間預估
$$T_{clear} = \frac{N_{excess}}{Q_{discharge} - q_{inflow}} \quad (q_{inflow} < Q_{discharge})$$

其中 $Q_{discharge} = (1 - d) \times C_{bottleneck}$，容量驟降係數 $d \approx 0.12$。

---

## 📄 授權條款
MIT License
