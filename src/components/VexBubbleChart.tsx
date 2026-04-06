"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { VexHeatmapCell } from "@/lib/types";

const POS    = "#00dcc8";  // cyan-teal  — positive vanna
const NEG    = "#f43f5e";  // rose-red   — negative vanna
const C_SPOT = "#eab308";  // yellow     — spot line

function fmt(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: BubbleDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-xs font-mono shadow-xl space-y-0.5">
      <p className="text-[#e6edf3] font-bold mb-1">Strike ${d.strike}</p>
      <p className="text-[#8b949e]">Expiry: {d.expiry}</p>
      <p style={{ color: d.netVex >= 0 ? POS : NEG }}>
        VEX: {fmt(d.netVex)}
      </p>
      <p className="text-[#484f58] text-[10px] pt-1">
        {d.netVex >= 0
          ? "Dealers buy when vol rises"
          : "Dealers sell when vol rises"}
      </p>
    </div>
  );
}

interface BubbleDatum {
  x: number;        // expiry index
  y: number;        // strike
  z: number;        // |netVex| for size
  netVex: number;   // signed, for tooltip
  strike: number;
  expiry: string;
}

interface Props {
  cells: VexHeatmapCell[];
  spot: number;
  symbol: string;
  updatedAt: string;
  netVex?: number;
}

export default function VexBubbleChart({ cells, spot, symbol, updatedAt, netVex }: Props) {
  const { expiries, posData, negData, yDomain, zRange, timestamp } = useMemo(() => {
    const expiries = [...new Set(cells.map((c) => c.expiry))].sort().slice(0, 6);
    const expiryIdx: Record<string, number> = Object.fromEntries(expiries.map((e, i) => [e, i]));

    const range = spot * 0.10;
    const inRange = (s: number) => s >= spot - range && s <= spot + range;

    const posData: BubbleDatum[] = [];
    const negData: BubbleDatum[] = [];

    for (const c of cells) {
      if (!expiries.includes(c.expiry)) continue;
      if (!inRange(c.strike)) continue;
      if (c.netVex === 0) continue;
      const datum: BubbleDatum = {
        x: expiryIdx[c.expiry],
        y: c.strike,
        z: Math.abs(c.netVex),
        netVex: c.netVex,
        strike: c.strike,
        expiry: c.expiry,
      };
      if (c.netVex >= 0) posData.push(datum);
      else negData.push(datum);
    }

    const strikes = [...posData, ...negData].map((d) => d.y);
    const yMin = strikes.length ? Math.min(...strikes) : spot * 0.9;
    const yMax = strikes.length ? Math.max(...strikes) : spot * 1.1;
    const yPad = (yMax - yMin) * 0.05;

    const allZ = [...posData, ...negData].map((d) => d.z);
    const maxZ = allZ.length ? Math.max(...allZ) : 1;
    // Scale bubble radii: smallest meaningful = 8px area, largest = 2200px area
    const zRange: [number, number] = [Math.max(80, maxZ > 0 ? 80 : 80), 2200];

    return {
      expiries,
      posData,
      negData,
      yDomain: [yMin - yPad, yMax + yPad] as [number, number],
      zRange,
      timestamp: fmtTimestamp(updatedAt),
    };
  }, [cells, spot, updatedAt]);

  if (!cells.length || (posData.length + negData.length) === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 text-center text-[#8b949e] text-sm font-mono">
        No VEX data available
      </div>
    );
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
            Vanna Exposure · <span className="text-[#e6edf3]">{symbol}</span>
            <span className="text-[#484f58] ml-2 normal-case font-normal">{timestamp}</span>
          </p>
          {/* Net VEX total */}
          {netVex !== undefined && (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-[11px] text-[#8b949e] font-mono">Net VEX</span>
              <span className="text-xl font-bold font-mono" style={{ color: netVex >= 0 ? POS : NEG }}>
                {fmt(netVex)}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  color: netVex >= 0 ? POS : NEG,
                  backgroundColor: netVex >= 0 ? `${POS}18` : `${NEG}18`,
                }}
              >
                {netVex >= 0 ? "+ VANNA" : "− VANNA"}
              </span>
              <span className="text-[10px] text-[#484f58] font-mono">
                {netVex >= 0 ? "dealers net buyers when vol rises" : "dealers net sellers when vol rises"}
              </span>
            </div>
          )}
          <p className="text-[11px] text-[#8b949e] font-mono mt-1">
            Bubble size = |VEX| &nbsp;·&nbsp; Color = sign &nbsp;·&nbsp; Spot{" "}
            <span className="text-[#eab308] font-bold">${spot.toFixed(2)}</span>
          </p>
        </div>
        {/* Legend */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: POS, opacity: 0.85 }} />
            <span className="text-[10px] font-mono text-[#8b949e]">+VEX · dealers buy on vol↑</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: NEG, opacity: 0.85 }} />
            <span className="text-[10px] font-mono text-[#8b949e]">−VEX · dealers sell on vol↑</span>
          </div>
        </div>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />

          {/* X — expiry index, ticked as dates */}
          <XAxis
            dataKey="x"
            type="number"
            domain={[-0.5, expiries.length - 0.5]}
            ticks={expiries.map((_, i) => i)}
            tickFormatter={(i) => expiries[i] ? fmtShortDate(expiries[i]) : ""}
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            stroke="#30363d"
            label={{ value: "Expiration Date", position: "insideBottom", offset: -20, fill: "#8b949e", fontSize: 11 }}
          />

          {/* Y — strike price */}
          <YAxis
            dataKey="y"
            type="number"
            domain={yDomain}
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={(v) => `$${v}`}
            stroke="#30363d"
            width={62}
            label={{ value: "Strike Price", angle: -90, position: "insideLeft", offset: 10, fill: "#8b949e", fontSize: 11 }}
          />

          {/* Z — bubble size */}
          <ZAxis dataKey="z" type="number" range={zRange} />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#484f58" }} />

          {/* Spot horizontal line */}
          <ReferenceLine
            y={spot}
            stroke={C_SPOT}
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `Spot $${spot.toFixed(2)}`,
              fill: C_SPOT,
              fontSize: 10,
              fontFamily: "monospace",
              position: "insideTopRight",
            }}
          />

          {/* Positive VEX bubbles */}
          <Scatter
            name="+VEX"
            data={posData}
            fill={POS}
            fillOpacity={0.7}
            stroke={POS}
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />

          {/* Negative VEX bubbles */}
          <Scatter
            name="−VEX"
            data={negData}
            fill={NEG}
            fillOpacity={0.7}
            stroke={NEG}
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* ── Size legend ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-6 mt-2">
        {[0.25, 0.5, 1].map((frac, i) => {
          const allZ = [...posData, ...negData].map((d) => d.z);
          const maxZ = allZ.length ? Math.max(...allZ) : 1;
          const exampleVal = maxZ * frac;
          const r = 4 + frac * 12;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className="rounded-full flex-shrink-0"
                style={{ width: r * 2, height: r * 2, backgroundColor: "#8b949e", opacity: 0.4 }}
              />
              <span className="text-[10px] font-mono text-[#484f58]">{fmt(exampleVal)}</span>
            </div>
          );
        })}
        <span className="text-[10px] font-mono text-[#484f58]">bubble size scale</span>
      </div>
    </div>
  );
}
