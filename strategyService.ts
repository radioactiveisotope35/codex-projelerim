
// src/services/strategyService.ts

import {
  TradeSetup,
  TradeStatus,
  MarketData,
  TimeFrame,
  SignalQuality,
  AssetType
} from '../types';

// ─── NEW TYPES FOR RISK ENGINE ───

export type TradeMode = 'TREND' | 'SCALP' | 'REVERSAL';
export type TrendRegime = 'STRONG_UP' | 'STRONG_DOWN' | 'RANGE' | 'NEUTRAL';

export interface ExtendedTradeSetup extends TradeSetup {
  score?: number;
  zoneId?: string;
  session?: 'LONDON' | 'NY' | 'ASIAN' | 'SILVER_BULLET';
  sweep?: 'BULL' | 'BEAR' | null;
  rr?: number;
  plannedRR?: number;
  realizedR?: number;
  exitPrice?: number;
  durationBars?: number;
  fee?: number;
  slippage?: number;
  // New Fields
  tradeMode?: TradeMode;
  regime?: TrendRegime;
  qualityLabel?: 'STANDARD' | 'HIGH' | 'ELITE';
}

type SessionName = 'LONDON' | 'NY' | 'ASIAN' | 'SILVER_BULLET';

// ─── CORE TYPES ───

interface Candle {
  timestamp: number;
  open?: number;
  high: number;
  low: number;
  close?: number;
  price?: number;
  volume?: number;
}

interface SmartZone {
  id: string;
  type: 'OB' | 'FVG' | 'BREAKER';
  direction: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  index: number;
  strength: number;
  tapped: boolean;
  mitigated: boolean;
  partiallyMitigated: boolean;
  htfConfirmed?: boolean;
  biasAligned?: boolean;
  availableFrom: number;
  active: boolean;
}

interface Swing {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  timestamp: number;
  confirmedAtIndex: number;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  profitFactor: number;
  maxDrawdown: number;
  trades: ExtendedTradeSetup[];
  startDate: number;
  endDate: number;
  candleCount: number;
}

export type HTF = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

interface HTFData {
  history: Candle[];
  swings: Swing[];
  zones: SmartZone[];
  biasSeries: ('BULLISH' | 'BEARISH' | 'NEUTRAL')[];
  ema50: number[]; // Added for robust regime detection
  ema200: number[];
}

// ─── SMALL HELPERS ───

const getPrice = (c: Candle): number =>
  c.price ?? c.close ?? c.open ?? 0;

const getSession = (
  ts: number
): 'LONDON' | 'NY' | 'ASIAN' | 'SILVER_BULLET' => {
  const d = new Date(ts);
  const hour = d.getUTCHours();

  if (hour >= 7 && hour < 10) return 'SILVER_BULLET';
  if (hour >= 7 && hour < 16) return 'LONDON';
  if (hour >= 13 && hour < 21) return 'NY';
  return 'ASIAN';
};

// ─── INDICATORS ───

export const calculateATR = (history: Candle[], period = 14): number[] => {
  const n = history.length;
  const atr = new Array(n).fill(0);
  if (n < period + 1) return atr;

  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = history[i].high;
    const l = history[i].low;
    const pc = getPrice(history[i - 1]);
    const trVal = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr[i] = trVal;
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;

  for (let i = period + 1; i < n; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
};

export const calculateSMA = (prices: number[], period: number): number[] => {
  const n = prices.length;
  const sma = new Array(n).fill(0);
  if (n < period) return sma;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) sma[i] = sum / period;
  }
  return sma;
};

export const calculateEMA = (prices: number[], period: number): number[] => {
  const n = prices.length;
  const ema = new Array(n).fill(0);
  if (n < period) return ema;
  const k = 2 / (period + 1);
  let prev = prices[0];
  for (let i = 0; i < n; i++) {
    const price = prices[i];
    if (i === 0) {
      prev = price;
      ema[i] = price;
    } else {
      prev = price * k + prev * (1 - k);
      ema[i] = prev;
    }
  }
  return ema;
};

export const calculateRSI = (prices: number[], period = 14): number[] => {
  const n = prices.length;
  const rsi = new Array(n).fill(50);
  if (n < period + 1) return rsi;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  const firstRsiIndex = period;
  rsi[firstRsiIndex] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = prices[i] - prices[i - 1];
    const curGain = diff > 0 ? diff : 0;
    const curLoss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + curGain) / period;
    avgLoss = (avgLoss * (period - 1) + curLoss) / period;

    if (avgLoss === 0) rsi[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
};

export const calculateADX = (history: Candle[], period = 14): number[] => {
  const n = history.length;
  const adx = new Array(n).fill(0);
  if (n < period + 2) return adx;

  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = history[i].high - history[i - 1].high;
    const downMove = history[i - 1].low - history[i].low;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    const high = history[i].high;
    const low = history[i].low;
    const prevClose = getPrice(history[i - 1]);

    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }

  let sumTR = 0, sumPlusDM = 0, sumMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    sumTR += tr[i];
    sumPlusDM += plusDM[i];
    sumMinusDM += minusDM[i];
  }

  let atr = sumTR;
  let smoothPlusDM = sumPlusDM;
  let smoothMinusDM = sumMinusDM;

  const plusDI: number[] = new Array(n).fill(0);
  const minusDI: number[] = new Array(n).fill(0);
  const dx: number[] = new Array(n).fill(0);

  plusDI[period] = (smoothPlusDM / atr) * 100;
  minusDI[period] = (smoothMinusDM / atr) * 100;
  dx[period] = (Math.abs(plusDI[period] - minusDI[period]) / Math.max(plusDI[period] + minusDI[period], 1e-9)) * 100;

  for (let i = period + 1; i < n; i++) {
    atr = atr - atr / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    plusDI[i] = (smoothPlusDM / atr) * 100;
    minusDI[i] = (smoothMinusDM / atr) * 100;
    dx[i] = (Math.abs(plusDI[i] - minusDI[i]) / Math.max(plusDI[i] + minusDI[i], 1e-9)) * 100;
  }

  let sumDX = 0;
  const firstAdxIndex = period * 2;
  if (n <= firstAdxIndex) return adx;

  for (let i = period; i < firstAdxIndex; i++) {
    sumDX += dx[i];
  }
  adx[firstAdxIndex] = sumDX / period;

  for (let i = firstAdxIndex + 1; i < n; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }
  return adx;
};

// ─── SWINGS & ZONES ───

const getSwingStrength = (tf: TimeFrame): number => {
  switch (tf) {
    case '1m': return 3;
    case '5m': return 4;
    case '15m': return 5;
    case '30m': return 6;
    case '1h': return 7;
    case '4h': return 9;
    case '1d': return 10;
    default: return 5;
  }
};

