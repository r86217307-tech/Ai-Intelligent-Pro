export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AnalysisResult {
  asset: string;
  broker: string;
  marketMode: string;
  timeframe: string;
  dataQuality: "GOOD" | "FAIR" | "POOR";
  marketState: "TRENDING_BULLISH" | "TRENDING_BEARISH" | "RANGING" | "CHOPPY" | "TRANSITION" | "UNKNOWN";
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  priceAction: {
    direction: string;
    patterns: string[];
    strength: string;
  };
  structure: {
    direction: string;
    swingHighs: string[];
    swingLows: string[];
    bos: string;
    choch: string;
  };
  liquidity: {
    status: string;
    areas: string[];
    sweep: string;
  };
  otcTrap: {
    status: string;
    type: string;
    evidence: string;
  };
  trapTrigger?: "LIQUIDITY_SWEEP" | "FALSE_BREAKOUT" | "FAILED_BREAKOUT" | "ORDER_BLOCK_REJECTION" | "FVG_REACTION" | "STOP_HUNT_PATTERN" | "NONE";
  smc: {
    orderBlock: string;
    fvg: string;
    displacement: string;
    mitigation: string;
    supplyDemand: string;
  };
  supportResistance: {
    support: string[];
    resistance: string[];
  };
  rangeAnalysis: {
    state: string;
    high: string;
    low: string;
    midpoint: string;
  };
  indicators: string[];
  bullishEvidence: string[];
  bearishEvidence: string[];
  // Phase 12 Structure Refinement
  marketStructure?: "BULLISH" | "BEARISH" | "RANGE" | "TRANSITION" | "UNCLEAR";
  structureConfidence?: number;
  structureEvidence?: string[];
  structureInvalidation?: string;
  confluenceScore: number;
  setupQuality: "A+" | "A" | "B" | "C" | "NO_SETUP" | "N/A";
  signal: "CALL" | "PUT" | "NO_TRADE";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceAvailable: boolean;
  confidencePercent: number | null;
  noTradeReason: "NONE" | "INCOMPLETE_CANDLE" | "WEAK_CONFLUENCE" | "CONFLICTING_SIGNALS" | "TRAP_RISK" | "NO_ENTRY_CONFIRMATION" | "POOR_IMAGE_QUALITY" | "EXTREME_RANGE" | "UNCLEAR_STRUCTURE" | "LIQUIDITY_UNCERTAINTY" | "INSUFFICIENT_DATA";
  contradictions: string[];
  reasoning: string;
  invalidation: string;
  visibleCandleCount: number;
  fullCandles: number;
  partialCandles: number;
  currentCandleStatus: string;
  overallStructure: string;
  recentStructure: string;
  currentPriceLocation: string;
  imageQuality: string;
  visionNotes: string;
  performance?: {
    uploadMs: number;
    imageProcessingMs: number;
    aiAnalysisMs: number;
    decisionMs: number;
    totalMs: number;
    totalSeconds: string;
  };
}

export interface SignalHistory extends AnalysisResult {
  id: string;
  userId: string;
  timestamp: number;
  screenshotUrl: string | null;
  outcome: "WIN" | "LOSS" | "EXPIRED" | "UNKNOWN";
  notes: string;
}

export interface TestRecord extends AnalysisResult {
  id: string;
  userId: string;
  timestamp: number;
  screenshotUrl?: string | null;
  actualResult: "UP" | "DOWN" | "INVALID" | "PENDING";
  testResult: "CORRECT" | "WRONG" | "NO_TRADE" | "INVALID" | "PENDING";
  status: "PENDING" | "COMPLETED" | "INVALID" | "FAILED";
  postTestReview?: string;
}

export interface AppSettings {
  broker: string;
  defaultAsset: string;
  defaultTimeframe: string;
  defaultMode: string;
  riskPerTrade: number;
  maxDailyLoss: number;
  autoAnalysis: boolean;
  premiumAnimation: boolean;
  soundEnabled: boolean;
  saveHistory: boolean;
  resultDisplay: "STANDARD" | "COMPACT";
  testModeDefaultBroker?: string;
  testModeAutoEvaluate?: boolean;
}

export interface ForexNewsItem {
  id: string;
  event: string;
  currency: "USD" | "EUR" | "GBP" | "JPY" | "CAD" | "AUD" | "NZD" | "CHF" | string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  time: string; // ISO string
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit?: string;
  status: "UPCOMING" | "JUST_RELEASED" | "RECENT" | "OLD" | "STALE";
  source?: string;
}

export interface ForexNewsAnalysisResult {
  newsSignal: "CALL" | "PUT" | "NO_TRADE";
  forexPair: string; // e.g. "EUR/USD"
  baseCurrency: string; // e.g. "EUR"
  quoteCurrency: string; // e.g. "USD"
  primaryEvent: ForexNewsItem | null;
  impact: "HIGH" | "MEDIUM" | "LOW" | "EXTREME";
  eventStatus: "UPCOMING" | "JUST_RELEASED" | "RECENT" | "OLD" | "STALE";
  actual: string;
  forecast: string;
  previous: string;
  newsSurprise: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "N/A";
  baseCurrencyBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "CONFLICTED";
  quoteCurrencyBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "CONFLICTED";
  fundamentalBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "CONFLICTED";
  aiPolicyTone?: "HAWKISH" | "DOVISH" | "NEUTRAL" | "UNKNOWN";
  aiConfirmation?: "ALIGNED" | "CONFLICTING" | "UNAVAILABLE";
  aiReasoning?: string;
  eventRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  confidence: number; // 0 - 100
  reason: string;
  keyEvidence: string[];
  invalidation: string;
  dataQuality: "GOOD" | "LIMITED" | "POOR";
  eventsAnalyzed: ForexNewsItem[];
  timestamp: string;
  marketStatus?: {
    isOpen: boolean;
    status: "OPEN" | "CLOSED" | "LIMITED";
    reason: string;
    session: string;
  };
}

export interface NewsSignalHistory {
  id: string;
  userId: string;
  timestamp: number;
  forexPair: string;
  event: string;
  currency: string;
  signal: "CALL" | "PUT" | "NO_TRADE";
  bias: string;
  actual: string;
  forecast: string;
  previous: string;
  confidence: number;
  aiPolicyTone?: string;
  aiConfirmation?: string;
  outcome?: "WIN" | "LOSS" | "EXPIRED" | "UNKNOWN";
  notes?: string;
}
