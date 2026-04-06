"use client";

import { useMemo, useState } from "react";
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

// ─── Palette ─────────────────────────────────────────────────────────────────
const POS    = "#1de9b6";
const NEG    = "#f87171";
const C_SPOT = "#eab308";
const C_CW   = "#ef4444";
const C_PW   = "#22c55e";
const C_FLIP = "#818cf8";
const C_NET  = "#60a5fa";

function fmt(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
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
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-xs font-mono space-y-1 shadow-xl">
      <p className="text-[#e6edf3] font-bold mb-1.5">Strike {fmtPrice(Number(label), !!isNq)}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="18" height="6" className="flex-shrink-0">
        <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="1.5" strokeDasharray="4 2" />
      </svg>
      <span className="text-[10px] text-[#8b949e] whitespace-nowrap">{label}</span>
    </div>
  );
}

// ─── Breakdown panel ─────────────────────────────────────────────────────────
function BreakdownBar({
  totalCall, totalPut, net, formula,
}: {
  totalCall: number; totalPut: number; net: number; formula: string;
}) {
  const absCall = Math.abs(totalCall);
  const absPut  = Math.abs(totalPut);
  const absNet  = Math.abs(net);
  const maxBar  = Math.max(absCall, absPut, absNet, 1);

  function Bar({ value, color, label }: { value: number; color: string; label: string }) {
    const pct = Math.min((Math.abs(value) / maxBar) * 100, 100);
    return (
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-[#8b949e] w-16 text-right flex-shrink-0">{label}</span>
        <div className="flex-1 h-4 bg-[#21262d] rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm transition-all"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
          />
        </div>
        <span className="text-[10px] font-mono w-20 flex-shrink-0" style={{ color }}>{fmt(value)}</span>
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 mb-3 space-y-2">
      <p className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-2">How Net is Calculated</p>
      <Bar value={totalCall} color={POS} label="Call total" />
      <Bar value={totalPut}  color={NEG} label="Put total" />
      {/* Divider + net */}
      <div className="flex items-center gap-3 pt-1 border-t border-[#30363d]">
        <span className="text-[10px] font-mono text-[#8b949e] w-16 text-right flex-shrink-0">Net</span>
        <div className="flex-1 h-4 bg-[#21262d] rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{
              width: `${Math.min((absNet / maxBar) * 100, 100)}%`,
              backgroundColor: net >= 0 ? POS : NEG,
            }}
          />
        </div>
        <span
          className="text-[10px] font-mono font-bold w-20 flex-shrink-0"
          style={{ color: net >= 0 ? POS : NEG }}
        >
          {fmt(net)}
        </span>
      </div>
      <p className="text-[9px] font-mono text-[#484f58] pt-1">{formula}</p>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  strikes: StrikeData[];
  summary: GexSummary;
  spot: number;
  priceLabel?: string;
}

export default function GexChart({ strikes, summary, spot, priceLabel = "" }: Props) {
  const [mode, setMode] = useState<"net" | "callput">("net");
  const isNq = priceLabel === "NQ";

  // ── Filter to ±7% of spot for readability (~25–35 bars) ──────────────────
  const data = useMemo(() => {
    const range = spot * 0.07;
    return strikes.filter((s) => s.strike >= spot - range && s.strike <= spot + range);
  }, [strikes, spot]);

  const xSpot = useMemo(() => nearestTo(data, spot), [data, spot]);
  const xFlip = useMemo(() => summary.gammaFlip != null ? nearestTo(data, summary.gammaFlip) : null, [data, summary.gammaFlip]);
  const xCW   = data.some((s) => s.strike === summary.callWall) ? summary.callWall : null;
  const xPW   = data.some((s) => s.strike === summary.putWall)  ? summary.putWall  : null;

  // Aggregate call / put / net GEX across ALL strikes (not just visible range)
  const totalCallGex = useMemo(() => strikes.reduce((s, r) => s + r.callGex, 0), [strikes]);
  const totalPutGex  = useMemo(() => strikes.reduce((s, r) => s + r.putGex,  0), [strikes]);
  const netGexTotal  = summary.netGex;
  const netPositive  = netGexTotal >= 0;

  // Show every Nth tick so X-axis stays uncluttered
  const tickInterval = data.length > 30 ? 4 : data.length > 20 ? 2 : 1;

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
            Gamma Exposure Profile · <span className="text-[#e6edf3]">{priceLabel || "—"}</span>
          </p>
          {/* Prominent Net GEX stat */}
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-[#8b949e] font-mono">Net GEX</span>
            <span
              className="text-xl font-bold font-mono"
              style={{ color: netPositive ? POS : NEG }}
            >
              {fmt(netGexTotal)}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                netPositive
                  ? "bg-[#1de9b6]/10 text-[#1de9b6]"
                  : "bg-[#f87171]/10 text-[#f87171]"
              }`}
            >
              {netPositive ? "+ GAMMA" : "− GAMMA"}
            </span>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center bg-[#161b22] rounded-lg p-0.5 border border-[#30363d] flex-shrink-0">
          <button
            onClick={() => setMode("net")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === "net" ? "bg-white text-[#0d1117]" : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            Net GEX
          </button>
          <button
            onClick={() => setMode("callput")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === "callput" ? "bg-white text-[#0d1117]" : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            Call vs Put
          </button>
        </div>
      </div>

      {/* ── Breakdown ────────────────────────────────────────────────────── */}
      <BreakdownBar
        totalCall={totalCallGex}
        totalPut={totalPutGex}
        net={netGexTotal}
        formula="GEX = γ × OI × multiplier × spot² × 0.01  |  Net GEX = Σ(Call GEX) + Σ(Put GEX)"
      />

      {/* ── Key level pills ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-3">
        {summary.callWall > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/25">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
            <span className="text-[10px] font-mono text-[#ef4444]">Call Wall {fmtPrice(summary.callWall, isNq)}</span>
          </div>
        )}
        {summary.putWall > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/25">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            <span className="text-[10px] font-mono text-[#22c55e]">Put Wall {fmtPrice(summary.putWall, isNq)}</span>
          </div>
        )}
        {summary.gammaFlip != null && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#818cf8]/10 border border-[#818cf8]/25">
            <div className="w-1.5 h-1.5 rounded-full bg-[#818cf8]" />
            <span className="text-[10px] font-mono text-[#818cf8]">Flip {fmtPrice(Math.round(summary.gammaFlip), isNq)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#eab308]/10 border border-[#eab308]/25">
          <div className="w-1.5 h-1.5 rounded-full bg-[#eab308]" />
          <span className="text-[10px] font-mono text-[#eab308]">Spot {fmtPrice(spot, isNq)}</span>
        </div>
        {mode === "callput" && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#60a5fa]/10 border border-[#60a5fa]/25">
            <div className="w-4 h-px bg-[#60a5fa]" style={{ borderTop: "1px dashed #60a5fa" }} />
            <span className="text-[10px] font-mono text-[#60a5fa]">Net line</span>
          </div>
        )}
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 56 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />

          <XAxis
            dataKey="strike"
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={(v) => fmtPrice(v, isNq)}
            angle={-40}
            textAnchor="end"
            interval={tickInterval}
            stroke="#30363d"
            tickMargin={6}
          />
          <YAxis
            tick={{ fill: "#8b949e", fontSize: 11, fontFamily: "monospace" }}
            tickFormatter={fmt}
            stroke="#30363d"
            width={60}
          />

          <Tooltip content={<CustomTooltip isNq={isNq} />} cursor={{ fill: "#ffffff08" }} />
          <ReferenceLine y={0} stroke="#484f58" strokeWidth={1.5} />

          {/* Shaded range between walls */}
          {xPW && xCW && (
            <ReferenceArea
              x1={Math.min(xPW, xCW)}
              x2={Math.max(xPW, xCW)}
              fill={C_NET}
              fillOpacity={0.06}
              strokeOpacity={0}
            />
          )}

          {/* Reference lines */}
          {xSpot && <ReferenceLine x={xSpot} stroke={C_SPOT} strokeDasharray="5 3" strokeWidth={2}
            label={{ value: fmtPrice(spot, isNq), fill: C_SPOT, fontSize: 11, fontFamily: "monospace", position: "insideTopLeft", offset: 6 }} />}
          {xCW && <ReferenceLine x={xCW} stroke={C_CW} strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: `CW ${fmtPrice(summary.callWall, isNq)}`, fill: C_CW, fontSize: 10, fontFamily: "monospace", position: "insideTopRight", offset: 6 }} />}
          {xPW && <ReferenceLine x={xPW} stroke={C_PW} strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: `PW ${fmtPrice(summary.putWall, isNq)}`, fill: C_PW, fontSize: 10, fontFamily: "monospace", position: "insideTopLeft", offset: 6 }} />}
          {xFlip && <ReferenceLine x={xFlip} stroke={C_FLIP} strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: `Flip ${fmtPrice(Math.round(summary.gammaFlip ?? 0), isNq)}`, fill: C_FLIP, fontSize: 10, fontFamily: "monospace", position: "insideBottomRight", offset: 6 }} />}

          {/* ── Bars ──────────────────────────────────────────────────── */}
          {mode === "callput" ? (
            <>
              <Bar dataKey="callGex" name="Call GEX" fill={POS} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="putGex"  name="Put GEX"  fill={NEG} radius={[0, 0, 3, 3]} maxBarSize={28} />
              <Line type="monotone" dataKey="netGex" name="Net GEX"
                stroke={C_NET} strokeWidth={2} strokeDasharray="4 2" dot={false}
                activeDot={{ r: 4, fill: C_NET, stroke: "#0d1117", strokeWidth: 2 }} />
            </>
          ) : (
            <Bar dataKey="netGex" name="Net GEX" radius={[3, 3, 3, 3]} maxBarSize={32}>
              {data.map((s, i) => (
                <Cell key={i} fill={s.netGex >= 0 ? POS : NEG} fillOpacity={0.9} />
              ))}
            </Bar>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
