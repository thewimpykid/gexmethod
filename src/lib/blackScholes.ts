/**
 * Black-Scholes Greeks calculator.
 * CND approximation: Abramowitz & Stegun (1964), accurate to ~7.5e-8.
 */

function cnd(x: number): number {
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const k = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const poly = k * (a1 + k * (a2 + k * (a3 + k * (a4 + k * a5))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const result = 1 - pdf * poly;
  return x >= 0 ? result : 1 - result;
}

function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface Greeks {
  delta: number;
  gamma: number;
  charm: number; // dDelta/dT (per year)
  vanna: number; // dDelta/dσ  (also dVega/dS)
}

/**
 * Compute Black-Scholes delta, gamma, and charm.
 * @param S  Spot price
 * @param K  Strike price
 * @param T  Time to expiry in years
 * @param r  Risk-free rate (e.g. 0.045)
 * @param sigma  Implied volatility (e.g. 0.20 for 20%)
 * @param type   'call' or 'put'
 */
export function calcGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "call" | "put"
): Greeks {
  // Guard: zero/negative time or vol
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: type === "call" ? 1 : -1, gamma: 0, charm: 0, vanna: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const gamma = pdf(d1) / (S * sigma * sqrtT);
  const delta = type === "call" ? cnd(d1) : cnd(d1) - 1;

  // Charm = dDelta/dT = N'(d1) * (r/(σ√T) - d2/(2T))
  const charm = pdf(d1) * (r / (sigma * sqrtT) - d2 / (2 * T));

  // Vanna = dDelta/dσ = -N'(d1) * d2/σ
  const vanna = -pdf(d1) * d2 / sigma;

  return { delta, gamma, charm, vanna };
}
