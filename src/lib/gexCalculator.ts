import { calcGreeks } from "./blackScholes";
import type { StrikeData, GexSummary } from "./types";

export const MULTIPLIERS: Record<string, number> = {
  QQQ: 100,
  SPY: 100,
  SPX: 100,
  SPXW: 100,
  IWM: 100,
  XSP: 100,
};

export const RISK_FREE_RATE = 0.045;

export function getMultiplier(symbol: string): number {
  return MULTIPLIERS[symbol.toUpperCase()] ?? 100;
}

/** GEX = gamma × OI × multiplier × spot² × 0.01 */
export function calcGex(
  gamma: number,
  oi: number,
  multiplier: number,
  spot: number
): number {
  return gamma * oi * multiplier * spot * spot * 0.01;
}

/** DEX = delta × OI × multiplier × spot */
export function calcDex(
  delta: number,
  oi: number,
  multiplier: number,
  spot: number
): number {
  return delta * oi * multiplier * spot;
}

/** CEX = charm × OI × multiplier × spot (dollar delta shift per year from time decay) */
export function calcCex(
  charm: number,
  oi: number,
  multiplier: number,
  spot: number
): number {
  return charm * oi * multiplier * spot;
}

/** VEX = vanna × OI × multiplier × spot (dollar delta shift per 1-vol-point move) */
export function calcVex(
  vanna: number,
  oi: number,
  multiplier: number,
  spot: number
): number {
  return vanna * oi * multiplier * spot;
}

export interface OptionInput {
  strike: number;
  impliedVolatility: number | undefined;
  openInterest: number | undefined;
  type: "call" | "put";
  T: number; // time to expiry in years
}

/**
 * Process a list of option contracts and accumulate into a strike map.
 */
export function accumulateStrikes(
  strikeMap: Map<number, StrikeData>,
  options: OptionInput[],
  spot: number,
  multiplier: number
): void {
  for (const opt of options) {
    const iv = opt.impliedVolatility ?? 0;
    const oi = opt.openInterest ?? 0;

    if (iv <= 0 || oi <= 0) continue;

    const { delta, gamma, charm, vanna } = calcGreeks(spot, opt.strike, opt.T, RISK_FREE_RATE, iv, opt.type);

    const gex = calcGex(gamma, oi, multiplier, spot);
    const dex = calcDex(delta, oi, multiplier, spot);
    const cex = calcCex(charm, oi, multiplier, spot);
    const vex = calcVex(vanna, oi, multiplier, spot);

    const existing = strikeMap.get(opt.strike) ?? {
      strike: opt.strike,
      callGex: 0, putGex: 0, netGex: 0,
      callDex: 0, putDex: 0, netDex: 0,
      callCex: 0, putCex: 0, netCex: 0,
      callVex: 0, putVex: 0, netVex: 0,
    };

    if (opt.type === "call") {
      existing.callGex += gex;
      existing.callDex += dex;
      existing.callCex += cex;
      existing.callVex += vex;
    } else {
      existing.putGex -= gex;
      existing.putDex += dex;
      existing.putCex -= cex;
      existing.putVex -= vex;
    }

    existing.netGex = existing.callGex + existing.putGex;
    existing.netDex = existing.callDex + existing.putDex;
    existing.netCex = existing.callCex + existing.putCex;
    existing.netVex = existing.callVex + existing.putVex;

    strikeMap.set(opt.strike, existing);
  }
}

/**
 * Compute summary metrics from the aggregated strike map.
 */
export function computeSummary(
  strikeMap: Map<number, StrikeData>,
  spot: number
): GexSummary {
  const strikes = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);

  let netGex = 0;
  let netDex = 0;
  let callWall = 0;
  let putWall = 0;
  let maxCallGex = -Infinity;
  let minPutGex = Infinity;

  for (const s of strikes) {
    netGex += s.netGex;
    netDex += s.netDex;

    if (s.callGex > maxCallGex) {
      maxCallGex = s.callGex;
      callWall = s.strike;
    }
    if (s.putGex < minPutGex) {
      minPutGex = s.putGex;
      putWall = s.strike;
    }
  }

  // Gamma flip: find where cumulative GEX crosses zero
  const gammaFlip = findGammaFlip(strikes, spot);

  return { netGex, netDex, gammaFlip, callWall, putWall };
}

/**
 * Find gamma flip level: the strike price where per-strike netGex crosses zero.
 *
 * At low strikes, puts dominate → netGex is negative.
 * At high strikes, calls dominate → netGex is positive.
 * The zero-crossing between them (nearest to spot) is the gamma flip:
 * below it dealers are net short gamma, above it net long gamma.
 *
 * Using per-strike values (not cumulative) keeps the flip near ATM and
 * avoids the artefact of the cumulative path drifting far from spot.
 */
function findGammaFlip(
  strikes: StrikeData[],
  spot: number
): number | null {
  if (strikes.length < 2) return null;

  // Collect every zero-crossing of per-strike netGex
  const crossings: number[] = [];
  for (let i = 1; i < strikes.length; i++) {
    const prev = strikes[i - 1];
    const curr = strikes[i];
    if ((prev.netGex >= 0 && curr.netGex < 0) || (prev.netGex < 0 && curr.netGex >= 0)) {
      const t = prev.netGex / (prev.netGex - curr.netGex);
      crossings.push(prev.strike + t * (curr.strike - prev.strike));
    }
  }

  if (crossings.length === 0) return null;

  // Return the crossing nearest to spot
  return crossings.reduce((best, c) =>
    Math.abs(c - spot) < Math.abs(best - spot) ? c : best
  );
}