const findSwings = (history: Candle[], tf: TimeFrame | HTF): Swing[] => {
  const strength = getSwingStrength(tf as TimeFrame);
  const n = history.length;
  const swings: Swing[] = [];
  if (n < strength * 2 + 1) return swings;

  for (let i = strength; i < n - strength; i++) {
    const c = history[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - strength; j <= i + strength; j++) {
      if (history[j].high > c.high) isHigh = false;
      if (history[j].low < c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh || isLow) {
      swings.push({
        index: i,
        price: isHigh ? c.high : c.low,
        type: isHigh ? 'HIGH' : 'LOW',
        timestamp: c.timestamp,
        confirmedAtIndex: i + strength
      });
    }
  }
  return swings;
};

const detectFVGs = (history: Candle[]): SmartZone[] => {
  const n = history.length;
  const zones: SmartZone[] = [];
  for (let i = 2; i < n; i++) {
    const a = history[i - 2];
    const c = history[i];

    if (a.high < c.low) {
      zones.push({
        id: `FVG-BULL-${i}`,
        type: 'FVG',
        direction: 'BULLISH',
        top: c.low,
        bottom: a.high,
        index: i,
        strength: 1,
        tapped: false,
        mitigated: false,
        partiallyMitigated: false,
        availableFrom: i,
        active: true
      });
    }

    if (a.low > c.high) {
      zones.push({
        id: `FVG-BEAR-${i}`,
        type: 'FVG',
        direction: 'BEARISH',
        top: a.low,
        bottom: c.high,
        index: i,
        strength: 1,
        tapped: false,
        mitigated: false,
        partiallyMitigated: false,
        availableFrom: i,
        active: true
      });
    }
  }
  return zones;
};

const detectOrderBlocks = (history: Candle[], swings: Swing[]): SmartZone[] => {
  const zones: SmartZone[] = [];
  for (const s of swings) {
    const c = history[s.index];
    if (!c) continue;

    const close = getPrice(c);
    const open = c.open ?? close;
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);

    if (s.type === 'HIGH') {
      zones.push({
        id: `OB-BEAR-${s.index}`,
        type: 'OB',
        direction: 'BEARISH',
        top: c.high,
        bottom: bodyBottom,
        index: s.index,
        strength: 1.5,
        tapped: false,
        mitigated: false,
        partiallyMitigated: false,
        availableFrom: s.confirmedAtIndex,
        active: true
      });
    } else {
      zones.push({
        id: `OB-BULL-${s.index}`,
        type: 'OB',
        direction: 'BULLISH',
        top: bodyTop,
        bottom: c.low,
        index: s.index,
        strength: 1.5,
        tapped: false,
        mitigated: false,
        partiallyMitigated: false,
        availableFrom: s.confirmedAtIndex,
        active: true
      });
    }
  }
  return zones;
};

const detectBreakerBlocks = (history: Candle[], obs: SmartZone[]): SmartZone[] => {
  const breakers: SmartZone[] = [];
  const n = history.length;

  for (const ob of obs) {
    if (ob.index >= n - 5) continue;

    if (ob.direction === 'BULLISH') {
      for (let i = ob.index + 1; i < n; i++) {
        const c = history[i];
        const close = getPrice(c);
        if (c.low < ob.bottom && close < ob.bottom) {
          breakers.push({
            id: `BRK-BEAR-${ob.index}`,
          type: 'BREAKER',
          direction: 'BEARISH',
          top: ob.top,
          bottom: ob.bottom,
          index: i,
          strength: 2,
          tapped: false,
          mitigated: false,
          partiallyMitigated: false,
          availableFrom: i + 1,
          active: true
        });
        break;
      }
    }
    } else {
      for (let i = ob.index + 1; i < n; i++) {
        const c = history[i];
        const close = getPrice(c);
        if (c.high > ob.top && close > ob.top) {
          breakers.push({
            id: `BRK-BULL-${ob.index}`,
            type: 'BREAKER',
            direction: 'BULLISH',
            top: ob.top,
            bottom: ob.bottom,
            index: i,
            strength: 2,
            tapped: false,
            mitigated: false,
            partiallyMitigated: false,
            availableFrom: i + 1,
            active: true
          });
          break;
        }
      }
    }
  }

  return breakers;
};

// ─── HTF DATA & REGIME DETECTION ───

const calculateHTFBiasSeries = (history: Candle[]): { bias: ('BULLISH' | 'BEARISH' | 'NEUTRAL')[], sma50: number[] } => {
  const closes = history.map(getPrice);
  const sma50 = calculateSMA(closes, 50);
  const res: ('BULLISH' | 'BEARISH' | 'NEUTRAL')[] = new Array(history.length).fill('NEUTRAL');

  for (let i = 0; i < history.length; i++) {
    const sma = sma50[i];
    if (!sma) {
      res[i] = 'NEUTRAL';
      continue;
    }
    const p = getPrice(history[i]);
    if (p > sma * 1.005) res[i] = 'BULLISH';
    else if (p < sma * 0.995) res[i] = 'BEARISH';
    else res[i] = 'NEUTRAL';
  }

  return { bias: res, sma50 };
};

const prepareHTFData = (asset: MarketData, externalHTFData?: any): Record<HTF, HTFData> => {
  const result: Partial<Record<HTF, HTFData>> = {};
  const htfs: HTF[] = ['5m', '15m', '30m', '1h', '4h', '1d'];
  const source: any = externalHTFData || (asset as any).htf || {};

  for (const htf of htfs) {
    const mapKey = htf === '1h' ? 'h1' : htf === '4h' ? 'h4' : htf;
    let raw = source[htf] || source[mapKey];

    if (raw && !Array.isArray(raw)) {
      if (Array.isArray(raw.history)) raw = raw.history;
      else if (Array.isArray(raw.data)) raw = raw.data;
    }

    if (!raw || !Array.isArray(raw) || raw.length < 50) continue;

    const history = raw as Candle[];
    const swings = findSwings(history, htf);
    const fvgs = detectFVGs(history);
    const obs = detectOrderBlocks(history, swings);
    const brks = detectBreakerBlocks(history, obs);
    const { bias, sma50 } = calculateHTFBiasSeries(history);
    const closes = history.map(getPrice);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);

    result[htf] = {
      history,
      swings,
      zones: [...fvgs, ...obs, ...brks],
      biasSeries: bias,
      ema50: ema50.length ? ema50 : sma50,
      ema200
    };
  }

  return result as Record<HTF, HTFData>;
};

const getHTFIndex = (ts: number, history: Candle[]): number => {
  let lo = 0;
  let hi = history.length - 1;
  let ans = hi;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].timestamp <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

// ─── NEW: GLOBAL REGIME ENGINE ───

/**
 * Determines the global market regime (STRONG_UP, STRONG_DOWN, RANGE)
 * Uses 4H and 1H data to align trends.
 */
const determineTrendRegime = (
  htfData: Record<HTF, HTFData>,
  currentTs: number
): TrendRegime => {
  const h4 = htfData['4h'];
  const h1 = htfData['1h'];

  if (!h4 || !h1) return 'NEUTRAL'; // Insufficient data

  const idx4 = getHTFIndex(currentTs, h4.history);
  const idx1 = getHTFIndex(currentTs, h1.history);

  const bias4 = h4.biasSeries[idx4] ?? 'NEUTRAL';
  const bias1 = h1.biasSeries[idx1] ?? 'NEUTRAL';

  if (bias4 === 'BULLISH' && bias1 === 'BULLISH') return 'STRONG_UP';
  if (bias4 === 'BEARISH' && bias1 === 'BEARISH') return 'STRONG_DOWN';
  
  // Conflicting trends suggest range or transition
  if (bias4 !== bias1) return 'RANGE';

  return 'NEUTRAL';
};

const PARENT_TF: Partial<Record<TimeFrame, HTF>> = {
  '1m': '5m',
  '5m': '1h',
  '15m': '1h',
  '30m': '4h',
  '1h': '4h',
  '4h': '1d'
};

const getParentHTF = (tf: TimeFrame): HTF | null => {
  return (PARENT_TF[tf] as HTF) ?? null;
};

