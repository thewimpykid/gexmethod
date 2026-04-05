import { NextRequest, NextResponse } from "next/server";
import {
  accumulateStrikes,
  computeSummary,
  getMultiplier,
  type OptionInput,
} from "@/lib/gexCalculator";
import type { GexSnapshot, StrikeData, HeatmapCell, CexHeatmapCell, VexHeatmapCell } from "@/lib/types";

const STRIKE_FILTER = 0.25; // ±25% of spot (API filter — wide)
const MAX_EXPIRATIONS = 10; // near-term expirations for heatmap columns

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Yahoo Finance crumb/cookie cache (in-process, reused across requests)
// ---------------------------------------------------------------------------
let yfSession: { cookie: string; crumb: string; expiresAt: number } | null = null;

async function getYfSession(): Promise<{ cookie: string; crumb: string }> {
  const now = Date.now();
  if (yfSession && yfSession.expiresAt > now) return yfSession;

  // Step 1: Get cookie from fc.yahoo.com
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  const setCookie = cookieRes.headers.get("set-cookie") ?? "";
  // Extract the A1 (or A3) cookie value
  const cookie = setCookie
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.startsWith("A1=") || c.startsWith("A3=") || c.startsWith("A1S="))
    .join("; ");

  if (!cookie) throw new Error("Could not obtain Yahoo Finance session cookie");

  // Step 2: Get crumb
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb response");

  // Cache for 50 minutes
  yfSession = { cookie, crumb, expiresAt: now + 50 * 60 * 1000 };
  return yfSession;
}

// ---------------------------------------------------------------------------
// Yahoo Finance options fetcher
// ---------------------------------------------------------------------------
interface YfOption {
  strike?: number;
  impliedVolatility?: number;
  openInterest?: number;
}

interface YfOptionsResult {
  underlyingSymbol: string;
  expirationDates: number[];
  quote: { regularMarketPrice: number };
  options: {
    expirationDate: number;
    calls: YfOption[];
    puts: YfOption[];
  }[];
}

async function fetchYfOptions(
  symbol: string,
  session: { cookie: string; crumb: string },
  dateUnix?: number
): Promise<YfOptionsResult> {
  const params = new URLSearchParams({ crumb: session.crumb });
  if (dateUnix) params.set("date", String(dateUnix));

  const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?${params}`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: session.cookie, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 401) {
    // Invalidate cached session so next call re-authenticates
    yfSession = null;
    throw new Error(`Yahoo Finance returned 401 for ${symbol} — session expired`);
  }
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`);

  const data = (await res.json()) as {
    optionChain: { result: YfOptionsResult[]; error: string | null };
  };

  const result = data?.optionChain?.result?.[0];
  if (!result) throw new Error(`No option chain data for ${symbol}`);
  return result;
}

// ---------------------------------------------------------------------------
// Lightweight quote fetcher (no options needed — just current price)
// ---------------------------------------------------------------------------
async function fetchYfQuote(
  symbol: string,
  session: { cookie: string; crumb: string }
): Promise<number | null> {
  try {
    const params = new URLSearchParams({ interval: "1d", range: "1d", crumb: session.crumb });
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: session.cookie, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { chart: { result: { meta: { regularMarketPrice: number } }[] } };
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "QQQ").toUpperCase();

  try {
    const session = await getYfSession();

    // 1. Fetch first expiry + metadata (spot price + expiration dates list)
    const meta = await fetchYfOptions(symbol, session);
    const spot = meta.quote?.regularMarketPrice;

    if (!spot || spot <= 0) {
      return NextResponse.json({ error: `Could not fetch price for ${symbol}` }, { status: 400 });
    }

    const allExpiries: number[] = meta.expirationDates ?? [];
    if (allExpiries.length === 0) {
      return NextResponse.json({ error: `No options data found for ${symbol}` }, { status: 404 });
    }

    const expiries = allExpiries.slice(0, MAX_EXPIRATIONS);
    const multiplier = getMultiplier(symbol);
    const strikeMap = new Map<number, StrikeData>();
    const expiryStrikeMap = new Map<string, Map<number, StrikeData>>(); // per-expiry for heatmap
    const now = Date.now();

    // 2. Process each expiration
    for (const expUnix of expiries) {
      const T = (expUnix * 1000 - now) / (1000 * 60 * 60 * 24 * 365);
      if (T <= 0) continue;

      let chain: YfOptionsResult;
      try {
        chain = await fetchYfOptions(symbol, session, expUnix);
      } catch {
        continue;
      }

      const opts = chain.options?.[0];
      if (!opts) continue;

      const inputs: OptionInput[] = [];

      for (const call of opts.calls ?? []) {
        if (!call.strike) continue;
        if (call.strike < spot * (1 - STRIKE_FILTER) || call.strike > spot * (1 + STRIKE_FILTER)) continue;
        inputs.push({ strike: call.strike, impliedVolatility: call.impliedVolatility, openInterest: call.openInterest, type: "call", T });
      }

      for (const put of opts.puts ?? []) {
        if (!put.strike) continue;
        if (put.strike < spot * (1 - STRIKE_FILTER) || put.strike > spot * (1 + STRIKE_FILTER)) continue;
        inputs.push({ strike: put.strike, impliedVolatility: put.impliedVolatility, openInterest: put.openInterest, type: "put", T });
      }

      // Aggregate into global strike map
      accumulateStrikes(strikeMap, inputs, spot, multiplier);

      // Also track per-expiry for the heatmap
      const expiryKey = new Date(expUnix * 1000).toISOString().split("T")[0];
      const perExpiryMap = new Map<number, StrikeData>();
      accumulateStrikes(perExpiryMap, inputs, spot, multiplier);
      expiryStrikeMap.set(expiryKey, perExpiryMap);
    }

    // 3. Sort + summarise
    const strikes = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);
    const summary = computeSummary(strikeMap, spot);

    // 4. Build heatmap cells
    const heatmap: HeatmapCell[] = [];
    const cexHeatmap: CexHeatmapCell[] = [];
    const vexHeatmap: VexHeatmapCell[] = [];
    for (const [expiry, sMap] of expiryStrikeMap.entries()) {
      for (const s of sMap.values()) {
        if (s.netGex !== 0) {
          heatmap.push({ expiry, strike: s.strike, netGex: s.netGex, callGex: s.callGex, putGex: s.putGex });
        }
        if (s.netCex !== 0) {
          cexHeatmap.push({ expiry, strike: s.strike, netCex: s.netCex, callCex: s.callCex, putCex: s.putCex });
        }
        if (s.netVex !== 0) {
          vexHeatmap.push({ expiry, strike: s.strike, netVex: s.netVex, callVex: s.callVex, putVex: s.putVex });
        }
      }
    }

    // 5. Fetch NQ=F spot for client-side NQ conversion (best-effort, never blocks)
    const nqSpot = await fetchYfQuote("NQ=F", session);

    const snapshot: GexSnapshot = {
      symbol, spot, strikes, summary, heatmap, cexHeatmap, vexHeatmap, updatedAt: new Date().toISOString(),
      ...(nqSpot ? { nqSpot } : {}),
    };

    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[gex/route] Error for ${symbol}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
