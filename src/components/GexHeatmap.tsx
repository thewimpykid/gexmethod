"use client";

import { useMemo } from "react";
import type { HeatmapCell } from "@/lib/types";

// ─── Color scale ──────────────────────────────────────────────────────────────
// yellow (strong +GEX) → blue (neutral/zero) → purple-magenta (strong -GEX)
const POS_RGB: [number, number, number] = [255, 215,   0];  // bright yellow
const MID_RGB: [number, number, number] = [ 20,  60, 150];  // medium blue
const NEG_RGB: [number, number, number] = [110,   0, 110];  // dark purple-magenta

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function gexColor(value: number, maxAbs: number): string {
  if (maxAbs === 0 || value === 0) return `rgb(${MID_RGB.join(",")})`;
  const t = Math.min(Math.abs(value) / maxAbs, 1);
  const [r2, g2, b2] = value > 0 ? POS_RGB : NEG_RGB;
  return `rgb(${lerp(MID_RGB[0], r2, t)},${lerp(MID_RGB[1], g2, t)},${lerp(MID_RGB[2], b2, t)})`;
}

function textColor(value: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgba(255,255,255,0.6)";
  const intensity = Math.abs(value) / maxAbs;
  // Yellow cells (strong positive) need dark text; blue/purple need white
  if (value > 0 && intensity > 0.55) return "rgba(0,0,0,0.82)";
  return "rgba(255,255,255,0.88)";
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtCell(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs === 0) return "$0";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtBarTick(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  cells: HeatmapCell[];
  spot: number;
  symbol: string;
  updatedAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GexHeatmap({ cells, spot, symbol, updatedAt }: Props) {
  const { expiries, strikes, lookup, maxAbs } = useMemo(() => {
    // 4–6 near-term expirations only
    const expiries = [...new Set(cells.map((c) => c.expiry))].sort().slice(0, 6);

    // All strikes, descending (highest price at top — standard chart orientation)
    const allStrikes = [...new Set(cells.map((c) => c.strike))].sort((a, b) => b - a);

    // ±10% of spot — dense band, typically 50–80 rows
    const range = spot * 0.10;
    const strikes = allStrikes.filter((s) => s >= spot - range && s <= spot + range);

    const lookup = new Map<string, HeatmapCell>();
    for (const c of cells) lookup.set(`${c.expiry}:${c.strike}`, c);

    let maxAbs = 0;
    for (const s of strikes) {
      for (const e of expiries) {
        const v = lookup.get(`${e}:${s}`)?.netGex ?? 0;
        if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
      }
    }

    return { expiries, strikes, lookup, maxAbs };
  }, [cells, spot]);

  if (!cells.length || !strikes.length) {
    return (
      <div style={{ background: "#000", padding: 32, textAlign: "center", color: "#666", fontFamily: "monospace", fontSize: 13 }}>
        No heatmap data available
      </div>
    );
  }

  // Adaptive row height — target ~1200–1600px total grid height
  const CELL_H = Math.max(18, Math.min(28, Math.floor(1600 / Math.max(strikes.length, 1))));
  const LABEL_W = 62;   // strike label column px
  const BAR_W   = 18;   // color bar px
  const BAR_TICK_W = 52; // ticks + labels beside bar

  // Always show cell text — scale font with row height
  const cellFontSize = Math.max(7, Math.min(11, CELL_H * 0.55));

  const timestamp = fmtTimestamp(updatedAt);

  return (
    <div style={{
      background: "#000",
      color: "#fff",
      fontFamily: "'Courier New', Courier, monospace",
      padding: "16px 20px",
      userSelect: "none",
    }}>
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: "center",
        fontWeight: "bold",
        fontSize: 14,
        marginBottom: 14,
        letterSpacing: 0.4,
        color: "#fff",
      }}>
        {symbol} GEX &mdash; {timestamp} &mdash; Current Price: ${spot.toFixed(2)}
      </div>

      {/* ── Axis labels row ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8 }}>
        {/* Y-axis label (rotated) */}
        <div style={{
          width: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 10,
            color: "#888",
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}>
            Strike Price
          </span>
        </div>

        {/* ── Grid + color bar ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", alignItems: "stretch", gap: 10 }}>

          {/* Heatmap grid */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Strike rows — no gap, cells flush together */}
            {strikes.map((strike) => {
              const isSpot = Math.abs(strike - spot) < 0.5;
              return (
                <div
                  key={strike}
                  style={{ display: "flex", height: CELL_H }}
                >
                  {/* Strike label */}
                  <div style={{
                    width: LABEL_W,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 6,
                    fontSize: 10,
                    color: isSpot ? "#ffd700" : "#aaa",
                    fontWeight: isSpot ? "bold" : "normal",
                    background: "#000",
                    borderRight: "1px solid #222",
                  }}>
                    {strike}
                    {isSpot && <span style={{ marginLeft: 3, fontSize: 8 }}>◄</span>}
                  </div>

                  {/* Data cells */}
                  {expiries.map((expiry) => {
                    const cell = lookup.get(`${expiry}:${strike}`);
                    const val = cell?.netGex ?? 0;
                    return (
                      <div
                        key={expiry}
                        title={`${strike} × ${expiry}\n${fmtCell(val)}`}
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: gexColor(val, maxAbs),
                          boxShadow: isSpot ? "inset 0 0 0 1.5px #ffd700" : "none",
                          overflow: "hidden",
                        }}
                      >
                        <span style={{
                          color: textColor(val, maxAbs),
                          fontSize: cellFontSize,
                          lineHeight: 1,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}>
                          {fmtCell(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* X-axis: expiration date labels */}
            <div style={{ display: "flex", paddingLeft: LABEL_W, borderTop: "1px solid #333", paddingTop: 4, marginTop: 1 }}>
              {expiries.map((e) => (
                <div key={e} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#ccc" }}>
                  {e}
                </div>
              ))}
            </div>
            {/* X-axis label */}
            <div style={{ textAlign: "center", fontSize: 10, color: "#666", marginTop: 4, paddingLeft: LABEL_W }}>
              Expiration Date
            </div>
          </div>

          {/* ── Vertical color bar ───────────────────────────────────────── */}
          <div style={{ display: "flex", flexShrink: 0, alignItems: "stretch" }}>
            {/* The bar itself */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
              {/* Rotated label above bar */}
              <div style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontSize: 10,
                color: "#ccc",
                letterSpacing: 1,
                textAlign: "center",
                marginBottom: 6,
                alignSelf: "center",
                whiteSpace: "nowrap",
              }}>
                Gamma Exposure (GEX)
              </div>
              <div style={{ display: "flex", flex: 1 }}>
                {/* Tick labels */}
                <div style={{
                  width: BAR_TICK_W,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  paddingRight: 5,
                  fontSize: 9,
                  color: "#aaa",
                }}>
                  <span>{fmtBarTick(maxAbs)}</span>
                  <span>{fmtBarTick(maxAbs * 0.5)}</span>
                  <span>0</span>
                  <span>{fmtBarTick(-maxAbs * 0.5)}</span>
                  <span>{fmtBarTick(-maxAbs)}</span>
                </div>
                {/* Gradient bar */}
                <div style={{
                  width: BAR_W,
                  background: `linear-gradient(to bottom,
                    rgb(${POS_RGB.join(",")}),
                    rgb(${MID_RGB.join(",")}),
                    rgb(${NEG_RGB.join(",")})
                  )`,
                }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