const deriveHtfTrend = (
  htfData: Record<HTF, HTFData>,
  tf: TimeFrame,
  currentTs: number
): {
  trend: 'BULL' | 'BEAR' | 'NEUTRAL';
  allowLong: boolean;
  allowShort: boolean;
  priceAboveEma200: boolean;
} => {
  const parent = getParentHTF(tf);

  // Bazı TF'lerin parent'ı yok (örn. 1d); bunlarda eski davranışı koruyoruz.
  if (!parent) {
    return {
      trend: 'NEUTRAL',
      allowLong: true,
      allowShort: true,
      priceAboveEma200: true
    };
  }

  const hd = htfData[parent];

  // KRİTİK: Parent HTF datası yoksa, yönsel işlem açma.
  if (!hd || !hd.history.length) {
    return {
      trend: 'NEUTRAL',
      allowLong: false,
      allowShort: false,
      priceAboveEma200: true
    };
  }

  const idx = getHTFIndex(currentTs, hd.history);
  const price = getPrice(hd.history[idx]);
  const ema50 = hd.ema50[idx];
  const ema200 = hd.ema200[idx];

  const priceAboveEma200 = ema200 ? price > ema200 : true;
  let trend: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';

  if (ema50 && ema200) {
    if (ema50 > ema200 && price > ema50) trend = 'BULL';
    else if (ema50 < ema200 && price < ema50) trend = 'BEAR';
  }

  const allowLong = priceAboveEma200;
  const allowShort = true;

  return { trend, allowLong, allowShort, priceAboveEma200 };
};

  const idx = getHTFIndex(currentTs, hd.history);
  const price = getPrice(hd.history[idx]);
  const ema50 = hd.ema50[idx];
  const ema200 = hd.ema200[idx];
  const priceAboveEma200 = ema200 ? price > ema200 : true;
  let trend: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';

  if (ema50 && ema200) {
    if (ema50 > ema200 && price > ema50) trend = 'BULL';
    else if (ema50 < ema200 && price < ema50) trend = 'BEAR';
  }

  const allowLong = priceAboveEma200;
  const allowShort = true;

  return { trend, allowLong, allowShort, priceAboveEma200 };
};

// Which HTFs to use as confluence for a given base TF (existing logic maintained for scoring)
const HTF_CONFIG: Record<TimeFrame, { htf: HTF; boost: number; requireBias: boolean }[] > = {
  '1m': [{ htf: '5m', boost: 4, requireBias: true }, { htf: '15m', boost: 3, requireBias: false }],
  '5m': [{ htf: '15m', boost: 5, requireBias: true }, { htf: '1h', boost: 3, requireBias: false }],
  '15m': [{ htf: '1h', boost: 6, requireBias: true }, { htf: '4h', boost: 3, requireBias: false }],
  '30m': [{ htf: '1h', boost: 6, requireBias: true }, { htf: '4h', boost: 4, requireBias: false }],
  '1h': [{ htf: '4h', boost: 7, requireBias: true }, { htf: '1d', boost: 4, requireBias: false }],
  '4h': [{ htf: '1d', boost: 8, requireBias: true }],
  '1d': []
};

// ─── ZONE TTL & SCORE CONFIG ───

const getZoneTTL = (tf: TimeFrame): number => {
  switch (tf) {
    case '1m':
      return 150;  // ~2.5 saat
    case '5m':
      return 120;  // ~10 saat
    case '15m':
      return 96;   // ~1 gün
    case '30m':
      return 80;   // ~1.5–2 gün
    case '1h':
      return 80;   // ~3–4 gün
    case '4h':
      return 60;   // ~10 gün civarı
    case '1d':
      return 45;   // ~1.5 ay civarı
    default:
      return 100;
  }
};

interface TfScoreConfig {
  minScore: number;
  volumeBonus: number;
  volumePenalty: number;
  mssBonus: number;
  mssPenalty: number;
}

const TF_SCORE_CONFIG: Record<TimeFrame, TfScoreConfig> = {
  '1m': { minScore: 23, volumeBonus: 3, volumePenalty: -1, mssBonus: 4, mssPenalty: -1 },
  '5m': { minScore: 21, volumeBonus: 3, volumePenalty: -1, mssBonus: 4, mssPenalty: -1 },
  '15m': { minScore: 20, volumeBonus: 3, volumePenalty: -1, mssBonus: 4, mssPenalty: -1 },
  '30m': { minScore: 19, volumeBonus: 2, volumePenalty: -1, mssBonus: 3, mssPenalty: -1 },
  '1h': { minScore: 19, volumeBonus: 2, volumePenalty: 0, mssBonus: 3, mssPenalty: 0 },
  '4h': { minScore: 18, volumeBonus: 1, volumePenalty: 0, mssBonus: 2, mssPenalty: 0 },
  '1d': { minScore: 17, volumeBonus: 1, volumePenalty: 0, mssBonus: 2, mssPenalty: 0 }
};

const getMinScore = (tf: TimeFrame): number => TF_SCORE_CONFIG[tf]?.minScore ?? 19;

// ─── ZONE LIFECYCLE ───

const applyZoneLifecycle = (
  zones: SmartZone[],
  history: Candle[],
  currentIndex: number,
  ttlBars: number
): void => {
  for (const zone of zones) {
    if (!zone.active) continue;

    if (currentIndex - zone.availableFrom > ttlBars) {
      zone.active = false;
      continue;
    }

    const start = Math.max(zone.availableFrom, zone.index);
    for (let i = start; i <= currentIndex; i++) {
      const c = history[i];
      if (!c) break;

      const close = getPrice(c);
      const open = c.open ?? close;

      if (zone.direction === 'BULLISH') {
        const bodyBelow = close < zone.bottom && open < zone.bottom;
        if (bodyBelow) {
          zone.mitigated = true;
          zone.active = false;
          break;
        }
        if (c.low <= zone.top) {
          zone.partiallyMitigated = true;
        }
      } else {
        const bodyAbove = close > zone.top && open > zone.top;
        if (bodyAbove) {
          zone.mitigated = true;
          zone.active = false;
          break;
        }
        if (c.high >= zone.bottom) {
          zone.partiallyMitigated = true;
        }
      }
    }
  }
};

// ─── RISK PROFILE ───

type ZoneKind = SmartZone['type'];

interface RiskProfile {
  slAtrMultiplier: number;
  targetRR: number;
}

const RISK_PROFILE: Record<TimeFrame, Record<ZoneKind, RiskProfile>> = {
  '1m': { BREAKER: { slAtrMultiplier: 0.38, targetRR: 5.2 }, OB: { slAtrMultiplier: 0.36, targetRR: 4.6 }, FVG: { slAtrMultiplier: 0.34, targetRR: 4.0 } },
  '5m': { BREAKER: { slAtrMultiplier: 0.36, targetRR: 4.8 }, OB: { slAtrMultiplier: 0.35, targetRR: 4.3 }, FVG: { slAtrMultiplier: 0.34, targetRR: 3.8 } },
  '15m': { BREAKER: { slAtrMultiplier: 0.38, targetRR: 4.6 }, OB: { slAtrMultiplier: 0.37, targetRR: 4.1 }, FVG: { slAtrMultiplier: 0.35, targetRR: 3.7 } },
  '30m': { BREAKER: { slAtrMultiplier: 0.4, targetRR: 4.4 }, OB: { slAtrMultiplier: 0.39, targetRR: 3.9 }, FVG: { slAtrMultiplier: 0.36, targetRR: 3.5 } },
  '1h': { BREAKER: { slAtrMultiplier: 0.45, targetRR: 4.2 }, OB: { slAtrMultiplier: 0.43, targetRR: 3.8 }, FVG: { slAtrMultiplier: 0.4, targetRR: 3.4 } },
  '4h': { BREAKER: { slAtrMultiplier: 0.5, targetRR: 4.0 }, OB: { slAtrMultiplier: 0.47, targetRR: 3.6 }, FVG: { slAtrMultiplier: 0.42, targetRR: 3.2 } },
  '1d': { BREAKER: { slAtrMultiplier: 0.55, targetRR: 3.8 }, OB: { slAtrMultiplier: 0.5, targetRR: 3.4 }, FVG: { slAtrMultiplier: 0.45, targetRR: 3.0 } }
};

