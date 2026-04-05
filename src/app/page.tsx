"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GexSnapshot, ApiError } from "@/lib/types";
import SymbolSelector from "@/components/SymbolSelector";
import KeyLevels from "@/components/KeyLevels";
import GexChart from "@/components/GexChart";
import DexChart from "@/components/DexChart";
import GexHeatmap from "@/components/GexHeatmap";
import CexHeatmap from "@/components/CexHeatmap";
import VexHeatmap from "@/components/VexHeatmap";

const POLL_INTERVAL = 60_000;

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
  const [nqMode, setNqMode] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gex?symbol=${sym}`);
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
    fetchData(symbol);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(symbol), POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [symbol, fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // ---------------------------------------------------------------------------
  // NQ conversion — scale all price levels by nqSpot / spot
  // ---------------------------------------------------------------------------
  const nqRatio =
    nqMode && snapshot?.nqSpot && snapshot?.spot
      ? snapshot.nqSpot / snapshot.spot
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
                {canNqMode && (
                  <span className="text-xs text-[#8b949e]">NQ {snapshot.nqSpot?.toFixed(0)}</span>
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
              {/* NQ mode toggle */}
              {canNqMode && (
                <button
                  onClick={() => setNqMode((v) => !v)}
                  title="Convert strike prices to NQ futures levels"
                  className={`px-2 py-1 rounded border font-mono transition-colors ${
                    nqMode
                      ? "border-yellow-500/60 bg-yellow-950/40 text-yellow-400"
                      : "border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                  }`}
                >
                  NQ
                </button>
              )}

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

              {/* Status + refresh */}
              <div className="flex items-center gap-1 text-[#8b949e] ml-1">
                {loading ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                ) : snapshot ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-[#30363d]" />
                )}
                <span>
                  {loading ? "Fetching..." : snapshot ? `${secondsAgo(snapshot.updatedAt)}` : "No data"}
                </span>
                {void tick}
              </div>
              <button
                onClick={() => fetchData(symbol)}
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
              <VexHeatmap
                cells={displaySnapshot.vexHeatmap}
                spot={displaySnapshot.spot}
                symbol={displaySnapshot.symbol}
                updatedAt={displaySnapshot.updatedAt}
              />
            )}

            <p className="text-xs text-[#8b949e] text-center pb-4">
              Data from Yahoo Finance (~15 min delayed) &mdash; auto-refreshes every 60s
              {nqMode && canNqMode && " — strike prices shown as NQ futures equivalent"}
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
