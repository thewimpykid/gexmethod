export interface StrikeData {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callDex: number;
  putDex: number;
  netDex: number;
  callCex: number;
  putCex: number;
  netCex: number;
  callVex: number;
  putVex: number;
  netVex: number;
}

export interface GexSummary {
  netGex: number;
  netDex: number;
  netVex: number;
  gammaFlip: number | null;
  callWall: number;
  putWall: number;
}

export interface IvPoint {
  expiry: string;    // "YYYY-MM-DD"
  callIv: number;    // ATM call IV (0–1 scale)
  putIv: number;     // ATM put IV (0–1 scale)
  atmIv: number;     // average of call + put
}

export interface HeatmapCell {
  expiry: string;   // "YYYY-MM-DD"
  strike: number;
  netGex: number;
  callGex: number;
  putGex: number;
}

export interface CexHeatmapCell {
  expiry: string;   // "YYYY-MM-DD"
  strike: number;
  netCex: number;
  callCex: number;
  putCex: number;
}

export interface VexHeatmapCell {
  expiry: string;
  strike: number;
  netVex: number;
  callVex: number;
  putVex: number;
}

export interface GexSnapshot {
  symbol: string;
  spot: number;
  historicalAt?: string;      // "HH:MM" ET — set when data was fetched at a past time
  spotIsPreMarket?: boolean;  // true when spot is a pre-market print, not regular close
  regularSpot?: number;       // regular-session price (present when spotIsPreMarket=true)
  nqSpot?: number;          // NQ futures price (ratio = nqSpot / spot)
  ndxSpot?: number;         // ^NDX price (sanity reference)
  nqContract?: string;      // which NQ contract was fetched e.g. "NQM26=F"
  nqApproximate?: boolean;  // true when NQ is live price used as proxy for a historical lookback
  strikes: StrikeData[];
  summary: GexSummary;
  heatmap: HeatmapCell[];
  cexHeatmap: CexHeatmapCell[];
  vexHeatmap: VexHeatmapCell[];
  ivTermStructure: IvPoint[];
  updatedAt: string;
}

export interface ApiError {
  error: string;
}