const getRiskProfile = (tf: TimeFrame, zoneType: ZoneKind): RiskProfile => {
  return RISK_PROFILE[tf]?.[zoneType] ?? { slAtrMultiplier: 0.4, targetRR: zoneType === 'BREAKER' ? 6 : zoneType === 'OB' ? 5 : 4 };
};

interface RrBounds {
  min: number;
  max: number;
}

const RR_BOUNDS: Record<TimeFrame, RrBounds> = {
  '1m':  { min: 1.0, max: 4.0 },
  '5m':  { min: 1.0, max: 4.0 },
  '15m': { min: 1.0, max: 4.5 },
  '30m': { min: 1.2, max: 5.0 },
  '1h':  { min: 2.0, max: 6.5 },
  '4h':  { min: 2.5, max: 8.0 },
  '1d':  { min: 3.0, max: 10.0 }
};

const getRrBounds = (
  tf: TimeFrame,
  direction: 'LONG' | 'SHORT',
  assetType: AssetType
): RrBounds => {
  const base = RR_BOUNDS[tf] ?? { min: 1.0, max: 12.0 };
  if (assetType === AssetType.FOREX && (tf === '1m' || tf === '5m' || tf === '15m')) {
    return { min: 1.0, max: base.max };
  }
  return base;
};

const TARGET_RR: Record<TimeFrame, { base: number; max: number }> = {
  '1m': { base: 2, max: 3 },
  '5m': { base: 2.5, max: 3.5 },
  '15m': { base: 2.5, max: 3.8 },
  '30m': { base: 3, max: 4.5 },
  '1h': { base: 4, max: 6 },
  '4h': { base: 5, max: 6.5 },
  '1d': { base: 5, max: 7 }
};

const getTargetRR = (tf: TimeFrame, trend: 'BULL' | 'BEAR' | 'NEUTRAL'): number => {
  const cfg = TARGET_RR[tf] ?? { base: 3, max: 5 };
  if (trend === 'NEUTRAL') return cfg.base;
  return Math.min(cfg.max, cfg.base + 0.5);
};

const getRecentSwing = (
  swings: Swing[],
  direction: 'LONG' | 'SHORT',
  entryIndex: number
): Swing | undefined => {
  const filtered = swings
    .filter((s) => s.confirmedAtIndex <= entryIndex)
    .filter((s) => (direction === 'LONG' ? s.type === 'LOW' : s.type === 'HIGH'));
  return filtered[filtered.length - 1];
};

const computeStructuralStop = (
  direction: 'LONG' | 'SHORT',
  entryIndex: number,
  swings: Swing[],
  atr: number,
  zone: SmartZone
): number => {
  const buffer = atr * 0.25;
  const recentSwing = getRecentSwing(swings, direction, entryIndex);
  if (direction === 'LONG') {
    const swingLevel = recentSwing ? recentSwing.price - buffer : Number.POSITIVE_INFINITY;
    const atrLevel = zone.bottom - atr * 0.75;
    return Math.min(swingLevel, atrLevel);
  }
  const swingLevel = recentSwing ? recentSwing.price + buffer : Number.NEGATIVE_INFINITY;
  const atrLevel = zone.top + atr * 0.75;
  return Math.max(swingLevel, atrLevel);
};

const EARLY_EXIT_BARS: Record<TimeFrame, number> = {
  '1m': 12,
  '5m': 14,
  '15m': 16,
  '30m': 18,
  '1h': 20,
  '4h': 24,
  '1d': 30
};

const EARLY_EXIT_DRIFT = 0.3;

// ─── SWEEP / STRUCTURE / VOLUME ───

const detectLiquiditySweep = (
  history: Candle[],
  swings: Swing[],
  i: number
): 'BULL' | 'BEAR' | null => {
  const window = swings.filter(
    (s) => s.confirmedAtIndex <= i && s.index > i - 50 && s.index < i
  );
  const c = history[i];
  if (!c) return null;
  const close = getPrice(c);

  const sweptHigh = window.find((s) => s.type === 'HIGH' && c.high > s.price && close < s.price);
  if (sweptHigh) return 'BEAR';

  const sweptLow = window.find((s) => s.type === 'LOW' && c.low < s.price && close > s.price);
  if (sweptLow) return 'BULL';

  return null;
};

const isMSS = (history: Candle[], i: number, dir: 'BULL' | 'BEAR'): boolean => {
  if (i < 3) return false;
  const c0 = history[i - 3];
  const c1 = history[i - 2];
  const c2 = history[i - 1];
  const c3 = history[i];
  if (!c0 || !c1 || !c2 || !c3) return false;
  const c3Close = getPrice(c3);

  if (dir === 'BULL') {
    return c1.low < c0.low && c2.low < c1.low && c3.high > c1.high && c3Close > c1.high;
  } else {
    return c1.high > c0.high && c2.high > c1.high && c3.low < c1.low && c3Close < c1.low;
  }
};

const isVolumeSpikeAtIndex = (idx: number, history: Candle[], lookback = 20): boolean => {
  const c = history[idx];
  if (!c || c.volume == null) return false;
  const start = Math.max(0, idx - lookback);
  const window = history.slice(start, idx);
  if (!window.length) return false;
  const avg = window.reduce((s, x) => s + (x.volume ?? 0), 0) / window.length;
  return c.volume > avg * 2.2;
};

const checkVolumeConfirmation = (idx: number, volumeSpikes: boolean[]): boolean => {
  if (idx < 0) return false;
  if (volumeSpikes[idx]) return true;
  if (idx - 1 >= 0 && volumeSpikes[idx - 1]) return true;
  if (idx - 2 >= 0 && volumeSpikes[idx - 2]) return true;
  return false;
};

// ─── SCORING HELPERS ───

const getImpulseScore = (zone: SmartZone, history: Candle[], atr: number): number => {
  const c = history[zone.index];
  if (!c) return 0;
  const close = getPrice(c);
  const open = c.open ?? close;
  const body = Math.abs(close - open);
  const range = Math.max(c.high - c.low, 1e-9);
  const atrSafe = Math.max(atr, 1e-9);
  const bodyAtr = body / atrSafe;
  const closePos = (close - c.low) / range;

  let score = 0;
  if (zone.direction === 'BULLISH') {
    if (bodyAtr >= 1.2 && closePos >= 0.7) score += 3;
    else if (bodyAtr >= 0.8 && closePos >= 0.6) score += 2;
    else if (bodyAtr >= 0.4) score += 1;
    else score -= 2;
  } else {
    if (bodyAtr >= 1.2 && closePos <= 0.3) score += 3;
    else if (bodyAtr >= 0.8 && closePos <= 0.4) score += 2;
    else if (bodyAtr >= 0.4) score += 1;
    else score -= 2;
  }
  return score;
};

