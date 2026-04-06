"use client";

import { useState } from "react";
import type { GexSummary } from "@/lib/types";

function formatExposure(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

interface CardProps {
  label: string;
  value: string;
  sub: string;
  sentiment?: "positive" | "negative" | "neutral";
  toggleable?: boolean;
  visible?: boolean;
  onToggle?: () => void;
}

function Card({ label, value, sub, sentiment = "neutral", toggleable, visible = true, onToggle }: CardProps) {
  const borderColor =
    sentiment === "positive"
      ? "border-green-500/40"
      : sentiment === "negative"
      ? "border-red-500/40"
      : "border-[#30363d]";

  const bgColor =
    !visible
      ? "bg-[#161b22]"
      : sentiment === "positive"
      ? "bg-green-950/30"
      : sentiment === "negative"
      ? "bg-red-950/30"
      : "bg-[#161b22]";

  const valueColor =
    sentiment === "positive"
      ? "text-green-400"
      : sentiment === "negative"
      ? "text-red-400"
      : "text-[#e6edf3]";

  const dotColor =
    !visible
      ? "bg-[#30363d]"
      : sentiment === "positive"
      ? "bg-green-500"
      : sentiment === "negative"
      ? "bg-red-500"
      : "bg-[#8b949e]";

  return (
    <div className={`${bgColor} border ${visible ? borderColor : "border-[#30363d]"} rounded-lg p-4 flex flex-col gap-1 transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className="text-xs uppercase tracking-wider text-[#8b949e]">{label}</span>
        </div>
        {toggleable && (
          <button
            onClick={onToggle}
            title={visible ? "Hide value" : "Show value"}
            className="text-[#30363d] hover:text-[#8b949e] transition-colors text-xs leading-none"
          >
            {visible ? (
              // eye-open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              // eye-off
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {visible ? (
        <>
          <span className={`text-xl font-mono font-bold ${valueColor}`}>{value}</span>
          <span className="text-xs text-[#8b949e]">{sub}</span>
        </>
      ) : (
        <span className="text-xl font-mono font-bold text-[#30363d]">••••••</span>
      )}
    </div>
  );
}

interface Props {
  summary: GexSummary;
  priceLabel?: string;
}

export default function KeyLevels({ summary, priceLabel = "" }: Props) {
  const { netGex, netDex, netVex, gammaFlip, callWall, putWall } = summary;
  const [showNetGex, setShowNetGex] = useState(true);
  const [showNetDex, setShowNetDex] = useState(true);
  const [showNetVex, setShowNetVex] = useState(true);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card
        label="Net GEX"
        value={`$${formatExposure(netGex)}`}
        sub={netGex >= 0 ? "Long gamma regime" : "Short gamma regime"}
        sentiment={netGex >= 0 ? "positive" : "negative"}
        toggleable
        visible={showNetGex}
        onToggle={() => setShowNetGex((v) => !v)}
      />
      <Card
        label="Net DEX"
        value={`$${formatExposure(netDex)}`}
        sub={netDex >= 0 ? "Net long delta" : "Net short delta"}
        sentiment={netDex >= 0 ? "positive" : "negative"}
        toggleable
        visible={showNetDex}
        onToggle={() => setShowNetDex((v) => !v)}
      />
      <Card
        label="Net VEX"
        value={`$${formatExposure(netVex)}`}
        sub={netVex >= 0 ? "Buy pressure on vol↑" : "Sell pressure on vol↑"}
        sentiment={netVex >= 0 ? "positive" : "negative"}
        toggleable
        visible={showNetVex}
        onToggle={() => setShowNetVex((v) => !v)}
      />
      <Card
        label="Gamma Flip"
        value={formatPrice(gammaFlip)}
        sub={priceLabel ? `${priceLabel} zero-crossing` : "GEX zero-crossing"}
        sentiment="neutral"
      />
      <Card
        label="Call Wall"
        value={formatPrice(callWall)}
        sub={priceLabel ? `${priceLabel} max call gamma` : "Max call gamma"}
        sentiment="positive"
      />
      <Card
        label="Put Wall"
        value={formatPrice(putWall)}
        sub={priceLabel ? `${priceLabel} max put gamma` : "Max put gamma"}
        sentiment="negative"
      />
    </div>
  );
}
