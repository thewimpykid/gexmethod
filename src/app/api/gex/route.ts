import { NextRequest, NextResponse } from "next/server";
import {
  accumulateStrikes,
  computeSummary,
  getMultiplier,
  type OptionInput,
} from "@/lib/gexCalculator";
import type { GexSnapshot, StrikeData, HeatmapCell, CexHeatmapCell, VexHeatmapCell, IvPoint } from "@/lib/types";

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
  quote: {
    regularMarketPrice: number;
    preMarketPrice?: number;
    postMarketPrice?: number;
    preMarketTime?: number;
    postMarketTime?: number;
    marketState?: string; // "PRE" | "REGULAR" | "POST" | "POSTPOST" | "PREPRE" | "CLOSED"
  };
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
// Lightweight quote fetcher — regularMarketPrice via chart API
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
// Intraday price fetcher — returns the most recent bar close at or before
// "today at HH:MM ET" (as a wall-clock timestamp).
//
// Examples:
//   Sunday 09:00 → target = Sunday 09:00 ET unix
//                  most recent bar ≤ that = Friday 4pm close
//   Sunday 10:00 → target = Sunday 10:00 ET unix
//                  most recent bar ≤ that = Friday 4pm close  ← same as 09:00
//   Friday 10:00 (during session) → target = today 10:00 ET
//                  most recent bar ≤ that = Friday 10:00 bar
// ---------------------------------------------------------------------------
async function fetchYfIntradayPrice(
  symbol: string,
  session: { cookie: string; crumb: string },
  timeET: string  // "HH:MM"
): Promise<number | null> {
  try {
    const [h, m] = timeET.split(":").map(Number);

    // Build target unix = "today at HH:MM ET" converted to UTC
    const nowUTC   = new Date();
    const etNow    = new Date(nowUTC.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const etTarget = new Date(etNow);
    etTarget.setHours(h, m, 0, 0);
    // ET offset in ms (accounts for EST/EDT automatically)
    const etOffsetMs = nowUTC.getTime() - etNow.getTime();
    const targetUnix = Math.floor((etTarget.getTime() + etOffsetMs) / 1000);

    const params = new URLSearchParams({ interval: "1m", range: "5d", crumb: session.crumb });
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: session.cookie, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      chart: {
        result: {
          timestamp: number[];
          indicators: { quote: { close: (number | null)[] }[] };
        }[];
      };
    };

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp ?? [];
    const closes     = result.indicators?.quote?.[0]?.close ?? [];

    // Most recent bar whose timestamp ≤ targetUnix
    let bestIdx       = -1;
    let bestTimestamp = -1;

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      if (timestamps[i] <= targetUnix && timestamps[i] > bestTimestamp) {
        bestTimestamp = timestamps[i];
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;
    return closes[bestIdx];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const symbol      = (request.nextUrl.searchParams.get("symbol") ?? "QQQ").toUpperCase();
  const usePremarket = request.nextUrl.searchParams.get("premarket") === "1";
  // ?at=HH:MM — use intraday historical price at that ET time instead of current price
  const atTime = request.nextUrl.searchParams.get("at"); // e.g. "09:30"

  try {
    const session = await getYfSession();

    // 1. Fetch first expiry + metadata (spot price + expiration dates list)
    const meta = await fetchYfOptions(symbol, session);
    const regularPrice = meta.quote?.regularMarketPrice;

    // --- Determine spot price ---
    let spot: number;
    let spotIsPreMkt = false;

    if (atTime) {
      // Lookback: try the intraday 1-min bar at that ET time, fall back to most recent price
      const historical = await fetchYfIntradayPrice(symbol, session, atTime);
      spot = historical && historical > 0 ? historical : regularPrice;
    } else {
      // Live: optionally use pre-market price
      const preMktPrice = meta.quote?.preMarketPrice;
      const preMktTime  = meta.quote?.preMarketTime;
      const marketState = meta.quote?.marketState;
      const preMktFresh = preMktTime && (Date.now() / 1000 - preMktTime) < 7200;
      const isPreMarket = marketState === "PRE" || marketState === "PREPRE";
      spotIsPreMkt = !!(usePremarket && isPreMarket && preMktPrice && preMktFresh && preMktPrice > 0);
      spot = spotIsPreMkt ? preMktPrice! : regularPrice;
    }

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
    const expiryStrikeMap = new Map<string, Map<number, StrikeData>>();
    const ivByExpiry = new Map<string, { callIv: number; putIv: number }>();
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

      accumulateStrikes(strikeMap, inputs, spot, multiplier);

      const expiryKey = new Date(expUnix * 1000).toISOString().split("T")[0];
      const perExpiryMap = new Map<number, StrikeData>();
      accumulateStrikes(perExpiryMap, inputs, spot, multiplier);
      expiryStrikeMap.set(expiryKey, perExpiryMap);

      const ATM_BAND = spot * 0.02;
      const atmCallIvs = (opts.calls ?? []).filter((c) => c.strike && Math.abs(c.strike - spot) <= ATM_BAND && c.impliedVolatility).map((c) => c.impliedVolatility as number);
      const atmPutIvs  = (opts.puts  ?? []).filter((p) => p.strike && Math.abs(p.strike - spot) <= ATM_BAND && p.impliedVolatility).map((p) => p.impliedVolatility as number);
      const avgCall = atmCallIvs.length ? atmCallIvs.reduce((a, b) => a + b, 0) / atmCallIvs.length : null;
      const avgPut  = atmPutIvs.length  ? atmPutIvs.reduce((a, b)  => a + b, 0) / atmPutIvs.length  : null;
      if (avgCall !== null || avgPut !== null) {
        ivByExpiry.set(expiryKey, { callIv: avgCall ?? avgPut!, putIv: avgPut ?? avgCall! });
      }
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

    // 5. NQ conversion
    //    For historical lookback (?at=): try intraday 1-min bar for NQ at the same time.
    //    Futures intraday data is often unavailable on Yahoo — fall back to live quote so
    //    the NQ toggle always works.  nqApproximate=true is set on the snapshot when the
    //    NQ price is live rather than historical (so the UI can show a note).
    //    Contract priority: NQM26=F → NQ=F fallback.
    let nqContract = "NQM26=F";
    let nqSpot: number | null = null;
    let ndxSpot: number | null = null;
    let nqApproximate = false;

    if (atTime) {
      // Try intraday bar at that time; fall back to most recent available price
      [nqSpot, ndxSpot] = await Promise.all([
        fetchYfIntradayPrice("NQM26=F", session, atTime),
        fetchYfIntradayPrice("^NDX",    session, atTime),
      ]);
      if (!nqSpot) {
        nqContract = "NQ=F";
        nqSpot = await fetchYfIntradayPrice("NQ=F", session, atTime);
      }
      if (!nqSpot) {
        nqSpot = await fetchYfQuote("NQM26=F", session);
        if (!nqSpot) { nqContract = "NQ=F"; nqSpot = await fetchYfQuote("NQ=F", session); }
        if (nqSpot) nqApproximate = true;
      }
      if (!ndxSpot) ndxSpot = await fetchYfQuote("^NDX", session);
    } else {
      nqSpot  = await fetchYfQuote("NQM26=F", session);
      if (!nqSpot) { nqContract = "NQ=F"; nqSpot = await fetchYfQuote("NQ=F", session); }
      ndxSpot = await fetchYfQuote("^NDX", session);
    }

    // Sanity-check: NQ should be within 5% of ^NDX
    const nqSane = nqSpot && ndxSpot
      ? Math.abs(nqSpot / ndxSpot - 1) < 0.05
      : true;
    if (!nqSane) nqSpot = null;

    const ivTermStructure: IvPoint[] = [...ivByExpiry.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([expiry, { callIv, putIv }]) => ({
        expiry,
        callIv,
        putIv,
        atmIv: (callIv + putIv) / 2,
      }));

    const snapshot: GexSnapshot = {
      symbol, spot, strikes, summary, heatmap, cexHeatmap, vexHeatmap, ivTermStructure,
      updatedAt: new Date().toISOString(),
      ...(atTime        ? { historicalAt: atTime } : {}),
      ...(spotIsPreMkt  ? { spotIsPreMarket: true, regularSpot: regularPrice } : {}),
      ...(nqSpot ? { nqSpot, nqContract, ...(nqApproximate ? { nqApproximate: true } : {}) } : {}),
      ...(ndxSpot ? { ndxSpot } : {}),
    };

    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[gex/route] Error for ${symbol}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