const getPremiumDiscountScore = (
  direction: 'LONG' | 'SHORT',
  price: number,
  htf: HTF,
  htfData: Record<HTF, HTFData>,
  currentTs: number
): number => {
  const hd = htfData[htf];
  if (!hd || hd.swings.length < 2) return 0;
  const idx = getHTFIndex(currentTs, hd.history);
  const swingsBefore = hd.swings.filter((s) => s.index <= idx);
  if (swingsBefore.length < 2) return 0;
  const lastSwing = swingsBefore[swingsBefore.length - 1];
  const prevSwing = swingsBefore[swingsBefore.length - 2];
  const low = Math.min(lastSwing.price, prevSwing.price);
  const high = Math.max(lastSwing.price, prevSwing.price);
  if (high <= low) return 0;
  const posRaw = (price - low) / (high - low);
  const pos = Math.max(0, Math.min(1, posRaw));

  let score = 0;
  if (direction === 'LONG') {
    if (pos <= 0.35) score += 3;
    else if (pos <= 0.5) score += 2;
    else if (pos <= 0.65) score += 0;
    else score -= 2;
  } else {
    if (pos >= 0.65) score += 3;
    else if (pos >= 0.5) score += 2;
    else if (pos >= 0.35) score += 0;
    else score -= 2;
  }
  return score;
};

interface StrategyContext {
  timeframe: TimeFrame;
  session: SessionName;
  atr: number;
  rsi: number;
  adx: number;
  sweep: 'BULL' | 'BEAR' | null;
  regime: TrendRegime;
  htfTrend: {
    trend: 'BULL' | 'BEAR' | 'NEUTRAL';
    allowLong: boolean;
    allowShort: boolean;
    priceAboveEma200: boolean;
  };
  assetType: AssetType;
  volatilityShock: boolean;
}

const ASIAN_RESTRICTED_ASSETS = new Set<AssetType>([AssetType.CRYPTO, AssetType.METAL]);
const LOW_TF_SET = new Set<TimeFrame>(['1m', '5m', '15m']);
const ADX_TREND_ALLOWED: Partial<Record<TimeFrame, boolean>> = {
  '4h': true,
  '1d': true
};

const hasVolatilityShock = (c: Candle, atr: number, multiplier = 3): boolean => {
  const range = c.high - c.low;
  return atr > 0 && range > atr * multiplier;
};

const computeContext = (
  timeframe: TimeFrame,
  asset: MarketData,
  history: Candle[],
  htfData: Record<HTF, HTFData>,
  atrArr: number[],
  rsiArr: number[],
  adxArr: number[],
  index: number,
  sweep: 'BULL' | 'BEAR' | null
): StrategyContext => {
  const candle = history[index];
  const session = getSession(candle.timestamp);
  const atr = atrArr[index] || atrArr[index - 1] || 0;
  const rsi = rsiArr[index] || 50;
  const adx = adxArr[index] || 0;
  const regime = determineTrendRegime(htfData, candle.timestamp);
  const htfTrend = deriveHtfTrend(htfData, timeframe, candle.timestamp);
  const volatilityShock = hasVolatilityShock(candle, atr);
  return {
    timeframe,
    session,
    atr,
    rsi,
    adx,
    sweep,
    regime,
    htfTrend,
    assetType: asset.type,
    volatilityShock
  };
};

const passesHardFilters = (
  context: StrategyContext,
  zone: SmartZone,
  direction: 'LONG' | 'SHORT',
  mss: boolean,
  volumeConfirmed: boolean,
  ttlBars: number,
  currentIndex: number
): boolean => {
  if (!zone.active || currentIndex < zone.availableFrom) return false;
  if (currentIndex - zone.availableFrom > ttlBars) return false;

  if (context.volatilityShock) return false;

  if (context.session === 'ASIAN' && ASIAN_RESTRICTED_ASSETS.has(context.assetType) &&
      (context.timeframe === '5m' || context.timeframe === '15m')) {
    return false;
  }

  if (direction === 'LONG' && !context.htfTrend.allowLong) return false;
  if (LOW_TF_SET.has(context.timeframe) && context.htfTrend.trend === 'BULL' && direction === 'SHORT') return false;
  if (LOW_TF_SET.has(context.timeframe) && context.htfTrend.trend === 'BEAR' && direction === 'LONG') return false;

  if (direction === 'LONG' && context.rsi <= 50) return false;
  if (direction === 'SHORT' && context.rsi >= 50) return false;

  if (context.adx < 20 && !(ADX_TREND_ALLOWED[context.timeframe])) return false;

  const isReversal =
    (context.htfTrend.trend === 'BULL' && direction === 'SHORT') ||
    (context.htfTrend.trend === 'BEAR' && direction === 'LONG');
  if (isReversal && !mss) return false;

  if (zone.type === 'BREAKER' && !volumeConfirmed) return false;

  return true;
};

const computeScore = (
  baseScore: number,
  context: StrategyContext,
  zone: SmartZone,
  volumeConfirmed: boolean,
  mss: boolean
): number => {
  let score = baseScore;
  if (context.htfTrend.trend === 'BULL' && zone.direction === 'BULLISH') score += 6;
  if (context.htfTrend.trend === 'BEAR' && zone.direction === 'BEARISH') score += 6;
  if (volumeConfirmed) score += 4;
  if (mss) score += 5;
  if (context.adx > 25) score += 3;
  if (context.adx < 15) score -= 3;
  if (context.rsi >= 55 && zone.direction === 'BULLISH') score += 2;
  if (context.rsi <= 45 && zone.direction === 'BEARISH') score += 2;

  const normalized = Math.max(0, Math.min(100, 50 + score * 2));
  return normalized;
};

const TP_LOOKBACK: Record<TimeFrame, number> = {
  '1m': 300, '5m': 260, '15m': 220, '30m': 180, '1h': 140, '4h': 100, '1d': 80
};

const getTpLookbackBars = (tf: TimeFrame): number => TP_LOOKBACK[tf] ?? 200;

// UPDATED: Adaptive RR Bounds now accounts for Scalp Mode
const getAdaptiveRrBounds = (
  baseTarget: number,
  zoneType: ZoneKind,
  score?: number,
  session?: SessionName,
  tradeMode: TradeMode = 'TREND'
): { minRR: number; maxRR: number } => {
  let minRR = Math.max(2.5, baseTarget * 0.7);
  let maxRR = Math.min(8, baseTarget * 1.6);

  if (tradeMode === 'SCALP') {
    // Aggressive limit for scalp/counter-trend trades
    minRR = 1.5;
    maxRR = 2.5; 
    return { minRR, maxRR };
  }

  if (zoneType === 'BREAKER') {
    minRR = Math.max(minRR, 3);
    maxRR = Math.min(9, maxRR + 0.5);
  } else if (zoneType === 'FVG') {
    maxRR = Math.min(maxRR, 7.5);
  }

  if (typeof score === 'number') {
    if (score >= 30) maxRR = Math.min(9, maxRR + 0.5);
    else if (score <= 18) maxRR = Math.min(maxRR, baseTarget * 1.3);
  }

  if (session === 'ASIAN') maxRR = Math.min(maxRR, 6);

  if (minRR > maxRR) {
    const mid = (minRR + maxRR) / 2;
    minRR = mid * 0.9;
    maxRR = mid * 1.1;
  }

  return { minRR, maxRR };
};

