"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GexSnapshot, ApiError } from "@/lib/types";

import SymbolSelector from "@/components/SymbolSelector";
import KeyLevels from "@/components/KeyLevels";
import GexChart from "@/components/GexChart";
import DexChart from "@/components/DexChart";
import GexHeatmap from "@/components/GexHeatmap";
import CexHeatmap from "@/components/CexHeatmap";
import VexBubbleChart from "@/components/VexBubbleChart";
import IvTermStructure from "@/components/IvTermStructure";

const POLL_INTERVAL = 60_000;

// ─── Trading windows (Eastern Time) ──────────────────────────────────────────
// Pre-market window (4–9:30am) is only active when the user enables PRE-MKT mode.
// Regular windows always auto-refresh; pre-market window only fires when premarketMode=true.
const WINDOWS = [
  { name: "Pre-Market",        short: "PRE-MKT",      start: [4,  0],  end: [9,  30], color: "#f59e0b", premarket: true  },
  { name: "Prime Window",      short: "PRIME",        start: [9,  30], end: [10, 30], color: "#1de9b6", premarket: false },
  { name: "Secondary Window",  short: "SECONDARY",    start: [10, 30], end: [12,  0], color: "#60a5fa", premarket: false },
  { name: "Afternoon Window",  short: "AFTERNOON",    start: [13, 30], end: [15, 30], color: "#a78bfa", premarket: false },
] as const;

function getEtMinutes(): { mins: number; day: number } {
  const now = new Date();
  const et  = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return { mins: et.getHours() * 60 + et.getMinutes(), day: et.getDay() };
}

function toMins(h: number, m: number): number { return h * 60 + m; }
function windowMins(t: readonly [number, number]): number { return t[0] * 60 + t[1]; }

type Window = typeof WINDOWS[number];
interface WindowState {
  active:      boolean;
  window:      Window | null;
  nextWindow:  Window | null;
  minsToNext:  number;
  isWeekend:   boolean;
}

function getWindowState(): WindowState {
  const { mins, day } = getEtMinutes();
  if (day === 0 || day === 6) return { active: false, window: null, nextWindow: null, minsToNext: -1, isWeekend: true };
  for (const w of WINDOWS) {
    if (mins >= windowMins(w.start) && mins < windowMins(w.end))
      return { active: true, window: w, nextWindow: null, minsToNext: 0, isWeekend: false };
  }
  for (const w of WINDOWS) {
    const s = windowMins(w.start);
    if (s > mins) return { active: false, window: null, nextWindow: w, minsToNext: s - mins, isWeekend: false };
  }
  return { active: false, window: null, nextWindow: null, minsToNext: -1, isWeekend: false };
}

function secondsAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function Home() {
  const [symbol, setSymbol] = useState("QQQ");
  const [snapshot, setSnapshot] = useState<GexSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [showGex, setShowGex] = useState(true);
  const [showDex, setShowDex] = useState(true);
  const [premarketMode, setPremarketMode] = useState(false);
  const [nqMode, setNqMode] = useState(false);
  const [nqRatioMode, setNqRatioMode] = useState<"auto" | "manual">("auto");
  const [nqManualRatio, setNqManualRatio] = useState("");
  const [winState, setWinState] = useState<WindowState>(getWindowState);
  // ─── Lookback times ───────────────────────────────────────────────────────────
  const [lookbackTimes, setLookbackTimes] = useState<string[]>(["09:30", "10:30"]);
  const [newLookbackTime, setNewLookbackTime] = useState("");
  const [showLookbackBar, setShowLookbackBar] = useState(false);
  const [selectedAt, setSelectedAt] = useState<string | null>(null); // null = live
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (sym: string, premarket = false, at?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbol: sym });
      if (premarket) params.set("premarket", "1");
      if (at) params.set("at", at);
      const res = await fetch(`/api/gex?${params}`);
      const data: GexSnapshot | ApiError = await res.json();
      if ("error" in data) {
        setError(data.error);
        setSnapshot(null);
      } else {
        setSnapshot(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(symbol, premarketMode, selectedAt ?? undefined);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Only auto-refresh when viewing live (not a historical time)
    if (!selectedAt) {
      intervalRef.current = setInterval(() => {
        const ws = getWindowState();
        setWinState(ws);
        if (ws.active && (!ws.window?.premarket || premarketMode)) {
          fetchData(symbol, premarketMode && !!ws.window?.premarket);
        }
      }, POLL_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, premarketMode, selectedAt, fetchData]);

  // Tick for "X ago" display + window state refresh
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      setWinState(getWindowState());
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  // ---------------------------------------------------------------------------
  // NQ conversion — scale all price levels by ratio
  //   auto:   nqSpot / spot (live or historical — route already fetched NQ at the same time)
  //   manual: user-supplied ratio
  // ---------------------------------------------------------------------------
  const autoRatio =
    snapshot?.nqSpot && snapshot?.spot
      ? snapshot.nqSpot / snapshot.spot
      : null;

  const parsedManual = parseFloat(nqManualRatio);
  const manualRatioValid = !isNaN(parsedManual) && parsedManual > 1;

  const nqRatio = nqMode
    ? nqRatioMode === "manual" && manualRatioValid
      ? parsedManual
      : autoRatio
    : null;

  function applyNq(price: number) {
    return nqRatio ? Math.round(price * nqRatio) : price;
  }

  const displaySnapshot = snapshot && nqRatio
    ? {
        ...snapshot,
        spot: applyNq(snapshot.spot),
        strikes: snapshot.strikes.map((s) => ({ ...s, strike: applyNq(s.strike) })),
        summary: {
          ...snapshot.summary,
          gammaFlip: snapshot.summary.gammaFlip != null ? applyNq(snapshot.summary.gammaFlip) : null,
          callWall: applyNq(snapshot.summary.callWall),
          putWall: applyNq(snapshot.summary.putWall),
        },
        heatmap: snapshot.heatmap.map((c) => ({ ...c, strike: applyNq(c.strike) })),
        cexHeatmap: snapshot.cexHeatmap.map((c) => ({ ...c, strike: applyNq(c.strike) })),
        vexHeatmap: snapshot.vexHeatmap.map((c) => ({ ...c, strike: applyNq(c.strike) })),
      }
    : snapshot;

  const canNqMode = !!(snapshot?.nqSpot);
  const priceLabel = nqMode && canNqMode ? "NQ" : snapshot?.symbol ?? "";

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <header className="border-b border-[#30363d] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-lg font-bold tracking-tight">GEX / DEX</h1>
              <p className="text-xs text-[#8b949e]">Options Exposure Dashboard</p>
            </div>
            <SymbolSelector selected={symbol} onChange={setSymbol} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {snapshot && (
              <div className="flex items-center gap-2 font-mono flex-wrap">
                <span className="text-2xl font-bold text-[#e6edf3]">
                  ${snapshot.spot.toFixed(2)}
                </span>
                {snapshot.spotIsPreMarket && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-950/30 text-orange-400 font-mono">
                    PRE-MKT
                  </span>
                )}
                {snapshot.spotIsPreMarket && snapshot.regularSpot && (
                  <span className="text-xs text-[#484f58] font-mono" title="Previous regular-session close">
                    reg {snapshot.regularSpot.toFixed(2)}
                  </span>
                )}
                {canNqMode && snapshot.nqSpot && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#8b949e]">
                    <span className="text-yellow-400 font-bold">{snapshot.nqContract ?? "NQ"}</span>
                    <span>{snapshot.nqSpot.toFixed(0)}</span>
                    {snapshot.nqApproximate && (
                      <span className="text-[9px] text-orange-400/70 border border-orange-500/30 rounded px-1"
                        title="NQ intraday data unavailable — using live price as ratio proxy">~live</span>
                    )}
                    {snapshot.ndxSpot && (
                      <>
                        <span className="text-[#484f58]">·</span>
                        <span>NDX {snapshot.ndxSpot.toFixed(0)}</span>
                      </>
                    )}
                  </span>
                )}
                {/* Gamma regime badge in header */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                  snapshot.summary.netGex >= 0
                    ? "bg-green-950/50 border-green-500/50 text-green-400"
                    : "bg-red-950/50 border-red-500/50 text-red-400"
                }`}>
                  {snapshot.summary.netGex >= 0 ? "+ GAMMA" : "− GAMMA"}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs">
              {/* NQ mode toggle + ratio controls */}
              {canNqMode && (
                <span className="flex items-center gap-1">
                  {/* On/off */}
                  <button
                    onClick={() => setNqMode((v) => !v)}
                    title="Convert strike prices to NQ futures levels"
                    className={`px-2 py-1 rounded-l border font-mono transition-colors ${
                      nqMode
                        ? "border-yellow-500/60 bg-yellow-950/40 text-yellow-400"
                        : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                    }`}
                  >
                    NQ
                  </button>

                  {/* Auto / Manual toggle — only visible when NQ mode is on */}
                  {nqMode && (
                    <>
                      <button
                        onClick={() => setNqRatioMode("auto")}
                        title={`Auto ratio: ${autoRatio?.toFixed(4) ?? "unavailable"}`}
                        className={`px-2 py-1 border-y border-r font-mono text-[10px] transition-colors ${
                          nqRatioMode === "auto"
                            ? "border-yellow-500/60 bg-yellow-950/40 text-yellow-300"
                            : "border-[#30363d] text-[#484f58] hover:text-[#8b949e]"
                        }`}
                      >
                        AUTO
                      </button>
                      <button
                        onClick={() => setNqRatioMode("manual")}
                        title="Enter your own ratio (update intraday for accuracy)"
                        className={`px-2 py-1 border-y border-r rounded-r font-mono text-[10px] transition-colors ${
                          nqRatioMode === "manual"
                            ? "border-yellow-500/60 bg-yellow-950/40 text-yellow-300"
                            : "border-[#30363d] text-[#484f58] hover:text-[#8b949e]"
                        }`}
                      >
                        MANUAL
                      </button>

                      {/* Manual ratio input */}
                      {nqRatioMode === "manual" && (
                        <input
                          type="number"
                          step="0.0001"
                          min="1"
                          placeholder={autoRatio?.toFixed(4) ?? "ratio"}
                          value={nqManualRatio}
                          onChange={(e) => setNqManualRatio(e.target.value)}
                          className={`w-24 px-2 py-1 rounded border font-mono text-[11px] bg-[#0d1117] transition-colors outline-none ${
                            manualRatioValid
                              ? "border-yellow-500/60 text-yellow-300"
                              : nqManualRatio
                              ? "border-red-500/60 text-red-400"
                              : "border-[#30363d] text-[#8b949e]"
                          }`}
                          title="QQQ → NQ conversion ratio (NQ price / QQQ price)"
                        />
                      )}

                      {/* Active ratio pill */}
                      <span
                        className="px-1.5 py-0.5 rounded font-mono text-[10px] text-yellow-400/60 border border-yellow-500/20"
                        title={
                          nqRatioMode === "manual" && manualRatioValid
                            ? "Using manual ratio"
                            : "Using auto ratio from Yahoo Finance"
                        }
                      >
                        ×{(nqRatio ?? autoRatio ?? 0).toFixed(4)}
                        {nqRatioMode === "manual" && manualRatioValid && (
                          <span className="text-yellow-300/80"> M</span>
                        )}
                      </span>
                    </>
                  )}
                </span>
              )}

              {/* Pre-market mode toggle */}
              <button
                onClick={() => setPremarketMode((v) => !v)}
                title="Use pre-market price as spot for GEX levels (4:00–9:30am ET). Polls every 60s during pre-market hours."
                className={`px-2 py-1 rounded border font-mono text-[10px] transition-colors ${
                  premarketMode
                    ? "border-orange-500/60 bg-orange-950/40 text-orange-400"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                }`}
              >
                PRE-MKT
              </button>

              {/* Lookback toggle */}
              <button
                onClick={() => setShowLookbackBar((v) => !v)}
                title="View GEX levels at a specific past time today"
                className={`px-2 py-1 rounded border font-mono text-[10px] transition-colors ${
                  showLookbackBar || selectedAt
                    ? "border-sky-500/60 bg-sky-950/40 text-sky-400"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                }`}
              >
                LOOKBACK{selectedAt ? ` · ${selectedAt}` : ""}
              </button>

              {/* Chart visibility toggles */}
              <button
                onClick={() => setShowGex((v) => !v)}
                className={`px-2 py-1 rounded border font-mono transition-colors ${
                  showGex
                    ? "border-green-500/60 bg-green-950/40 text-green-400"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                }`}
              >
                GEX
              </button>
              <button
                onClick={() => setShowDex((v) => !v)}
                className={`px-2 py-1 rounded border font-mono transition-colors ${
                  showDex
                    ? "border-green-500/60 bg-green-950/40 text-green-400"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                }`}
              >
                DEX
              </button>

              {/* Trading window badge */}
              {winState.active && winState.window ? (
                <span
                  className="px-2 py-1 rounded border text-[10px] font-mono font-bold animate-pulse"
                  style={{
                    color: winState.window.color,
                    borderColor: winState.window.color + "60",
                    backgroundColor: winState.window.color + "12",
                  }}
                >
                  ● {winState.window.short}
                </span>
              ) : winState.nextWindow ? (
                <span className="px-2 py-1 rounded border border-[#30363d] text-[10px] font-mono text-[#484f58]">
                  LOCKED · {winState.nextWindow.short} in {winState.minsToNext}m
                </span>
              ) : (
                <span className="px-2 py-1 rounded border border-[#30363d] text-[10px] font-mono text-[#484f58]">
                  {winState.isWeekend ? "WEEKEND" : "LOCKED"}
                </span>
              )}

              {/* Status + refresh */}
              <div className="flex items-center gap-1 text-[#8b949e] ml-1">
                {loading ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                ) : winState.active ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-[#484f58]" />
                )}
                <span>
                  {loading ? "Fetching..." : snapshot ? `${secondsAgo(snapshot.updatedAt)}` : "No data"}
                </span>
                {void tick}
              </div>
              <button
                onClick={() => fetchData(symbol, premarketMode)}
                disabled={loading}
                className="px-2 py-1 rounded border border-[#30363d] hover:border-[#8b949e] hover:text-[#e6edf3] transition-colors disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Lookback bar ───────────────────────────────────────────────────── */}
        {showLookbackBar && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-[#484f58] uppercase tracking-wider shrink-0">GEX at</span>

            {/* LIVE */}
            <button
              onClick={() => { setSelectedAt(null); }}
              className={`px-3 py-1 rounded border font-mono text-xs transition-colors ${
                selectedAt === null
                  ? "border-green-500/60 bg-green-950/30 text-green-400"
                  : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
              }`}
            >
              LIVE
            </button>

            {/* Saved time chips */}
            {lookbackTimes.map((t) => (
              <div key={t} className="flex">
                <button
                  onClick={() => setSelectedAt(t)}
                  title={`Fetch GEX levels as of ${t} ET today`}
                  className={`px-3 py-1 rounded-l border font-mono text-xs transition-colors ${
                    selectedAt === t
                      ? "border-sky-500/60 bg-sky-950/30 text-sky-300"
                      : "border-[#30363d] text-[#e6edf3] hover:border-sky-500/40 hover:text-sky-300"
                  }`}
                >
                  {t}
                </button>
                <button
                  onClick={() => { setLookbackTimes((p) => p.filter((x) => x !== t)); if (selectedAt === t) setSelectedAt(null); }}
                  className="px-1.5 py-1 rounded-r border border-l-0 border-[#30363d] text-[#484f58] hover:text-red-400 font-mono text-[10px] transition-colors"
                >✕</button>
              </div>
            ))}

            {/* Add time */}
            <input
              type="time"
              value={newLookbackTime}
              onChange={(e) => setNewLookbackTime(e.target.value)}
              className="px-2 py-1 rounded border border-[#30363d] bg-[#0d1117] font-mono text-xs text-[#e6edf3] outline-none focus:border-sky-500/60 w-28"
            />
            <button
              onClick={() => {
                if (newLookbackTime && !lookbackTimes.includes(newLookbackTime)) {
                  setLookbackTimes((p) => [...p, newLookbackTime].sort());
                  setNewLookbackTime("");
                }
              }}
              className="px-2 py-1 rounded border border-[#30363d] hover:border-sky-500/60 hover:text-sky-400 font-mono text-xs text-[#8b949e] transition-colors"
            >
              + Add
            </button>

            {selectedAt && (
              <span className="ml-auto text-[10px] font-mono text-[#484f58]">
                Viewing {selectedAt} ET · OI/IV from current chain · spot & NQ from intraday 1-min bar
              </span>
            )}
          </div>
        )}

        {/* Trading window status bar */}
        {winState.active && winState.window && (!winState.window.premarket || premarketMode) ? (
          <div
            className="flex items-center justify-between rounded-lg px-4 py-2.5 border text-xs font-mono"
            style={{
              borderColor: winState.window.color + "40",
              backgroundColor: winState.window.color + "0e",
              color: winState.window.color,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">● {winState.window.name.toUpperCase()}</span>
              {winState.window.premarket
                ? <span className="opacity-60">· polling pre-market prices every 60s · GEX based on pre-open levels</span>
                : <span className="opacity-60">· auto-refreshing every 60s · levels are live</span>
              }
            </div>
            <span className="opacity-50 text-[10px]">
              {winState.window.premarket    && "Mark overnight H/L · pre-market gaps · opening range candidates"}
              {winState.window.name === "Prime Window"    && "Highest-velocity window — A setups only · full size"}
              {winState.window.name === "Secondary Window" && "Size down · trade only if trend quality is obvious"}
              {winState.window.name === "Afternoon Window" && "Trend continuation or late reversals · second decision window"}
            </span>
          </div>
        ) : winState.active && winState.window?.premarket && !premarketMode ? (
          // Pre-market window is active but user hasn't enabled PRE-MKT mode
          <div className="flex items-center justify-between rounded-lg px-4 py-2.5 border border-orange-500/20 bg-orange-950/10 text-xs font-mono text-orange-500/60">
            <div className="flex items-center gap-2">
              <span className="font-bold">PRE-MARKET HOURS</span>
              <span>· enable PRE-MKT to poll pre-open levels</span>
            </div>
            <span>4:00 – 9:30am ET · toggle PRE-MKT button above</span>
          </div>
        ) : !winState.isWeekend && snapshot ? (
          <div className="flex items-center justify-between rounded-lg px-4 py-2.5 border border-[#30363d] bg-[#161b22] text-xs font-mono text-[#484f58]">
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e] font-bold">⏸ LEVELS LOCKED</span>
              <span>· auto-refresh paused outside trading windows · data frozen at {secondsAgo(snapshot.updatedAt)}</span>
            </div>
            {winState.nextWindow ? (
              <span className="text-[#8b949e]">
                Next: <span style={{ color: winState.nextWindow.color }}>{winState.nextWindow.name}</span> in {winState.minsToNext}m
              </span>
            ) : (
              <span>All windows closed for today</span>
            )}
          </div>
        ) : winState.isWeekend ? (
          <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 border border-[#30363d] bg-[#161b22] text-xs font-mono text-[#484f58]">
            <span className="text-[#8b949e] font-bold">📋 WEEKEND</span>
            <span>· markets closed · use this time for weekly prep · levels shown are Friday close</span>
          </div>
        ) : null}

        {error && (
          <div className="bg-red-950/40 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !snapshot && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 h-20 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl h-96 animate-pulse" />
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl h-96 animate-pulse" />
            </div>
          </div>
        )}

        {displaySnapshot && displaySnapshot.strikes.length > 0 && (
          <>
            {/* Gamma regime banner */}
            {(() => {
              const pos = displaySnapshot.summary.netGex >= 0;
              return (
                <div className={`flex items-center gap-4 rounded-xl px-5 py-3 border ${
                  pos
                    ? "bg-green-950/30 border-green-500/30"
                    : "bg-red-950/30 border-red-500/30"
                }`}>
                  <span className={`text-2xl font-black font-mono tracking-tight ${pos ? "text-green-400" : "text-red-400"}`}>
                    {pos ? "POSITIVE GAMMA" : "NEGATIVE GAMMA"}
                  </span>
                  <span className={`text-sm font-mono ${pos ? "text-green-600" : "text-red-600"}`}>
                    {pos
                      ? "Dealers are long gamma — expect mean-reversion, suppressed volatility"
                      : "Dealers are short gamma — expect trend amplification, elevated volatility"}
                  </span>
                </div>
              );
            })()}

            <KeyLevels summary={displaySnapshot.summary} priceLabel={priceLabel} />

            {(showGex || showDex) && (
              <div className="flex flex-col gap-4">
                {showGex && (
                  <GexChart
                    strikes={displaySnapshot.strikes}
                    summary={displaySnapshot.summary}
                    spot={displaySnapshot.spot}
                    priceLabel={priceLabel}
                  />
                )}
                {showDex && (
                  <DexChart
                    strikes={displaySnapshot.strikes}
                    summary={displaySnapshot.summary}
                    spot={displaySnapshot.spot}
                    priceLabel={priceLabel}
                  />
                )}
              </div>
            )}

            {displaySnapshot?.heatmap && displaySnapshot.heatmap.length > 0 && (
              <GexHeatmap
                cells={displaySnapshot.heatmap}
                spot={displaySnapshot.spot}
                symbol={displaySnapshot.symbol}
                updatedAt={displaySnapshot.updatedAt}
              />
            )}

            {displaySnapshot?.cexHeatmap && displaySnapshot.cexHeatmap.length > 0 && (
              <CexHeatmap
                cells={displaySnapshot.cexHeatmap}
                spot={displaySnapshot.spot}
                symbol={displaySnapshot.symbol}
                updatedAt={displaySnapshot.updatedAt}
              />
            )}

            {displaySnapshot?.vexHeatmap && displaySnapshot.vexHeatmap.length > 0 && (
              <VexBubbleChart
                cells={displaySnapshot.vexHeatmap}
                spot={displaySnapshot.spot}
                symbol={displaySnapshot.symbol}
                updatedAt={displaySnapshot.updatedAt}
                netVex={displaySnapshot.summary.netVex}
              />
            )}

            {displaySnapshot?.ivTermStructure && displaySnapshot.ivTermStructure.length > 0 && (
              <IvTermStructure
                ivTermStructure={displaySnapshot.ivTermStructure}
                symbol={displaySnapshot.symbol}
              />
            )}

            <p className="text-xs text-[#8b949e] text-center pb-4">
              {selectedAt
                ? `GEX at ${selectedAt} ET — spot & NQ fetched from intraday 1-min bar · OI/IV from current chain`
                : "Data from Yahoo Finance (~15 min delayed) — auto-refreshes every 60s"}
              {nqMode && canNqMode && ` — NQ ×${(nqRatio ?? 0).toFixed(4)}`}
            </p>
          </>
        )}

        {displaySnapshot && displaySnapshot.strikes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-4xl">📉</span>
            <p className="text-[#8b949e]">No options data returned for {symbol}.</p>
            <p className="text-xs text-[#8b949e]">Markets may be closed or the symbol has no listed options.</p>
          </div>
        )}
      </main>
    </div>
  );
}
