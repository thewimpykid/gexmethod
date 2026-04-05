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
  gammaFlip: number | null;
  callWall: number;
  putWall: number;
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
  nqSpot?: number;
  strikes: StrikeData[];
  summary: GexSummary;
  heatmap: HeatmapCell[];
  cexHeatmap: CexHeatmapCell[];
  vexHeatmap: VexHeatmapCell[];
  updatedAt: string;
}

export interface ApiError {
  error: string;
}