const snapTpToNearestLiquidity = (
  direction: 'LONG' | 'SHORT',
  entry: number,
  sl: number,
  targetRR: number,
  history: Candle[],
  currentIndex: number,
  swings: Swing[],
  timeframe: TimeFrame,
  zoneType: ZoneKind,
  score?: number,
  session?: SessionName,
  tradeMode: TradeMode = 'TREND'
): { tp: number; rr: number } => {
  const risk = Math.abs(entry - sl);
  if (risk < 1e-9) return { tp: entry, rr: 0 };

  const rrTarget = Math.max(0, targetRR);
  const { minRR, maxRR } = getAdaptiveRrBounds(rrTarget, zoneType, score, session, tradeMode);

  const lookback = getTpLookbackBars(timeframe);
  const windowStart = Math.max(0, currentIndex - lookback);
  const windowEnd = currentIndex;

  let bestTp = Number.NaN;
  let bestRr = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const s of swings) {
    if (s.confirmedAtIndex >= windowEnd || s.index < windowStart || s.index >= windowEnd) continue;
    const price = s.price;

    if (direction === 'LONG') {
      if (s.type !== 'HIGH' || price <= entry) continue;
    } else {
      if (s.type !== 'LOW' || price >= entry) continue;
    }

    const rr = direction === 'LONG' ? (price - entry) / risk : (entry - price) / risk;
    if (!Number.isFinite(rr) || rr < minRR || rr > maxRR) continue;

    const rrDiff = Math.abs(rr - rrTarget);
    const distInR = Math.abs(price - entry) / risk;
    const compositeScore = rrDiff * 1.0 + distInR * 0.15;

    if (compositeScore < bestScore) {
      bestScore = compositeScore;
      bestTp = price;
      bestRr = rr;
    }
  }

  if (!Number.isNaN(bestTp)) return { tp: bestTp, rr: bestRr };

  const start = windowStart;
  for (let j = start; j < windowEnd; j++) {
    const c = history[j];
    if (!c) continue;

    if (direction === 'LONG') {
      if (c.high <= entry) continue;
      const candidate = c.high;
      const rr = (candidate - entry) / risk;
      if (!Number.isFinite(rr) || rr < minRR || rr > maxRR) continue;
      
      const rrDiff = Math.abs(rr - rrTarget);
      const distInR = Math.abs(candidate - entry) / risk;
      const compositeScore = rrDiff * 1.0 + distInR * 0.2;

      if (compositeScore < bestScore) {
        bestScore = compositeScore;
        bestTp = candidate;
        bestRr = rr;
      }
    } else {
      if (c.low >= entry) continue;
      const candidate = c.low;
      const rr = (entry - candidate) / risk;
      if (!Number.isFinite(rr) || rr < minRR || rr > maxRR) continue;

      const rrDiff = Math.abs(rr - rrTarget);
      const distInR = Math.abs(candidate - entry) / risk;
      const compositeScore = rrDiff * 1.0 + distInR * 0.2;

      if (compositeScore < bestScore) {
        bestScore = compositeScore;
        bestTp = candidate;
        bestRr = rr;
      }
    }
  }

  if (!Number.isNaN(bestTp)) return { tp: bestTp, rr: bestRr };

  let fallbackRr = rrTarget;
  if (!Number.isFinite(fallbackRr) || fallbackRr <= 0) fallbackRr = (minRR + maxRR) / 2 || 3;
  fallbackRr = Math.min(Math.max(fallbackRr, minRR), maxRR);

  const fallbackTp = direction === 'LONG' ? entry + fallbackRr * risk : entry - fallbackRr * risk;
  return { tp: fallbackTp, rr: fallbackRr };
};

// ─── SCORING (BASE SCORE) ───

const calculateScore = (
  zone: SmartZone,
  sweep: 'BULL' | 'BEAR' | null,
  session: string,
  atr: number,
  price: number,
  htfData: Record<HTF, HTFData> | undefined,
  currentTs: number,
  baseTF: TimeFrame,
  history: Candle[]
): number => {
  let score = zone.strength;

  if (zone.type === 'FVG') score += 3;
  if (zone.type === 'OB') score += 5;
  if (zone.type === 'BREAKER') score += 7;

  const height = Math.abs(zone.top - zone.bottom);
  const atrRatio = height / Math.max(atr, 1e-9);
  if (atrRatio < 0.2) score -= 1;
  else if (atrRatio < 0.6) score += 3;
  else if (atrRatio < 1.5) score += 1;
  else if (atrRatio > 2.5) score -= 3;

  score += getImpulseScore(zone, history, atr);

  if (sweep && zone.direction === 'BULLISH' && sweep === 'BULL') score += 5;
  if (sweep && zone.direction === 'BEARISH' && sweep === 'BEAR') score += 5;

  if (session === 'LONDON' || session === 'NY') score += 3;
  if (session === 'SILVER_BULLET') score += 5;

  const mid = (zone.top + zone.bottom) / 2;
  if (zone.direction === 'BULLISH' && price <= mid) score += 3;
  if (zone.direction === 'BEARISH' && price >= mid) score += 3;

  if (htfData) {
    const configs = HTF_CONFIG[baseTF] || [];
    if (configs.length > 0) {
      const primaryConf = configs[0];
      const hdPrimary = htfData[primaryConf.htf];
      const direction: 'LONG' | 'SHORT' = zone.direction === 'BULLISH' ? 'LONG' : 'SHORT';
      
      // Removed simple bias calculation here, relying on Regime Logic in Scanner
      score += getPremiumDiscountScore(direction, price, primaryConf.htf, htfData, currentTs);

      for (const conf of configs) {
        const hd = htfData[conf.htf];
        if (!hd) continue;
        const idx = getHTFIndex(currentTs, hd.history);
        const htfZone = hd.zones.find((z) =>
            z.type === zone.type && z.direction === zone.direction && z.availableFrom <= idx && idx - z.index <= 8
        );

        if (htfZone) {
          score += conf.boost;
          zone.htfConfirmed = true;
        }
      }
    }
  }

  return score;
};

// ─── TRADE LIFECYCLE (BACKTEST) ───

const checkTradeLifecycle = (
  direction: 'LONG' | 'SHORT',
  signal: ExtendedTradeSetup,
  future: Candle[],
  assetType: AssetType,
  rsiArr: number[],
  adxArr: number[],
  entryIndex: number,
  timeframe: TimeFrame
): { status: TradeStatus; exitPrice: number; exitIndex: number; realizedR: number } => {
  const entry = signal.entry!;
  const sl = signal.stopLoss!;
  const tp = signal.takeProfit!;

  const risk = Math.abs(entry - sl);
  if (risk < 1e-9) {
    return { status: 'EXPIRED', exitPrice: entry, exitIndex: 0, realizedR: 0 };
  }

  let realizedR = 0;
  let exitIndex = future.length ? future.length - 1 : 0;
  let exitPrice = entry;
  let status: TradeStatus = 'EXPIRED';

  const earlyExitBars = EARLY_EXIT_BARS[timeframe] ?? 0;

  for (let i = 0; i < future.length; i++) {
    const c = future[i];
    const high = c.high;
    const low = c.low;
    const close = c.close ?? c.price ?? entry;

    if (direction === 'LONG') {
      if (low <= sl) {
        realizedR = -1;
        status = 'LOST';
        exitPrice = sl;
        exitIndex = i;
        break;
      }
      if (high >= tp) {
        realizedR = (tp - entry) / risk;
        status = 'WON';
        exitPrice = tp;
        exitIndex = i;
        break;
      }
    } else {
      if (high >= sl) {
        realizedR = -1;
        status = 'LOST';
        exitPrice = sl;
        exitIndex = i;
        break;
      }
      if (low <= tp) {
        realizedR = (entry - tp) / risk;
        status = 'WON';
        exitPrice = tp;
        exitIndex = i;
        break;
      }
    }

    const absoluteIndex = entryIndex + i;
    if (earlyExitBars && i >= earlyExitBars) {
      const drift = Math.abs(close - entry) / risk;
      const rsi = rsiArr[absoluteIndex] ?? 50;
      const adx = adxArr[absoluteIndex] ?? 0;
      const regimeFlip = (direction === 'LONG' && rsi < 50) || (direction === 'SHORT' && rsi > 50);
      const trendDied = adx < 12;
      if (drift <= EARLY_EXIT_DRIFT && (regimeFlip || trendDied)) {
        status = 'EXITED';
        exitIndex = i;
        exitPrice = close;
        realizedR = direction === 'LONG' ? (close - entry) / risk : (entry - close) / risk;
        break;
      }
    }

    exitPrice = close;
  }

  if (status === 'EXPIRED') {
      const finalPrice = exitPrice;
      if (direction === 'LONG') {
          realizedR = (finalPrice - entry) / risk;
      } else {
          realizedR = (entry - finalPrice) / risk;
      }
  }

  return { status, exitPrice, exitIndex, realizedR };
};

