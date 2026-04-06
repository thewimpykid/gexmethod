"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { IvPoint } from "@/lib/types";

const C_CALL = "#1de9b6";  // teal  — call IV
const C_PUT  = "#f87171";  // coral — put IV
const C_ATM  = "#a78bfa";  // violet — average ATM IV

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-xs font-mono shadow-xl space-y-1">
      <p className="text-[#e6edf3] font-bold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {(p.value * 100).toFixed(2)}%
        </p>
      ))}
      {payload.length >= 2 && (
        <p className="text-[#484f58] pt-1 text-[10px]">
          Skew: {((payload.find(p => p.name === "Put IV")?.value ?? 0) - (payload.find(p => p.name === "Call IV")?.value ?? 0) > 0 ? "put premium (bearish skew)" : "call premium (bullish skew)")}
        </p>
      )}
    </div>
  );
}

interface Props {
  ivTermStructure: IvPoint[];
  symbol: string;
}

export default function IvTermStructure({ ivTermStructure, symbol }: Props) {
  if (!ivTermStructure.length) return null;

  const data = ivTermStructure.map((p) => ({
    expiry: fmtDate(p.expiry),
    callIv: p.callIv,
    putIv: p.putIv,
    atmIv: p.atmIv,
    skew: p.putIv - p.callIv,   // positive = put premium (standard equity skew)
  }));

  const allIvs = data.flatMap((d) => [d.callIv, d.putIv]);
  const minIv  = Math.min(...allIvs);
  const maxIv  = Math.max(...allIvs);
  const avgAtm = data.reduce((s, d) => s + d.atmIv, 0) / data.length;

  // Term structure shape
  const first = data[0].atmIv;
  const last  = data[data.length - 1].atmIv;
  const isBackwardation = data.length >= 2 && first > last + 0.005;
  const isContango      = data.length >= 2 && last  > first + 0.005;

  // Skew direction: positive skew = puts consistently more expensive than calls
  const avgSkew = data.reduce((s, d) => s + d.skew, 0) / data.length;
  const hasPutPremium = avgSkew > 0.002;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
            Implied Volatility Term Structure · <span className="text-[#e6edf3]">{symbol}</span>
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-[#8b949e] font-mono">ATM IV</span>
              <span className="text-xl font-bold font-mono text-[#a78bfa]">
                {(minIv * 100).toFixed(1)}% – {(maxIv * 100).toFixed(1)}%
              </span>
            </div>
            {data.length >= 2 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                isBackwardation
                  ? "bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/25"
                  : isContango
                  ? "bg-[#1de9b6]/10 text-[#1de9b6] border border-[#1de9b6]/25"
                  : "bg-[#8b949e]/10 text-[#8b949e] border border-[#8b949e]/25"
              }`}>
                {isBackwardation ? "BACKWARDATION" : isContango ? "CONTANGO" : "FLAT"}
              </span>
            )}
            {hasPutPremium && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded font-mono bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/25">
                PUT SKEW
              </span>
            )}
          </div>

          {/* VEX interpretation */}
          <div className="mt-2 space-y-0.5">
            {isBackwardation && (
              <p className="text-[10px] font-mono text-[#f87171]">
                ↳ Front IV elevated — vol crush as expiry nears will trigger vanna-driven buying
              </p>
            )}
            {isContango && (
              <p className="text-[10px] font-mono text-[#1de9b6]">
                ↳ Normal term structure — vanna hedging flows spread across expiries
              </p>
            )}
            {hasPutPremium && (
              <p className="text-[10px] font-mono text-[#f87171]">
                ↳ Put skew: dealers carry negative vanna at downside strikes — vol spike forces buying
              </p>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-[10px] font-mono flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={C_CALL} strokeWidth="2" /></svg>
            <span className="text-[#8b949e]">Call IV</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={C_PUT} strokeWidth="2" /></svg>
            <span className="text-[#8b949e]">Put IV</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="6">
              <line x1="0" y1="3" x2="20" y2="3" stroke={C_ATM} strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span className="text-[#8b949e]">ATM avg</span>
          </div>
        </div>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />

          <XAxis
            dataKey="expiry"
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            stroke="#30363d"
          />
          <YAxis
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            stroke="#30363d"
            width={46}
            domain={[
              (dataMin: number) => Math.max(0, dataMin * 0.88),
              (dataMax: number) => dataMax * 1.08,
            ]}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#484f58", strokeDasharray: "3 3" }} />

          {/* Shaded band between call and put IV (skew spread) */}
          <Area
            type="monotone"
            dataKey="putIv"
            fill={C_PUT}
            fillOpacity={0.06}
            stroke="none"
            activeDot={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="callIv"
            fill={C_CALL}
            fillOpacity={0.06}
            stroke="none"
            activeDot={false}
            legendType="none"
          />

          {/* Average ATM IV reference */}
          <ReferenceLine
            y={avgAtm}
            stroke="#484f58"
            strokeDasharray="4 2"
            strokeWidth={1}
            label={{
              value: `avg ${(avgAtm * 100).toFixed(1)}%`,
              fill: "#484f58",
              fontSize: 10,
              fontFamily: "monospace",
              position: "insideTopRight",
            }}
          />

          {/* Call IV line */}
          <Line
            type="monotone"
            dataKey="callIv"
            name="Call IV"
            stroke={C_CALL}
            strokeWidth={2}
            dot={{ r: 4, fill: C_CALL, stroke: "#0d1117", strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: C_CALL, stroke: "#0d1117", strokeWidth: 2 }}
          />

          {/* Put IV line */}
          <Line
            type="monotone"
            dataKey="putIv"
            name="Put IV"
            stroke={C_PUT}
            strokeWidth={2}
            dot={{ r: 4, fill: C_PUT, stroke: "#0d1117", strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: C_PUT, stroke: "#0d1117", strokeWidth: 2 }}
          />

          {/* ATM average dashed line */}
          <Line
            type="monotone"
            dataKey="atmIv"
            name="ATM avg"
            stroke={C_ATM}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: C_ATM }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[9px] text-[#484f58] font-mono mt-2 text-center">
        ATM IV = average implied volatility of calls & puts within 2% of spot · gap between lines = vol skew (put premium = bearish hedging demand)
      </p>
    </div>
  );
}
