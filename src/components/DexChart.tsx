"use client";

import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { StrikeData, GexSummary } from "@/lib/types";

// ─── Palette ────────────────────────────────────────────────────────────────
const POS    = "#1de9b6";
const NEG    = "#f87171";
const C_SPOT = "#eab308";
const C_CW   = "#ef4444";
const C_PW   = "#22c55e";
const C_FLIP = "#818cf8";
const C_NET  = "#60a5fa";
// ────────────────────────────────────────────────────────────────────────────

function fmt(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

function fmtPrice(v: number, isNq: boolean) {
  return isNq ? String(Math.round(v)) : `$${v}`;
}

function nearestTo(strikes: StrikeData[], target: number) {
  return strikes.reduce((prev, curr) =>
    Math.abs(curr.strike - target) < Math.abs(prev.strike - target) ? curr : prev,
    strikes[0]
  )?.strike;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, isNq }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  isNq?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-xs font-mono space-y-0.5 shadow-xl">
      <p className="text-[#e6edf3] font-bold mb-1">Strike {fmtPrice(Number(label), !!isNq)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Legend helpers ──────────────────────────────────────────────────────────
function LegendBar({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-[#8b949e] whitespace-nowrap">{label}</span>
    </div>
  );
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <svg width="20" height="6" className="flex-shrink-0">
        <line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="1.5" strokeDasharray="4 2" />
      </svg>
      <span className="text-[10px] text-[#8b949e] whitespace-nowrap">{label}</span>
    </div>
  );
}

function LegendRange() {
  return (
    <div className="flex items-center gap-1">
      <div
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: `${C_NET}22`, border: `1px solid ${C_NET}55` }}
      />
      <span className="text-[10px] text-[#8b949e] whitespace-nowrap">Range</span>
    </div>
  );
}

function BottomLegendItem({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-[#8b949e]">
        {label}{" "}
        <span className="text-[#484f58]">{sub}</span>
      </span>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  strikes: StrikeData[];
  summary: GexSummary;
  spot: number;
  priceLabel?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function DexChart({ strikes, summary, spot, priceLabel = "" }: Props) {
  const [mode, setMode] = useState<"net" | "callput">("net");
  const isNq = priceLabel === "NQ";
  const symbol = priceLabel || "—";

  const xSpot = nearestTo(strikes, spot);
  const xFlip = summary.gammaFlip != null ? nearestTo(strikes, summary.gammaFlip) : null;
  const xCW   = summary.callWall || null;
  const xPW   = summary.putWall  || null;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
          DEX BY STRIKE{" "}
          <span className="text-[#e6edf3]">· {symbol}</span>
        </p>

        <div className="flex items-center bg-[#161b22] rounded-md p-0.5 border border-[#30363d]">
          <button
            onClick={() => setMode("net")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mode === "net"
                ? "bg-white text-[#0d1117]"
                : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            Net DEX
          </button>
          <button
            onClick={() => setMode("callput")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mode === "callput"
                ? "bg-white text-[#0d1117]"
                : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            Call vs Put
          </button>
        </div>
      </div>

      {/* ── Top-right legend ──────────────────────────────────────────── */}
      <div className="flex items-center justify-end flex-wrap gap-x-3 gap-y-1 mb-1">
        {mode === "net" ? (
          <>
            <LegendBar color={POS} label="Positive" />
            <LegendBar color={NEG} label="Negative" />
          </>
        ) : (
          <>
            <LegendBar color={POS} label="Call DEX" />
            <LegendBar color={NEG} label="Put DEX" />
          </>
        )}
        <LegendDash color={C_SPOT} label="Spot" />
        <LegendDash color={C_CW}   label="CW" />
        <LegendDash color={C_PW}   label="PW" />
        <LegendDash color={C_FLIP} label="Flip" />
        <LegendRange />
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={strikes} margin={{ top: 20, right: 8, left: 8, bottom: 44 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />

          <XAxis
            dataKey="strike"
            tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => fmtPrice(v, isNq)}
            angle={-45}
            textAnchor="end"
            interval="preserveStartEnd"
            stroke="#30363d"
          />
          <YAxis
            tick={{ fill: "#8b949e", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={fmt}
            stroke="#30363d"
            width={52}
          />

          <Tooltip content={<CustomTooltip isNq={isNq} />} />

          <ReferenceLine y={0} stroke="#30363d" strokeWidth={1} />

          {/* Range shading */}
          {xPW && xCW && (
            <ReferenceArea
              x1={Math.min(xPW, xCW)}
              x2={Math.max(xPW, xCW)}
              fill={C_NET}
              fillOpacity={0.05}
              strokeOpacity={0}
            />
          )}

          {/* Spot */}
          {xSpot && (
            <ReferenceLine
              x={xSpot}
              stroke={C_SPOT}
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: fmtPrice(spot, isNq),
                fill: C_SPOT,
                fontSize: 10,
                fontFamily: "monospace",
                position: "insideTop",
                offset: 4,
              }}
            />
          )}

          {/* Call Wall */}
          {xCW && (
            <ReferenceLine
              x={xCW}
              stroke={C_CW}
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: fmtPrice(summary.callWall, isNq),
                fill: C_CW,
                fontSize: 10,
                fontFamily: "monospace",
                position: "insideTop",
                offset: 4,
              }}
            />
          )}

          {/* Put Wall */}
          {xPW && (
            <ReferenceLine
              x={xPW}
              stroke={C_PW}
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: fmtPrice(summary.putWall, isNq),
                fill: C_PW,
                fontSize: 10,
                fontFamily: "monospace",
                position: "insideTop",
                offset: 4,
              }}
            />
          )}

          {/* Gamma Flip */}
          {xFlip && (
            <ReferenceLine
              x={xFlip}
              stroke={C_FLIP}
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: fmtPrice(summary.gammaFlip ?? 0, isNq),
                fill: C_FLIP,
                fontSize: 10,
                fontFamily: "monospace",
                position: "insideBottom",
                offset: 4,
              }}
            />
          )}

          {/* ── Bars ──────────────────────────────────────────────────── */}
          {mode === "callput" ? (
            <>
              <Bar
                dataKey="callDex"
                name="Call DEX"
                fill={POS}
                radius={[2, 2, 0, 0]}
                maxBarSize={16}
              />
              <Bar
                dataKey="putDex"
                name="Put DEX"
                fill={NEG}
                radius={[0, 0, 2, 2]}
                maxBarSize={16}
              />
              <Line
                type="monotone"
                dataKey="netDex"
                name="Net DEX"
                stroke={C_NET}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                activeDot={{ r: 3, fill: C_NET }}
              />
            </>
          ) : (
            <Bar dataKey="netDex" name="Net DEX" radius={[2, 2, 2, 2]}>
              {strikes.map((s, i) => (
                <Cell key={i} fill={s.netDex >= 0 ? POS : NEG} />
              ))}
            </Bar>
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── Bottom legend ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1 mt-1">
        <BottomLegendItem color={C_CW}   label="Call Wall"   sub="Resistance ceiling" />
        <BottomLegendItem color={C_PW}   label="Put Wall"    sub="Support floor" />
        <BottomLegendItem color={C_FLIP} label="Gamma Flip"  sub="Regime pivot" />
        <BottomLegendItem color={C_SPOT} label="Spot"        sub="Current price" />
      </div>
    </div>
  );
}