// ─── LIVE SCANNER ───

export const analyzeMarket = (
  asset: MarketData,
  timeframe: TimeFrame,
  htfDataExternal?: any
): { signals: ExtendedTradeSetup[]; technicals: any } => {
  if (!asset.history || asset.history.length < 200) {
    return { signals: [], technicals: { rsi: null, sma50: 0, atr: 0, adx: 0 } };
  }
  
  const lastCandle = asset.history[asset.history.length - 1];
  // Basic staleness check
  if (lastCandle) {
    const now = Date.now();
    const diff = now - lastCandle.timestamp;
    const tfMinutes: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
    const durationMs = (tfMinutes[timeframe] || 60) * 60 * 1000;
    if (diff > durationMs * 3.5) {
      return { signals: [], technicals: { rsi: null, sma50: 0, atr: 0, adx: 0 } };
    }
  }

  const history = (asset.history as any[]).map((h) => ({
    timestamp: h.timestamp, open: h.open, high: h.high, low: h.low, close: h.close ?? h.price, price: h.price, volume: h.volume
  })) as Candle[];

  const n = history.length;
  const i = n - 1;
  const candle = history[i];
  const price = getPrice(candle);

  const closes = history.map(getPrice);
  const atrArr = calculateATR(history);
  const rsiArr = calculateRSI(closes);
  const sma50Arr = calculateSMA(closes, 50);
  const adxArr = calculateADX(history);

  const atr = atrArr[i] || 1;
  const rsi = rsiArr[i] || 50;
  const sma50 = sma50Arr[i] || 0;
  const adx = adxArr[i] || 0;

  const htfData = prepareHTFData(asset, htfDataExternal);
  const swings = findSwings(history, timeframe);
  const fvgs = detectFVGs(history);
  const obs = detectOrderBlocks(history, swings);
  const brks = detectBreakerBlocks(history, obs);
  const allZones: SmartZone[] = [...fvgs, ...obs, ...brks].sort((a, b) => a.index - b.index);
  const volumeSpikes = history.map((_, idx) => isVolumeSpikeAtIndex(idx, history));
  const sweep = detectLiquiditySweep(history, swings, i);
  const context = computeContext(timeframe, asset, history, htfData, atrArr, rsiArr, adxArr, i, sweep);
  const ttlBars = getZoneTTL(timeframe);

  const signals: ExtendedTradeSetup[] = [];
  applyZoneLifecycle(allZones, history, i, ttlBars);
  const activeZones = allZones.filter((z) => z.active && z.availableFrom <= i);

  for (const zone of activeZones) {
    const inZone = zone.direction === 'BULLISH' ? candle.low <= zone.top && candle.high >= zone.bottom : candle.high >= zone.bottom && candle.low <= zone.top;
    if (!inZone) continue;

    const direction: 'LONG' | 'SHORT' = zone.direction === 'BULLISH' ? 'LONG' : 'SHORT';
    const volumeConfirmed = checkVolumeConfirmation(i, volumeSpikes);
    const mss = isMSS(history, i, direction === 'LONG' ? 'BULL' : 'BEAR');
    if (!passesHardFilters(context, zone, direction, mss, volumeConfirmed, ttlBars, i)) continue;

    const baseScore = calculateScore(zone, sweep, context.session, atr, price, htfData, candle.timestamp, timeframe, history);
    if (baseScore <= 0) continue;

    const finalScore = computeScore(baseScore, context, zone, volumeConfirmed, mss);
    if (finalScore < 70) continue;

    let tradeMode: TradeMode = 'TREND';
    const isAgainstTrend =
      (context.htfTrend.trend === 'BULL' && direction === 'SHORT') ||
      (context.htfTrend.trend === 'BEAR' && direction === 'LONG');
    if (isAgainstTrend) tradeMode = 'REVERSAL';

    const targetRR = getTargetRR(timeframe, context.htfTrend.trend);
    const sl = computeStructuralStop(direction, i, swings, atr, zone);
    const risk = Math.abs(price - sl);
    if (risk < 1e-9) continue;

    const snapped = snapTpToNearestLiquidity(direction, price, sl, targetRR, history, i, swings, timeframe, zone.type, finalScore, context.session, tradeMode);
    const tp = snapped.tp;
    const rrRaw = snapped.rr;

    const rrBounds = getRrBounds(timeframe, direction, asset.type);
    if (rrRaw < rrBounds.min || rrRaw > rrBounds.max) continue;

    let qualityLabel: 'STANDARD' | 'HIGH' | 'ELITE';
    if (finalScore >= 95) qualityLabel = 'ELITE';
    else if (finalScore >= 85) qualityLabel = 'HIGH';
    else qualityLabel = 'STANDARD';
    const quality = qualityLabel as SignalQuality;

    const precision = price < 1 ? 5 : price < 10 ? 4 : 2;
    const rrRounded = Number(rrRaw.toFixed(2));
    const scoreRounded = Number(finalScore.toFixed(1));

    signals.push({
      id: `LIVE-${zone.id}-${candle.timestamp}`,
      symbol: asset.symbol || 'UNKNOWN',
      setupType: `${zone.type}[${context.session}]`,
      direction,
      entry: Number(price.toFixed(precision)),
      stopLoss: Number(sl.toFixed(precision)),
      takeProfit: Number(tp.toFixed(precision)),
      timestamp: candle.timestamp,
      timeframe,
      status: 'PENDING',
      quality,
      rr: rrRounded,
      plannedRR: rrRounded,
      score: scoreRounded,
      zoneId: zone.id,
      session: context.session,
      sweep: context.sweep ?? null,
      tradeMode, // Expose to bot
      regime: context.regime,    // Expose for logs
      qualityLabel
    });
  }

  return { signals: signals.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), technicals: { rsi, sma50, atr, adx } };
};

// ─── BACKTEST (WITH REGIME LOGIC) ───

