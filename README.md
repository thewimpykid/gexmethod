# Options Exposure Dashboard

A real-time **Gamma / Delta / Charm / Vanna Exposure** dashboard for US equity options, built with Next.js. Data is pulled live from Yahoo Finance (free, no API key required, ~15-minute delay). All Greeks are computed server-side via Black-Scholes.

---

## Live features

| Chart | What it shows |
|-------|--------------|
| **GEX Profile** | Net gamma exposure per strike — call vs put toggle, gamma flip level, call/put walls |
| **DEX Profile** | Net delta exposure per strike — same layout as GEX |
| **GEX Heatmap** | Net GEX across every strike × expiration in an institutional-style grid |
| **CEX Heatmap** | Charm exposure — where delta will drift passively as time passes |
| **VEX Heatmap** | Vanna exposure — where dealer deltas shift when implied volatility moves |

Additional indicators:
- **Gamma regime banner** — POSITIVE / NEGATIVE gamma with plain-English description
- **Key levels card row** — Net GEX, Net DEX, Gamma Flip, Call Wall, Put Wall
- **NQ mode toggle** — converts all QQQ strike prices to equivalent NQ futures levels
- Auto-refreshes every 60 seconds

---

## Exposure definitions

### GEX — Gamma Exposure
```
GEX = gamma × OI × multiplier × spot² × 0.01
```
Measures how much dealers must hedge per $1 move in the underlying.  
- **Positive GEX** → dealers are net long gamma → they sell rallies and buy dips → price-suppressing, mean-reverting regime  
- **Negative GEX** → dealers are net short gamma → they buy rallies and sell dips → trend-amplifying, volatile regime

**Gamma flip** — the strike where per-strike netGex crosses zero nearest to spot. Below it: negative gamma territory. Above it: positive gamma territory.  
**Call wall** — strike with the largest call GEX concentration (strong dealer resistance).  
**Put wall** — strike with the largest put GEX concentration (support / acceleration zone).

### DEX — Delta Exposure
```
DEX = delta × OI × multiplier × spot
```
Total dollar delta dealers are carrying across all strikes. Shows the directional lean of the options market and where dealer rebalancing flows will be largest.

### CEX — Charm Exposure
```
charm  = N′(d1) × (r / (σ√T) − d2 / (2T))
CEX    = charm × OI × multiplier × spot
```
Charm is dDelta/dT — how much dealer deltas change purely from the passage of time, even if price stays flat.  
- **Positive CEX zones** → dealers need to buy hedges as expiry approaches (passive buy drift)  
- **Negative CEX zones** → dealers need to sell hedges as expiry approaches (passive sell drift)  
- Hotspots are most relevant for near-term expirations (0DTE, 1DTE)

### VEX — Vanna Exposure
```
vanna  = −N′(d1) × d2 / σ
VEX    = vanna × OI × multiplier × spot
```
Vanna is dDelta/dσ — how much dealer deltas change when implied volatility moves.  
- **Positive VEX zones** → dealers need to buy when vol rises (vol-driven buy flow)  
- **Negative VEX zones** → dealers need to sell when vol rises (vol-driven sell flow)  
- A vol spike or vol crush forces the most hedging activity at VEX hotspot strikes

---

## Tech stack

- **Framework** — Next.js 16 (App Router, TypeScript)
- **Data** — Yahoo Finance v7 options API (free, ~15 min delayed, crumb/cookie auth)
- **Charts** — Recharts (GEX/DEX profiles), inline CSS heatmaps (GEX/CEX/VEX grids)
- **Styling** — Tailwind CSS v4
- **Greeks** — Black-Scholes computed server-side (Abramowitz & Stegun CND, accurate to 7.5e-8)

No external paid data provider. No API key needed.

---

## Getting started

### Prerequisites
- Node.js 18+
- npm

### Install and run

```bash
git clone https://github.com/thewimpykid/gexmethod.git
cd gexmethod
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                  # Main dashboard — polling, NQ mode, layout
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── gex/
│           └── route.ts          # Server route — Yahoo Finance fetch + GEX/DEX/CEX/VEX calculation
├── components/
│   ├── GexChart.tsx              # GEX bar chart profile (Recharts)
│   ├── DexChart.tsx              # DEX bar chart profile (Recharts)
│   ├── GexHeatmap.tsx            # GEX strike × expiry heatmap
│   ├── CexHeatmap.tsx            # CEX strike × expiry heatmap
│   ├── VexHeatmap.tsx            # VEX strike × expiry heatmap
│   ├── KeyLevels.tsx             # Key levels card row
│   └── SymbolSelector.tsx        # Ticker selector
└── lib/
    ├── blackScholes.ts           # Greeks: delta, gamma, charm, vanna
    ├── gexCalculator.ts          # GEX/DEX/CEX/VEX accumulation + summary
    └── types.ts                  # Shared TypeScript interfaces
```

---

## Supported symbols

Any US equity or ETF with listed options on Yahoo Finance works.  
Pre-configured multiplier (100 contracts/share) for: `QQQ`, `SPY`, `SPX`, `SPXW`, `IWM`, `XSP`.  
All other symbols default to a 100 multiplier.

The NQ futures conversion toggle is available whenever QQQ is selected (or any symbol where Yahoo Finance also returns `NQ=F` pricing).

---

## Heatmap layout

Each heatmap shows:
- **Rows** — one per listed strike within ±10% of current spot (~50–80 rows)
- **Columns** — up to 6 near-term expirations
- **Cells** — annotated with the exposure value in `$K` / `$M` / `$B` format
- **Gold outline** — marks the current spot price row
- **Color bar** — right-side vertical gradient legend

| Heatmap | Positive color | Neutral | Negative color |
|---------|---------------|---------|----------------|
| GEX     | Bright yellow | Blue    | Dark purple    |
| CEX     | Vivid orange  | Dark teal | Indigo-violet |
| VEX     | Cyan-teal     | Navy    | Hot pink-magenta |

---

## Data notes

- Yahoo Finance options data is approximately **15 minutes delayed**
- The dashboard auto-refreshes every **60 seconds**
- The Yahoo Finance session (crumb + cookie) is cached server-side for 50 minutes and refreshed automatically
- Strike range for API fetch: ±25% of spot (server-side filter)
- Strike range displayed in heatmaps: ±10% of spot
- Maximum expirations fetched: 10 (nearest term)

---

## Disclaimer

This tool is for **informational and educational purposes only**. It does not constitute financial advice. Options Greeks computed from delayed data with constant risk-free rate (4.5%) and no dividend adjustment. Use at your own risk.