export const runBacktest = (
  asset: MarketData,
  timeframe: TimeFrame,
  qualityFilter: SignalQuality | 'ALL' = 'ALL',
  useConcurrency: boolean = true
): BacktestResult => {
  const history = (asset.history as any[]).map((h) => ({
    timestamp: h.timestamp, open: h.open, high: h.high, low: h.low, close: h.close ?? h.price, price: h.price, volume: h.volume
  })) as Candle[];

  if (!history || history.length < 350) {
    return { totalTrades: 0, wins: 0, losses: 0, winRate: 0, netPnL: 0, profitFactor: 0, maxDrawdown: 0, trades: [], startDate: 0, endDate: 0, candleCount: 0 };
  }

  const n = history.length;
  const htfData = prepareHTFData(asset);
  const atrArr = calculateATR(history);
  const closes = history.map(getPrice);
  const rsiArr = calculateRSI(closes);
  const adxArr = calculateADX(history);

  const swings = findSwings(history, timeframe);
  const fvgs = detectFVGs(history);
  const obs = detectOrderBlocks(history, swings);
  const brks = detectBreakerBlocks(history, obs);
  const allZones: SmartZone[] = [...fvgs, ...obs, ...brks].sort((a, b) => a.index - b.index);
  const volumeSpikes = history.map((_, idx) => isVolumeSpikeAtIndex(idx, history));

  const ttlBars = getZoneTTL(timeframe);
  const tfConfig = TF_SCORE_CONFIG[timeframe];
  const minScore = tfConfig?.minScore ?? getMinScore(timeframe);

  const trades: ExtendedTradeSetup[] = [];
  
  let equity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let netPnL = 0;
  let grossProfitR = 0;
  let grossLossR = 0;
  
  let lastExitIndex = -1;

  for (let i = 350; i < n - 2; i++) {
    if (useConcurrency && i <= lastExitIndex) continue;

    const triggerIndex = i;
    const entryIndex = i + 1;
    const triggerCandle = history[triggerIndex];
    const entryCandle = history[entryIndex];
    const entryPrice = entryCandle.open ?? getPrice(entryCandle);
    const atr = atrArr[entryIndex] || atrArr[triggerIndex] || 1;
    const sweep = detectLiquiditySweep(history, swings, triggerIndex);
    const context = computeContext(timeframe, asset, history, htfData, atrArr, rsiArr, adxArr, triggerIndex, sweep);

    applyZoneLifecycle(allZones, history, triggerIndex, ttlBars);

    const activeZones = allZones.filter((z) => z.active && z.availableFrom <= triggerIndex);
    if (!activeZones.length) continue;

    const candidates: { zone: SmartZone; finalScore: number; tradeMode: TradeMode }[] = [];

    for (const zone of activeZones) {
      const inZone = zone.direction === 'BULLISH' ? triggerCandle.low <= zone.top && triggerCandle.high >= zone.bottom : triggerCandle.high >= zone.bottom && triggerCandle.low <= zone.top;
      if (!inZone) continue;

      const direction: 'LONG' | 'SHORT' = zone.direction === 'BULLISH' ? 'LONG' : 'SHORT';
      const volumeConfirmed = checkVolumeConfirmation(triggerIndex, volumeSpikes);
      const mss = isMSS(history, triggerIndex, direction === 'LONG' ? 'BULL' : 'BEAR');

      if (!passesHardFilters(context, zone, direction, mss, volumeConfirmed, ttlBars, triggerIndex)) continue;

      const baseScore = calculateScore(zone, sweep, context.session, atr, entryPrice, htfData, triggerCandle.timestamp, timeframe, history);
      if (baseScore <= 0) continue;

      const finalScore = computeScore(baseScore, context, zone, volumeConfirmed, mss);
      if (finalScore < 70) continue;

      let tradeMode: TradeMode = 'TREND';
      const isAgainstTrend =
        (context.htfTrend.trend === 'BULL' && direction === 'SHORT') ||
        (context.htfTrend.trend === 'BEAR' && direction === 'LONG');
      if (isAgainstTrend) tradeMode = 'REVERSAL';

      candidates.push({ zone, finalScore, tradeMode });
    }

    if (!candidates.length) continue;
    candidates.sort((a, b) => b.finalScore - a.finalScore || b.zone.index - a.zone.index);

    for (const { zone, finalScore, tradeMode } of candidates) {
      const direction: 'LONG' | 'SHORT' = zone.direction === 'BULLISH' ? 'LONG' : 'SHORT';
      const targetRR = getTargetRR(timeframe, context.htfTrend.trend);
      const sl = computeStructuralStop(direction, entryIndex, swings, atr, zone);
      const risk = Math.abs(entryPrice - sl);
      if (risk < 1e-9) continue;

      // Pass tradeMode to snapper
      const snapped = snapTpToNearestLiquidity(direction, entryPrice, sl, targetRR, history, entryIndex, swings, timeframe, zone.type, finalScore, context.session, tradeMode);
      const tp = snapped.tp;
      const rrRaw = snapped.rr;

      const rrBounds = getRrBounds(timeframe, direction, asset.type);
      if (rrRaw < rrBounds.min || rrRaw > rrBounds.max) continue;

      let qualityLabel: 'STANDARD' | 'HIGH' | 'ELITE';
      if (finalScore >= 95) qualityLabel = 'ELITE';
      else if (finalScore >= 85) qualityLabel = 'HIGH';
      else qualityLabel = 'STANDARD';
      const quality = qualityLabel as SignalQuality;

      if (qualityFilter !== 'ALL' && quality !== qualityFilter) continue;

      const precision = entryPrice < 1 ? 5 : entryPrice < 10 ? 4 : 2;
      const rrPlanned = Number(rrRaw.toFixed(2));
      const scoreRounded = Number(finalScore.toFixed(1));

      const signal: ExtendedTradeSetup = {
        id: `BT-${zone.id}-${triggerCandle.timestamp}`,
        symbol: asset.symbol || 'UNKNOWN',
        setupType: `${zone.type}[${context.session}]`,
        direction,
        entry: Number(entryPrice.toFixed(precision)),
        stopLoss: Number(sl.toFixed(precision)),
        takeProfit: Number(tp.toFixed(precision)),
        timestamp: entryCandle.timestamp,
        timeframe,
        status: 'PENDING',
        quality,
        qualityLabel,
        rr: rrPlanned,
        plannedRR: rrPlanned,
        score: scoreRounded,
        zoneId: zone.id,
        session: context.session,
        sweep: context.sweep ?? null,
        tradeMode,
        regime: context.regime
      };

      const futureHistory = history.slice(entryIndex);
      if (!futureHistory.length) continue;

      const result = checkTradeLifecycle(direction, signal, futureHistory, asset.type, rsiArr, adxArr, entryIndex, timeframe);

      if (result.status === 'WON' || result.status === 'LOST') {
        const rawR = result.realizedR;
        const slippage = 0.02;
        const fee = 0.04; 
        const tradeR = rawR - (slippage + fee); 

        equity += tradeR;
        if (equity > peakEquity) peakEquity = equity;
        const currentDD = peakEquity - equity;
        if (currentDD > maxDrawdown) maxDrawdown = currentDD;

        if (tradeR > 0) {
          wins++;
          grossProfitR += tradeR;
        } else {
          losses++;
          grossLossR += Math.abs(tradeR);
        }

        netPnL += tradeR;
        
        const realizedRounded = Number(tradeR.toFixed(2));
        const duration = (result.exitIndex + 1); 

        trades.push({
          ...signal,
          status: result.status,
          rr: realizedRounded,
          realizedR: realizedRounded,
          plannedRR: rrPlanned,
          takeProfit: result.status === 'WON' ? result.exitPrice : signal.takeProfit,
          stopLoss: result.status === 'LOST' ? result.exitPrice : signal.stopLoss,
          durationBars: duration,
          exitPrice: result.exitPrice,
          fee,
          slippage
        });

        if (useConcurrency) {
            lastExitIndex = entryIndex + result.exitIndex;
        }
      }
      break; 
    }
  }

  const total = wins + losses;
  const profitFactor = grossLossR === 0 ? (grossProfitR > 0 ? Infinity : 0) : grossProfitR / grossLossR;

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: total ? Number(((wins / total) * 100).toFixed(1)) : 0,
    netPnL: Number(netPnL.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    trades: trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    startDate: history[350].timestamp,
    endDate: history[n-1].timestamp,
    candleCount: n
  };
};
