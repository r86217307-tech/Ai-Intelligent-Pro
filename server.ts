import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI, Type, Schema, ThinkingLevel, LiveServerMessage, Modality } from "@google/genai";
import multer from "multer";
import { WebSocketServer } from "ws";
import { primaryCalendarProvider, analyzeForexPairNews, calculateNewsSurprise, checkRealForexMarketStatus } from "./server/forexNewsEngine";

// Load environment variables from .env file
dotenv.config();

// Process-level safety
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server Process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Server Process] Uncaught Exception:", error);
});

// Initialize Gen AI SDK
let ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set.");
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

// Fast In-Memory Request Cache and In-Flight Request Lock
interface CachedAnalysis {
  timestamp: number;
  data: any;
}
const analysisCache = new Map<string, CachedAnalysis>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function cleanStaleCache() {
  const now = Date.now();
  for (const [key, item] of analysisCache.entries()) {
    if (now - item.timestamp > CACHE_TTL_MS) {
      analysisCache.delete(key);
    }
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Production state flag for graceful shutdown
let isShuttingDown = false;

// 1. Security Headers & Sensitive File Path Guard
app.use((req, res, next) => {
  // Reject incoming traffic during shutdown
  if (isShuttingDown) {
    res.setHeader("Connection", "close");
    return res.status(503).json({
      success: false,
      error: "SERVER_SHUTTING_DOWN",
      message: "Server is undergoing graceful shutdown. Please retry shortly."
    });
  }

  // Security Headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "display-capture=*, microphone=*");

  // Prevent path traversal and sensitive file access (.env, .git, config files, hidden files)
  const decodedPath = decodeURIComponent(req.path).toLowerCase();
  
  // Allow Vite internal dev assets and legitimate static routes
  const isViteDevRoute = req.path.startsWith('/@') || req.path.startsWith('/src') || req.path.startsWith('/node_modules') || req.path.startsWith('/public');
  
  if (!isViteDevRoute) {
    if (
      decodedPath.includes("/.env") ||
      decodedPath.endsWith(".env") ||
      decodedPath.includes("/.git") ||
      decodedPath.includes("server.ts") ||
      decodedPath.includes("server.cjs") ||
      (decodedPath.includes("..") && !decodedPath.includes("/@fs/"))
    ) {
      return res.status(403).json({
        success: false,
        error: "ACCESS_FORBIDDEN",
        message: "Access to private system resources is restricted."
      });
    }
  }

  // Safe CORS handling
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "15mb" }));

// 2. Health Check Endpoints (Cloud Run Liveness & Readiness Probes)
const healthHandler = (req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: isShuttingDown ? "shutting_down" : "healthy",
    service: "sufia-ai-backend",
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    version: "1.0.0",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
};

app.get("/api/health", healthHandler);
app.get("/health", healthHandler);

// In-memory cooldown tracking for models that hit rate/quota limits
const modelCooldownMap = new Map<string, number>();

// Helper to determine if an error is a transient candidate for a single retry
function isTransientError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.statusCode || err.code;
  const msg = String(err.message || "").toLowerCase();
  
  // Quota exhaustion or 404 or local timeout should failover to next model immediately without retrying the same model
  if (
    msg.includes("quota") || 
    msg.includes("resource_exhausted") || 
    msg.includes("free_tier_requests") || 
    msg.includes("timeout_") ||
    status === 404
  ) {
    return false;
  }
  
  if (status === 429 || status === 503 || status === 504 || status === 502) return true;
  if (msg.includes("rate limit") || msg.includes("too many requests")) return true;
  if (msg.includes("503") || msg.includes("service unavailable") || msg.includes("temporarily unavailable")) return true;
  if (msg.includes("504") || msg.includes("gateway timeout") || msg.includes("deadline exceeded")) return true;
  if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("network error") || msg.includes("socket hang up")) return true;
  
  return false;
}

// Structure definition for AI response
const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    asset: { type: Type.STRING },
    broker: { type: Type.STRING },
    marketMode: { type: Type.STRING },
    timeframe: { type: Type.STRING },
    dataQuality: { type: Type.STRING, enum: ["GOOD", "FAIR", "POOR"] },
    marketState: { type: Type.STRING, enum: ["TRENDING_BULLISH", "TRENDING_BEARISH", "RANGING", "CHOPPY", "TRANSITION", "UNKNOWN"] },
    bias: { type: Type.STRING, enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
    priceAction: {
      type: Type.OBJECT,
      properties: {
        direction: { type: Type.STRING },
        patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
        strength: { type: Type.STRING }
      },
      required: ["direction", "patterns", "strength"]
    },
    structure: {
      type: Type.OBJECT,
      properties: {
        direction: { type: Type.STRING },
        swingHighs: { type: Type.ARRAY, items: { type: Type.STRING } },
        swingLows: { type: Type.ARRAY, items: { type: Type.STRING } },
        bos: { type: Type.STRING },
        choch: { type: Type.STRING }
      },
      required: ["direction", "swingHighs", "swingLows", "bos", "choch"]
    },
    liquidity: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        areas: { type: Type.ARRAY, items: { type: Type.STRING } },
        sweep: { type: Type.STRING }
      },
      required: ["status", "areas", "sweep"]
    },
    otcTrap: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        type: { type: Type.STRING },
        evidence: { type: Type.STRING }
      },
      required: ["status", "type", "evidence"]
    },
    trapTrigger: {
      type: Type.STRING,
      enum: [
        "LIQUIDITY_SWEEP",
        "FALSE_BREAKOUT",
        "FAILED_BREAKOUT",
        "ORDER_BLOCK_REJECTION",
        "FVG_REACTION",
        "STOP_HUNT_PATTERN",
        "NONE"
      ]
    },
    smc: {
      type: Type.OBJECT,
      properties: {
        orderBlock: { type: Type.STRING },
        fvg: { type: Type.STRING },
        displacement: { type: Type.STRING },
        mitigation: { type: Type.STRING },
        supplyDemand: { type: Type.STRING }
      },
      required: ["orderBlock", "fvg", "displacement", "mitigation", "supplyDemand"]
    },
    supportResistance: {
      type: Type.OBJECT,
      properties: {
        support: { type: Type.ARRAY, items: { type: Type.STRING } },
        resistance: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["support", "resistance"]
    },
    rangeAnalysis: {
      type: Type.OBJECT,
      properties: {
        state: { type: Type.STRING },
        high: { type: Type.STRING },
        low: { type: Type.STRING },
        midpoint: { type: Type.STRING }
      },
      required: ["state", "high", "low", "midpoint"]
    },
    indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
    bullishEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    bearishEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    marketStructure: { type: Type.STRING, enum: ["BULLISH", "BEARISH", "RANGE", "TRANSITION", "UNCLEAR"] },
    structureConfidence: { type: Type.INTEGER },
    structureEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
    structureInvalidation: { type: Type.STRING },
    contradictions: { type: Type.ARRAY, items: { type: Type.STRING } },
    confluenceScore: { type: Type.INTEGER },
    setupQuality: { type: Type.STRING, enum: ["A+", "A", "B", "C", "NO_SETUP", "N/A"] },
    signal: { type: Type.STRING, enum: ["CALL", "PUT", "NO_TRADE"] },
    confidence: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
    confidenceAvailable: { type: Type.BOOLEAN },
    confidencePercent: { type: Type.INTEGER },
    noTradeReason: {
      type: Type.STRING,
      enum: [
        "NONE",
        "INCOMPLETE_CANDLE",
        "WEAK_CONFLUENCE",
        "CONFLICTING_SIGNALS",
        "TRAP_RISK",
        "NO_ENTRY_CONFIRMATION",
        "POOR_IMAGE_QUALITY",
        "EXTREME_RANGE",
        "UNCLEAR_STRUCTURE",
        "LIQUIDITY_UNCERTAINTY",
        "INSUFFICIENT_DATA"
      ]
    },
    reasoning: { type: Type.STRING },
    invalidation: { type: Type.STRING },
    visibleCandleCount: { type: Type.INTEGER },
    fullCandles: { type: Type.INTEGER },
    partialCandles: { type: Type.INTEGER },
    currentCandleStatus: { type: Type.STRING },
    overallStructure: { type: Type.STRING },
    recentStructure: { type: Type.STRING },
    currentPriceLocation: { type: Type.STRING },
    imageQuality: { type: Type.STRING, enum: ["GOOD", "FAIR", "POOR"] },
    visionNotes: { type: Type.STRING }
  },
  required: [
    "asset", "broker", "marketMode", "timeframe", "dataQuality", 
    "marketState", "bias", "priceAction", "structure", "liquidity", "otcTrap", "trapTrigger", "smc", 
    "supportResistance", "rangeAnalysis", "indicators", "bullishEvidence",
    "bearishEvidence", "marketStructure", "structureConfidence", "structureEvidence", "structureInvalidation", "contradictions", "confluenceScore", "setupQuality", "signal", "confidence", 
    "confidenceAvailable", "confidencePercent", "noTradeReason",
    "reasoning", "invalidation", "visibleCandleCount", "fullCandles", 
    "partialCandles", "currentCandleStatus", "overallStructure", 
    "recentStructure", "currentPriceLocation", "imageQuality", "visionNotes"
  ]
};

// In-memory rate limiting map
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 25; // 25 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRequestCounts.get(ip);
  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  record.count++;
  return true;
}

app.post("/api/analyze-chart", upload.single("image"), async (req, res) => {
  const perfStart = performance.now();
  let imageProcessingMs = 0;
  let aiAnalysisMs = 0;
  let decisionMs = 0;

  try {
    // 0. RATE LIMIT CHECK
    const clientIp = Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : (req.headers["x-forwarded-for"] || req.ip || "127.0.0.1");

    if (!checkRateLimit(String(clientIp))) {
      return res.status(429).json({
        success: false,
        errorType: "RATE_LIMIT_EXCEEDED",
        error: "Analysis rate limit reached. Please wait a moment before sending another request.",
        message: "Analysis rate limit reached. Please wait a moment before sending another request."
      });
    }

    // STAGE A — FAST VALIDATION & IMAGE CHECKS
    let imageBuffer: Buffer | null = null;
    let mimeType = "image/jpeg";

    if (req.file && req.file.buffer && req.file.buffer.length >= 100) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype || "image/jpeg";
    } else if (req.body && req.body.imageBase64 && typeof req.body.imageBase64 === "string") {
      const base64Clean = req.body.imageBase64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, "");
      imageBuffer = Buffer.from(base64Clean, "base64");
      mimeType = req.body.mimeType || "image/jpeg";
    }

    if (!imageBuffer || imageBuffer.length < 100) {
      return res.status(400).json({ 
        success: false, 
        errorType: "INVALID_REQUEST", 
        error: "No valid image provided. Please upload a clear chart screenshot." 
      });
    }

    // Validate MIME type
    if (!mimeType.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        errorType: "INVALID_IMAGE_TYPE",
        error: "Unsupported file type. Please upload a valid image (JPEG, PNG, WEBP)."
      });
    }

    // Max file size check (10MB)
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        errorType: "IMAGE_TOO_LARGE",
        error: "Image file size exceeds 10MB limit. Please upload a smaller screenshot."
      });
    }

    const broker = String(req.body.broker || "Pocket Option").slice(0, 50);
    const marketMode = String(req.body.marketMode || req.body.mode || "Trap Detection").slice(0, 50);
    const asset = String(req.body.asset || "USD/MXN (OTC)").slice(0, 50);
    const timeframe = String(req.body.timeframe || "1M").slice(0, 20);
    
    // Clean stale cache entries
    cleanStaleCache();

    // Fast Cache Check & In-Flight Lock Key
    const requestHash = crypto
      .createHash("sha256")
      .update(imageBuffer)
      .update(`${broker}_${marketMode}_${asset}_${timeframe}`)
      .digest("hex");

    // 1. Return cached result if available and fresh
    const cached = analysisCache.get(requestHash);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      const totalMs = Math.round(performance.now() - perfStart);
      const cachedData = {
        ...cached.data,
        performance: {
          uploadMs: 0,
          imageProcessingMs: 1,
          aiAnalysisMs: 0,
          decisionMs: 1,
          totalMs: totalMs,
          totalSeconds: (totalMs / 1000).toFixed(1) + "s"
        }
      };
      console.log(`[ANALYSIS] Cache Hit for hash ${requestHash.slice(0, 8)} (${totalMs}ms)`);
      return res.json(cachedData);
    }

    // 2. In-flight Request Deduplication: If already processing this exact image/context, await existing promise
    if (inFlightRequests.has(requestHash)) {
      console.log(`[ANALYSIS] Awaiting existing in-flight request for hash ${requestHash.slice(0, 8)}`);
      try {
        const inFlightResult = await inFlightRequests.get(requestHash);
        return res.json(inFlightResult);
      } catch (err: any) {
        return res.status(500).json({
          success: false,
          errorType: "ANALYSIS_ERROR",
          error: err.message || "Analysis failed"
        });
      }
    }

    // Wrap execution in a deduplication promise
    const executionPromise = (async () => {
      const tPrepStart = performance.now();
      const base64Data = imageBuffer.toString("base64");
      const tPrepEnd = performance.now();
      imageProcessingMs = Math.max(1, Math.round(tPrepEnd - tPrepStart));

      const aiClient = getAI();

      // PHASE 12 AUDITED SYSTEM INSTRUCTION — MARKET STRUCTURE DETECTION REFINEMENT
      const systemInstruction = `You are an expert OTC trading chart analyst operating with the PHASE 12 FAST SIGNAL DECISION & STRUCTURE ENGINE.
Perform a rigorous, FAST SINGLE-PASS vision analysis of this 1-minute OTC trading chart screenshot.

User context: Broker: ${broker} | Mode: ${marketMode} | Asset: ${asset} | Timeframe: ${timeframe}

==================================================
PHASE 12 MARKET STRUCTURE DETECTION & DECISION RULES:
==================================================
0. ASSET & TIMEFRAME DETECTION (CRITICAL):
- Ignore the User context asset if you can clearly read a different asset name or pair in the chart image (e.g., top-left corner, CAD/JPY, EUR/USD, BTC/USD, etc.).
- The extracted asset must reflect the exact pair written on the chart (including "OTC" if visible).

1. SYSTEMATIC VISIBLE STRUCTURE EVALUATION (DO NOT MARK UNCLEAR TOO EASILY):
- The screenshot may contain 30+ visible candles, but only a portion of those candles may be useful for current structure.
- Do NOT return UNCLEAR or UNCLEAR_STRUCTURE simply because the chart is not textbook clean.
- Systematically evaluate:
  1. Recent swing highs & swing lows
  2. Higher High / Higher Low sequence (BULLISH)
  3. Lower High / Lower Low sequence (BEARISH)
  4. Break of Structure (BOS) & Change of Character (CHOCH)
  5. Recent displacement & momentum
  6. Liquidity sweeps & range boundaries
- STRUCTURE HIERARCHY: RECENT STRUCTURE (last 8-15 candles) > SHORT-TERM STRUCTURE > OLDER STRUCTURE. Older candles provide macro context but do not override clear recent structure.

2. STRUCTURE CLASSIFICATION & MINIMUM EVIDENCE:
- If enough visible swing information exists to establish directional structure, classify it:
  * "BULLISH": Consistent Higher Highs and Higher Lows, or confirmed bullish CHOCH/BOS.
  * "BEARISH": Consistent Lower Highs and Lower Lows, or confirmed bearish CHOCH/BOS.
  * "RANGE": Price oscillating between identifiable support and resistance without confirmed directional breakout. (Do NOT call RANGE "UNCLEAR").
  * "TRANSITION": Price recently shifted character (e.g., from bullish to bearish or vice versa) with early change in swing points, but full trend confirmation is incomplete. (Do NOT call TRANSITION "UNCLEAR").
  * "UNCLEAR": ONLY when available chart genuinely lacks enough visible candles, resolution is broken, or price is completely erratic with no identifiable swings. ("UNCLEAR" means genuinely insufficient data, NOT that the AI is not 100% certain).

3. BOS / CHOCH vs LIQUIDITY SWEEPS:
- Do NOT claim BOS or CHOCH from a single candle wick or spike alone.
- If a break is weak, ambiguous, or only a wick rejection: describe as "POSSIBLE_BOS" / "POSSIBLE_CHOCH" or evaluate as LIQUIDITY SWEEP.
- For liquidity sweeps: check previous swing + break/wick + rejection + subsequent displacement before concluding BOS.

4. CURRENT CANDLE vs STRUCTURE:
- The current rightmost candle may be incomplete/forming.
- Never use an incomplete candle as a completed structural pivot.
- However, completed prior candles MUST still be analyzed to classify marketStructure.
- An incomplete candle NEVER makes structure "UNCLEAR". It only affects trade entry trigger (entryConfirmation / INCOMPLETE_CANDLE).

5. SEPARATE MARKET STRUCTURE FROM TRADE ENTRY:
- marketStructure ("BULLISH" | "BEARISH" | "RANGE" | "TRANSITION" | "UNCLEAR")
- structureConfidence (0-100 integer representing structural clarity, NOT trade confidence)
- structureEvidence: list of 2-4 concrete visual structural observations (e.g., "Lower High sequence", "Lower Low formation", "Bearish displacement")
- structureInvalidation: exact condition where current structure is invalidated (e.g., "Price closes above recent protected swing high")
- CRITICAL: A chart can have BEARISH structure with structureConfidence: 84, yet signal: "NO_TRADE" if entry trigger or confirmation is missing. Never conflate missing entry with unclear structure!

6. TRAP DETECTION & OTC REGIME:
- If marketMode is "Trap Detection" or an OTC trap pattern is recognized, identify trapTrigger:
  "LIQUIDITY_SWEEP" | "FALSE_BREAKOUT" | "FAILED_BREAKOUT" | "ORDER_BLOCK_REJECTION" | "FVG_REACTION" | "STOP_HUNT_PATTERN" | "NONE".
- If trap risk threatens entry: signal: "NO_TRADE", noTradeReason: "TRAP_RISK".

7. SETUP QUALITY & NO-TRADE REASONS:
- setupQuality: "A+" | "A" | "B" | "C" | "NO_SETUP" | "N/A".
  * A+: Confluence >= 8, zero contradictions, pristine structure & entry trigger -> CALL or PUT.
  * A: Confluence >= 7, zero or minor contradiction, clear entry trigger -> CALL or PUT.
  * B: Confluence 5-6 -> NO_TRADE (WEAK_CONFLUENCE or NO_ENTRY_CONFIRMATION).
  * C: Confluence < 5 or multiple contradictions -> NO_TRADE (WEAK_CONFLUENCE or CONFLICTING_SIGNALS).
  * NO_SETUP / N/A: Mid-range chop / poor quality -> NO_TRADE.
- noTradeReason:
  * If signal is "NO_TRADE": MUST be one of ["INCOMPLETE_CANDLE", "WEAK_CONFLUENCE", "CONFLICTING_SIGNALS", "TRAP_RISK", "NO_ENTRY_CONFIRMATION", "POOR_IMAGE_QUALITY", "EXTREME_RANGE", "UNCLEAR_STRUCTURE", "LIQUIDITY_UNCERTAINTY", "INSUFFICIENT_DATA"]. Never "NONE".
  * If signal is "CALL" or "PUT": MUST be "NONE".

8. CONFIDENCE:
- If signal is "NO_TRADE": confidenceAvailable: false, confidencePercent: 0, confidence: "LOW".
- If signal is "CALL" or "PUT": confidenceAvailable: true, confidencePercent: 78 to 95, confidence: "HIGH" | "MEDIUM".

9. OUTPUT FORMAT:
- reasoning: 1-2 concise, punchy sentences (under 25 words).
- invalidation: 1 short sentence (under 15 words).
- Return valid JSON matching schema strictly.`;

      const parts = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        { text: "Execute Phase 11 fast chart vision analysis." },
      ];

      const tAiStart = performance.now();
      
      // Fast Model Pipeline: Prioritize available environment model with zero-thinking ultra-fast vision
      const modelsToTry: { name: string; timeoutMs: number; zeroThinking?: boolean; thinkingLevel?: any }[] = [
        { name: "gemini-3.7-flash", timeoutMs: 10000, zeroThinking: true },
        { name: "gemini-flash-latest", timeoutMs: 10000, zeroThinking: true },
        { name: "gemini-3.1-flash-lite", timeoutMs: 10000, zeroThinking: true },
      ];
      
      let rawResponseText = "";
      let lastError: any = null;
      let modelUsed = "";
      let retryCount = 0;
      const now = Date.now();
      let minRetrySeconds = 10;

      for (const modelItem of modelsToTry) {
        const modelName = modelItem.name;
        
        // If this model is in active quota/rate-limit cooldown, skip it immediately to avoid wasting time
        const cooldownUntil = modelCooldownMap.get(modelName) || 0;
        if (cooldownUntil > now) {
          const remainingSec = Math.ceil((cooldownUntil - now) / 1000);
          console.log(`[ANALYSIS] Skipping ${modelName} (in cooldown for another ${remainingSec}s)`);
          if (remainingSec < minRetrySeconds) minRetrySeconds = remainingSec;
          continue;
        }

        let attempt = 0;
        const maxAttemptsForModel = 2; // Initial attempt + maximum 1 retry for transient failure

        while (attempt < maxAttemptsForModel) {
          attempt++;
          if (attempt > 1) {
            retryCount++;
            console.log(`[ANALYSIS] Retrying model ${modelName} after transient failure (attempt ${attempt})...`);
            // Short exponential backoff
            await new Promise(r => setTimeout(r, 1200));
          }

          try {
            const config: any = {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: 0.1,
            };

            if (modelItem.zeroThinking) {
              config.thinkingConfig = { thinkingBudget: 0 };
            } else if (modelItem.thinkingLevel) {
              config.thinkingConfig = { thinkingLevel: modelItem.thinkingLevel };
            }

            const modelTimeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`TIMEOUT_${modelName}`)), modelItem.timeoutMs)
            );

            const aiCallPromise = aiClient.models.generateContent({
              model: modelName,
              contents: [{ role: "user", parts: parts }],
              config: config,
            });

            const response: any = await Promise.race([aiCallPromise, modelTimeoutPromise]);

            if (response && response.text) {
              rawResponseText = response.text;
              modelUsed = modelName;
              // Clear cooldown on success
              modelCooldownMap.delete(modelName);
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errMsg = String(err?.message || "").toLowerCase();
            console.warn(`[ANALYSIS] Model ${modelName} attempt ${attempt} failed: ${err?.message || err}`);

            // If 404 (model not found/deprecated), mark indefinitely cooled down so we don't try again
            if (err?.status === 404 || errMsg.includes("not found") || errMsg.includes("not available")) {
              modelCooldownMap.set(modelName, Date.now() + 86400000);
              break;
            }

            // If quota or rate limit exceeded, parse exact retry delay and place model in cooldown
            if (errMsg.includes("quota") || errMsg.includes("resource_exhausted") || errMsg.includes("free_tier_requests") || err?.status === 429) {
              let cooldownSec = 10;
              const match = errMsg.match(/retry in ([0-9.]+)s/i);
              if (match && match[1]) {
                cooldownSec = Math.ceil(parseFloat(match[1])) + 1;
              } else if (err?.details?.[0]?.retryDelay) {
                const parsed = parseInt(err.details[0].retryDelay);
                if (!isNaN(parsed)) cooldownSec = parsed + 1;
              }
              if (cooldownSec < minRetrySeconds) minRetrySeconds = cooldownSec;
              modelCooldownMap.set(modelName, Date.now() + cooldownSec * 1000);
              console.log(`[ANALYSIS] Marked ${modelName} in cooldown for ${cooldownSec}s due to quota exhaustion.`);
              break;
            }

            // Only retry if it is a transient error (503, 504, timeout, network error).
            if (!isTransientError(err)) {
              break;
            }
          }
        }

        if (rawResponseText) break;
      }

      const tAiEnd = performance.now();
      aiAnalysisMs = Math.round(tAiEnd - tAiStart);

      if (!rawResponseText) {
        const errorMsg = String(lastError?.message || "");
        if (errorMsg.includes("TIMEOUT") || errorMsg.includes("timed out")) {
          const timeoutErr: any = new Error("Analysis service timed out. Please retry with a clear chart screenshot.");
          timeoutErr.errorType = "UPSTREAM_TIMEOUT";
          timeoutErr.status = 504;
          throw timeoutErr;
        }

        if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("rate-limits")) {
          const quotaErr: any = new Error(`AI analysis rate limit reached on Free Tier. Please wait ${minRetrySeconds} seconds and tap TRY AGAIN.`);
          quotaErr.errorType = "QUOTA_EXCEEDED";
          quotaErr.status = 429;
          quotaErr.retryDelaySeconds = minRetrySeconds;
          throw quotaErr;
        }

        const generalErr: any = lastError || new Error("Failed to obtain response from AI vision engine");
        generalErr.errorType = isTransientError(lastError) ? "UPSTREAM_SERVICE_BUSY" : "AI_ENGINE_ERROR";
        generalErr.status = lastError?.status || 500;
        throw generalErr;
      }

      // STAGE D — PHASE 11 DETERMINISTIC VALIDATION & CONSISTENCY ENFORCEMENT
      const tDecStart = performance.now();

      // HTML Safety check before parsing
      const trimmedResponse = rawResponseText.trim();
      if (
        trimmedResponse.startsWith("<!DOCTYPE") || 
        trimmedResponse.startsWith("<html") || 
        trimmedResponse.startsWith("<head") ||
        trimmedResponse.includes("<body")
      ) {
        const htmlErr: any = new Error("Upstream service returned HTML instead of structured JSON.");
        htmlErr.errorType = "UPSTREAM_HTML_ERROR";
        htmlErr.status = 502;
        throw htmlErr;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(rawResponseText);
      } catch (parseErr) {
        const malformedErr: any = new Error("The AI response was malformed. Please retry.");
        malformedErr.errorType = "MALFORMED_AI_RESPONSE";
        malformedErr.status = 502;
        throw malformedErr;
      }

      // Semantic check: Signal must be strictly valid
      if (!parsedData.signal || !["CALL", "PUT", "NO_TRADE"].includes(parsedData.signal)) {
        parsedData.signal = "NO_TRADE";
        parsedData.noTradeReason = "UNCLEAR_STRUCTURE";
      }

      // 1. Image & Data Quality Fail-safes
      if (parsedData.dataQuality === "POOR" || parsedData.imageQuality === "POOR") {
        parsedData.signal = "NO_TRADE";
        parsedData.bias = parsedData.bias || "NEUTRAL";
        parsedData.setupQuality = "NO_SETUP";
        parsedData.noTradeReason = "POOR_IMAGE_QUALITY";
        parsedData.confidenceAvailable = false;
        parsedData.confidencePercent = null;
        parsedData.confidence = "LOW";
      }

      // 2. Normalize and clamp Confluence Score (0 to 10)
      if (typeof parsedData.confluenceScore === "number") {
        parsedData.confluenceScore = Math.max(0, Math.min(10, Math.round(parsedData.confluenceScore)));
      } else {
        parsedData.confluenceScore = parsedData.signal === "NO_TRADE" ? 4 : 8;
      }

      // 3. Ensure Bias is strictly separated and valid
      if (!["BULLISH", "BEARISH", "NEUTRAL"].includes(parsedData.bias)) {
        if (parsedData.marketState === "TRENDING_BULLISH" || parsedData.structure?.direction === "BULLISH") {
          parsedData.bias = "BULLISH";
        } else if (parsedData.marketState === "TRENDING_BEARISH" || parsedData.structure?.direction === "BEARISH") {
          parsedData.bias = "BEARISH";
        } else {
          parsedData.bias = "NEUTRAL";
        }
      }

      // 4. Validate & Normalize Market Structure
      if (!parsedData.marketStructure || !["BULLISH", "BEARISH", "RANGE", "TRANSITION", "UNCLEAR"].includes(parsedData.marketStructure)) {
        if (parsedData.marketState === "TRENDING_BULLISH" || parsedData.structure?.direction === "BULLISH") {
          parsedData.marketStructure = "BULLISH";
        } else if (parsedData.marketState === "TRENDING_BEARISH" || parsedData.structure?.direction === "BEARISH") {
          parsedData.marketStructure = "BEARISH";
        } else if (parsedData.marketState === "RANGING") {
          parsedData.marketStructure = "RANGE";
        } else if (parsedData.marketState === "TRANSITION") {
          parsedData.marketStructure = "TRANSITION";
        } else {
          parsedData.marketStructure = "UNCLEAR";
        }
      }

      // 5. Strict Signal Consistency & Directional Alignment Checks
      if (parsedData.signal === "CALL" && (parsedData.bias === "BEARISH" || parsedData.marketStructure === "BEARISH")) {
        parsedData.signal = "NO_TRADE";
        parsedData.noTradeReason = "CONFLICTING_SIGNALS";
      } else if (parsedData.signal === "PUT" && (parsedData.bias === "BULLISH" || parsedData.marketStructure === "BULLISH")) {
        parsedData.signal = "NO_TRADE";
        parsedData.noTradeReason = "CONFLICTING_SIGNALS";
      }

      // Confluence threshold check: minimum 7 confluence required for directional signal
      if ((parsedData.signal === "CALL" || parsedData.signal === "PUT") && parsedData.confluenceScore < 7) {
        parsedData.signal = "NO_TRADE";
        parsedData.noTradeReason = "WEAK_CONFLUENCE";
      }

      // Contradictions Filter: Multiple contradictions force NO_TRADE
      if (Array.isArray(parsedData.contradictions) && parsedData.contradictions.length >= 2) {
        parsedData.signal = "NO_TRADE";
        parsedData.setupQuality = parsedData.setupQuality === "A+" || parsedData.setupQuality === "A" ? "B" : parsedData.setupQuality;
        parsedData.noTradeReason = "CONFLICTING_SIGNALS";
      }

      // Enforce Setup Quality Thresholds deterministically (Grade A+ and A are ONLY allowed triggers for CALL/PUT)
      if (parsedData.setupQuality !== "A+" && parsedData.setupQuality !== "A") {
        parsedData.signal = "NO_TRADE";
      }

      // 6. Semantic Validation for NO_TRADE vs Directional CALL/PUT
      if (parsedData.signal === "NO_TRADE") {
        parsedData.confidenceAvailable = false;
        parsedData.confidencePercent = null;
        parsedData.confidence = "LOW";

        const validNoTradeReasons = [
          "INCOMPLETE_CANDLE",
          "WEAK_CONFLUENCE",
          "CONFLICTING_SIGNALS",
          "TRAP_RISK",
          "NO_ENTRY_CONFIRMATION",
          "POOR_IMAGE_QUALITY",
          "EXTREME_RANGE",
          "UNCLEAR_STRUCTURE",
          "LIQUIDITY_UNCERTAINTY",
          "INSUFFICIENT_DATA"
        ];

        if (!parsedData.noTradeReason || !validNoTradeReasons.includes(parsedData.noTradeReason)) {
          const candleStatusLower = (parsedData.currentCandleStatus || "").toLowerCase();
          if (candleStatusLower.includes("forming") || candleStatusLower.includes("incomplete") || candleStatusLower.includes("unclosed")) {
            parsedData.noTradeReason = "INCOMPLETE_CANDLE";
          } else if (parsedData.contradictions && parsedData.contradictions.length > 0) {
            parsedData.noTradeReason = "CONFLICTING_SIGNALS";
          } else if (parsedData.otcTrap && (parsedData.otcTrap.status?.toUpperCase().includes("TRAP") || parsedData.otcTrap.type?.toUpperCase().includes("TRAP"))) {
            parsedData.noTradeReason = "TRAP_RISK";
          } else if (parsedData.rangeAnalysis?.state === "MIDPOINT_CHOP" || parsedData.marketState === "CHOPPY") {
            parsedData.noTradeReason = "EXTREME_RANGE";
          } else if (parsedData.confluenceScore < 7) {
            parsedData.noTradeReason = "WEAK_CONFLUENCE";
          } else {
            parsedData.noTradeReason = "NO_ENTRY_CONFIRMATION";
          }
        }
      } else {
        // Valid CALL or PUT signal
        parsedData.noTradeReason = "NONE";
        parsedData.confidenceAvailable = true;
        
        if (parsedData.setupQuality === "A+") {
          parsedData.confidence = "HIGH";
          parsedData.confidencePercent = Math.min(95, Math.max(86, 78 + parsedData.confluenceScore * 1.7));
        } else {
          parsedData.confidence = "MEDIUM";
          parsedData.confidencePercent = Math.min(85, Math.max(74, 66 + parsedData.confluenceScore * 1.5));
        }
        parsedData.confidencePercent = Math.round(parsedData.confidencePercent);
      }

      if (typeof parsedData.structureConfidence === "number") {
        parsedData.structureConfidence = Math.max(0, Math.min(100, Math.round(parsedData.structureConfidence)));
      } else {
        parsedData.structureConfidence = parsedData.marketStructure === "UNCLEAR" ? 35 : (parsedData.marketStructure === "TRANSITION" ? 65 : 82);
      }

      if (!Array.isArray(parsedData.structureEvidence) || parsedData.structureEvidence.length === 0) {
        parsedData.structureEvidence = [
          `${parsedData.marketStructure} structure identified`,
          parsedData.structure?.bos ? `BOS: ${parsedData.structure.bos}` : "Visible swing point interaction",
          parsedData.structure?.choch ? `CHOCH: ${parsedData.structure.choch}` : "Price action confirmation"
        ];
      }

      if (!parsedData.structureInvalidation) {
        parsedData.structureInvalidation = parsedData.invalidation || "Reclaiming recent opposing swing structure";
      }

      // 8. Ensure Trap Trigger is formatted
      if (!parsedData.trapTrigger) {
        parsedData.trapTrigger = parsedData.otcTrap?.type?.includes("SWEEP") ? "LIQUIDITY_SWEEP" : "NONE";
      }

      // Ensure fallback fields exist
      parsedData.asset = parsedData.asset || asset;
      parsedData.broker = parsedData.broker || broker;
      parsedData.marketMode = parsedData.marketMode || marketMode;
      parsedData.timeframe = parsedData.timeframe || timeframe;

      const tDecEnd = performance.now();
      decisionMs = Math.max(1, Math.round(tDecEnd - tDecStart));

      const totalMs = Math.round(performance.now() - perfStart);
      const totalSeconds = (totalMs / 1000).toFixed(1) + "s";

      parsedData.performance = {
        uploadMs: 0,
        imageProcessingMs,
        aiAnalysisMs,
        decisionMs,
        totalMs,
        totalSeconds,
        modelUsed,
        retryCount
      };

      console.log(`[ANALYSIS SUCCESS] Model: ${modelUsed} | Signal: ${parsedData.signal} | Bias: ${parsedData.bias} | Total: ${totalMs}ms | Retries: ${retryCount}`);

      // Store in cache
      analysisCache.set(requestHash, {
        timestamp: Date.now(),
        data: parsedData,
      });

      return parsedData;
    })();

    // Store in-flight promise to deduplicate simultaneous requests
    inFlightRequests.set(requestHash, executionPromise);

    try {
      const finalResult = await executionPromise;
      return res.json(finalResult);
    } finally {
      inFlightRequests.delete(requestHash);
    }

  } catch (error: any) {
    const errorType = error.errorType || (error.message?.includes("TIMEOUT") ? "UPSTREAM_TIMEOUT" : "SERVER_ERROR");
    const statusCode = error.status || (errorType === "UPSTREAM_TIMEOUT" ? 504 : 500);

    console.error(`[ANALYSIS ERROR] Type: ${errorType} | Status: ${statusCode} | Message: ${error.message}`);
    
    return res.status(statusCode).json({
      success: false,
      errorType: errorType,
      error: error.message || "Failed to analyze chart",
      message: error.message || "Failed to complete chart analysis"
    });
  }
});

// ==========================================
// REAL FOREX HIGH-IMPACT NEWS SIGNAL ENDPOINTS
// ==========================================

// 1. Get Live Economic Calendar
app.get("/api/forex-news/calendar", async (req, res) => {
  try {
    const marketStatus = checkRealForexMarketStatus();
    const events = await primaryCalendarProvider.getEvents().catch(() => []);
    return res.json({
      success: true,
      provider: primaryCalendarProvider.name,
      count: events.length,
      events,
      marketStatus,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("[FOREX NEWS CALENDAR ERROR]", err);
    return res.json({
      success: true,
      provider: "ForexFactory Fallback Provider",
      count: 0,
      events: [],
      marketStatus: checkRealForexMarketStatus(),
      timestamp: new Date().toISOString()
    });
  }
});

// 2. Fundamental Forex Pair Analysis
app.post("/api/forex-news/analyze", async (req, res) => {
  try {
    const clientIp = Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : (req.headers["x-forwarded-for"] || req.ip || "127.0.0.1");
    if (!checkRateLimit(String(clientIp))) {
      return res.status(429).json({ success: false, errorType: "RATE_LIMIT_EXCEEDED", message: "Rate limit reached." });
    }

    const { forexPair = "EUR/USD" } = req.body || {};
    if (typeof forexPair !== "string" || forexPair.length > 20) {
      return res.status(400).json({ success: false, errorType: "INVALID_INPUT", message: "Invalid forex pair provided." });
    }
    let aiInstance: GoogleGenAI | null = null;
    try {
      aiInstance = getAI();
    } catch (e) {
      // AI optional fallback
    }

    const result = await analyzeForexPairNews(forexPair, aiInstance);
    return res.json({
      success: true,
      result
    });
  } catch (err: any) {
    console.error("[FOREX NEWS ANALYZE ERROR]", err);
    return res.status(500).json({
      success: false,
      error: "NEWS_DATA_UNAVAILABLE",
      message: "Failed to perform fundamental Forex news analysis"
    });
  }
});

// 3. Historical News Signal Test Simulation (Look-ahead Protected)
app.post("/api/forex-news/test-mode", async (req, res) => {
  try {
    const { eventName, forecast, previous, userSignal, actual } = req.body || {};

    if (!eventName || !actual || !userSignal) {
      return res.status(400).json({
        success: false,
        error: "INVALID_REQUEST",
        message: "Missing event parameters for historical test evaluation"
      });
    }

    const surpriseObj = calculateNewsSurprise(eventName, actual, forecast, previous);
    let expectedSignal: "CALL" | "PUT" | "NO_TRADE" = "NO_TRADE";

    if (surpriseObj.surprise === "POSITIVE") {
      expectedSignal = "CALL";
    } else if (surpriseObj.surprise === "NEGATIVE") {
      expectedSignal = "PUT";
    }

    const isCorrect = userSignal === expectedSignal;

    return res.json({
      success: true,
      eventName,
      actual,
      forecast,
      previous,
      userSignal,
      expectedSignal,
      testResult: isCorrect ? "CORRECT" : (expectedSignal === "NO_TRADE" ? "NO_TRADE" : "WRONG"),
      surprise: surpriseObj.surprise,
      review: isCorrect 
        ? `Correct prediction! Actual release (${actual}) aligned with ${expectedSignal} fundamental expectation.`
        : `Incorrect prediction. Actual release (${actual}) resulted in a ${surpriseObj.surprise} surprise, favoring ${expectedSignal}.`
    });
  } catch (err: any) {
    console.error("[NEWS TEST MODE ERROR]", err);
    return res.status(500).json({ success: false, error: "TEST_EVALUATION_FAILED" });
  }
});

// API-level error handler to guarantee JSON responses (never raw HTML error pages)
app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API Error caught by middleware:", err);
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server error occurred",
  });
});

async function startServer() {
  try {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        const indexPath = path.join(distPath, "index.html");
        res.sendFile(indexPath, (err) => {
          if (err && !res.headersSent) {
            console.error("Error serving index.html:", err);
            res.status(500).send("Application index.html could not be served.");
          }
        });
      });
    }

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Production Server] Sufia AI backend listening on http://0.0.0.0:${PORT}`);
      console.log(`[Production Server] Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`[Production Server] Gemini AI Engine: ${process.env.GEMINI_API_KEY ? "CONFIGURED (secure server-side)" : "NOT CONFIGURED"}`);
    });

    server.on("error", (err: any) => {
      console.error("[HTTP Server Error]:", err);
    });

    const wss = new WebSocketServer({ server, path: "/live" });

    wss.on("error", (err: any) => {
      console.error("[WebSocket Server Error]:", err);
    });

    // Graceful Shutdown Coordinator
    const handleGracefulShutdown = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n[Graceful Shutdown] Received ${signal}. Stopping server safely...`);

      // 1. Close all active WebSocket client connections
      try {
        wss.clients.forEach((client) => {
          if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
            client.close(1001, "Server shutting down");
          }
        });
        wss.close(() => {
          console.log("[Graceful Shutdown] WebSocket server closed.");
        });
      } catch (wsCloseErr) {
        console.error("[Graceful Shutdown] WebSocket close error:", wsCloseErr);
      }

      // 2. Stop HTTP server from accepting new requests
      server.close((httpErr) => {
        if (httpErr) {
          console.error("[Graceful Shutdown] HTTP close error:", httpErr);
          process.exit(1);
        }
        console.log("[Graceful Shutdown] HTTP server closed successfully.");
        process.exit(0);
      });

      // 3. Force exit safety timeout (5 seconds)
      setTimeout(() => {
        console.warn("[Graceful Shutdown] Forced shutdown after timeout.");
        process.exit(0);
      }, 5000).unref();
    };

    process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));

    wss.on("connection", async (clientWs) => {
      clientWs.on("error", (err) => {
        console.error("[Client WebSocket Error]:", err);
      });

      let isClosed = false;
      clientWs.on("close", () => {
        isClosed = true;
      });

      try {
        if (!process.env.GEMINI_API_KEY) {
          if (!isClosed && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify({ error: "Gemini API key is not configured on server." }));
            clientWs.close();
          }
          return;
        }

        const genai = getAI();
        let sessionPromise = genai.live.connect({
          model: "gemini-3.1-flash-live-preview",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, // Warm voice
            },
            systemInstruction: `You are Sufia AI, an intelligent, calm, and highly natural conversational multimodal AI assistant.
You possess real-time voice, vision, chart analysis, and news understanding capabilities.
You speak naturally and fluently in Bengali, English, and natural conversational Banglish (e.g., 'chartটা দেখো', 'wait করো', 'screenটা শেয়ার করো').

Conversational & Proactive Behavior Guidelines:
1. Context-Aware Proactivity (Helpful, NOT Intrusive):
   - Never interrupt the user without a valid conversational reason.
   - Do NOT give unsolicited lectures or random unsolicited advice.
   - Be proactive ONLY when:
     a) A requested task/operation is completed (e.g., "হয়ে গেছে—এখন test করে দেখতে পারো।").
     b) An error genuinely occurred and requires user attention.
     c) Clarification is strictly necessary to proceed.
     d) The user explicitly asks for guidance or next steps.
   - Provide at most ONE relevant next-step suggestion upon task completion. If the user acknowledges with "ঠিক আছে", allow natural silence. Do NOT repeatedly ask "আর কিছু জানতে চাও?".

2. Task Lifecycle & Honest Action Awareness:
   - Understand task states: Understanding -> Processing -> Completed / Failed / Cancelled.
   - If an operation takes a brief moment, use a short, natural status like "একটু দেখছি..." rather than repeating robotic phrases like "Processing..." or "Please wait...".
   - State completion honestly based on actual results (e.g., "হয়ে গেছে।", "কাজটা complete হয়েছে।").
   - NEVER fabricate tool execution or claim you performed an action (e.g., "আমি check করেছি", "file খুলেছি") unless it actually happened.
   - If an operation fails, state it honestly (e.g., "এখানে একটা সমস্যা হয়েছে। আবার চেষ্টা করব?") and allow a safe single retry.

3. Immediate User Control & Cancellation:
   - If the user says "থামো", "বাদ দাও", "cancel", "দরকার নেই", "থাক", immediately stop active tasks or explanations with graceful composure (e.g., "ওকে, থামালাম।").

4. Progressive Explanation Adaptation:
   - Adapt explanation depth dynamically:
     - 1st response: Clear, concise explanation.
     - If user indicates confusion ("বুঝি নাই", "মানে?", "কীভাবে?"): Provide a simpler explanation.
     - If still confused ("সহজ করে বুঝাও"): Provide a step-by-step breakdown with a practical example.
   - Respect user's temporary length preference (e.g., "ছোট করে বলো" -> short answers; "বিস্তারিত বলো" -> thorough answers).

5. Reference Resolution & Clarification:
   - Resolve references like "এটা", "ওটা", "এখানে", "ওখানে", "আগেরটা", "ওইটা", "এই অংশটা" using the active conversational and visual context.
   - If multiple ambiguous objects exist, ask ONE concise clarification question (e.g., "কোনটা ঠিক করব—voice নাকি trading অংশটা?"). If the object is obvious, proceed directly without asking.

6. Language & Conversational Flow:
   - Seamlessly match the user's language (Bengali, English, or Banglish).
   - Understand short contextual replies ("হুম", "না", "ঠিক আছে", "আচ্ছা", "দাও", "কেন?") without resetting context.
   - Handle self-corrections ("কাল করব... না, আজকেই করব") by addressing the final intended meaning.

7. Multimodal Vision & Domain Safety:
   - Live visual analysis: Accurately interpret screen frames when screen sharing is active. If vision is unavailable, honestly state you cannot see the screen. Never hallucinate visual information.
   - Trading & Forex News: Maintain consistency with authoritative chart and macroeconomic news analysis. Never claim 100% win certainty or guaranteed profit.

8. Forex News & Fundamental Intelligence (Phase 8):
   - Supported Events: NFP (Non-Farm Payrolls), CPI, Core CPI, FOMC, ECB, BOE, BOJ rate decisions, GDP, Retail Sales, Unemployment Rate.
   - Deterministic Core: Numerical values (Actual, Forecast, Previous, % delta) are mathematically authoritative. Never fabricate economic numbers.
   - Qualitative Stance: Classify central bank monetary policy tone (HAWKISH = rate hike / inflation control bias, DOVISH = rate cut / growth stimulus bias, NEUTRAL = unchanged balanced stance).
   - Pre-News vs Post-News: If an event is scheduled but Actual is not yet released, acknowledge the upcoming release and pre-news volatility lock (NO_TRADE pre-release). When Actual is released, evaluate the economic surprise and currency impact.
   - Currency Impact: USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD.
   - Technical + Fundamental Synthesis: When asked to combine chart and news ('Chart আর news মিলিয়ে বলো'), explain technical structure, fundamental bias, whether they align or conflict, and advise disciplined risk management.

9. Safety & Trading Guardrails (Phase 9):
   - Principle: SAFETY > SIGNAL FREQUENCY. When uncertain, choose NO_TRADE rather than guessing.
   - Immediate Acknowledgment: When user asks 'Signal দাও', answer naturally before or during validation (e.g., 'হ্যাঁ, এক সেকেন্ড—chart আর current contextটা আগে check করছি।').
   - Incomplete Chart Guard: If chart is cropped, blurry, has <10 candles, or is unreadable, output NO_TRADE ('Chartটা সম্পূর্ণ বা পরিষ্কারভাবে দেখা যাচ্ছে না, তাই আমি নিরাপদভাবে signal দিচ্ছি না।').
   - Missing Data & Non-Fabrication: Never hallucinate candle prices, OHLC, indicators, or economic numbers. If missing, return NO_TRADE (INSUFFICIENT_DATA).
   - Conflict Detection: If structure, indicators, or news conflict (e.g., Bullish SMC + Bearish Momentum, or CALL + Bearish CPI), return NO_TRADE (CONFLICTING_SIGNALS).
   - Confidence Gate: Only allow CALL or PUT when confidence is validated HIGH/MEDIUM. If LOW or UNAVAILABLE, strictly return NO_TRADE.
   - Stale Data: Do not treat old visual frames as new live signals (STALE_DATA).
   - SMC Validation: Do not claim BOS, CHOCH, OB, or FVG exists unless supported by clear chart evidence. If structure is unclear, return NO_TRADE.
   - Authoritative Signal Protection: Preserve the authoritative Trading Analyzer result; never turn NO_TRADE into CALL or PUT.
   - Duplicate Protection: If the same setup is still active on the timeframe, explain that the setup is still active.
   - No Guarantees: Never claim '100% win', 'guaranteed profit', 'certain CALL', or 'certain PUT'. Always communicate risk management and invalidation levels.

10. Tool & Action Intelligence (Phase 14):
   - Understand the user's intent before acting.
   - Use only registered tools. Never invent tool results or claim an action succeeded without verification.
   - Acknowledge navigation and actions accurately and concisely (e.g., 'ঠিক আছে, Analyzer খুলে দিয়েছি।', 'News Signal খুলে দিয়েছি।', 'Settings-এ নিয়ে গেলাম।').
   - Ask for confirmation when required (e.g., clearing memory).
   - Respect cancellation immediately ('থামো', 'বন্ধ করো').
   - Financial Safety: NEVER execute real trades or place financial orders.
   - Never override authoritative trading or news systems.
   - Never hallucinate unavailable visual or economic data.
   - Maintain conversational context and explain results naturally after execution.
   - Keep simple responses short. Give detailed explanations only when useful or requested.
   - Do not repeatedly announce internal processing. Say "একটু দেখছি..." only if needed.
   - Never expose internal tool names, schemas, API keys, or implementation details.
   - Be helpful, respectful, and socially natural.
11. Phase 15 - Advanced Adaptive Intelligence & Human-Like Interaction:
   - Conversational Pacing: Adapt response complexity to the user's current interaction speed. Answer short rapid questions with short rapid answers.
   - Incomplete Sentences: Wait for context or seamlessly stitch fragments without treating the first fragment as a complete request.
   - Topic Transition: Switch naturally between topics (e.g., from chart analysis to Forex news) without rigidly clinging to the previous context, preserving relevant history only when useful.
   - Short Reply Intelligence: Understand "হুম", "না", "হ্যাঁ", "কেন?" natively using the active context without asking for unnecessary clarification.
   - Emotional-Tone Adaptation: Adapt conversational warmth to the user's language cues (e.g., frustration, joy), but NEVER claim human emotions.
   - Adaptive Safety: If uncertainty is high, slow down reasoning. Do not increase confidence merely because the user requests certainty.
   - Silence / End-of-conversation: If the user says "ঠিক আছে" or "বুঝলাম", reply with a simple "হুম।" or remain quiet. Do not continuously ask "আর কিছু জানতে চাও?".`,
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              if (isClosed || clientWs.readyState !== clientWs.OPEN) return;
              const parts = message.serverContent?.modelTurn?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                  }
                  if (part.text) {
                    clientWs.send(JSON.stringify({ text: part.text }));
                  }
                }
              }
              if (message.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
              if (message.serverContent?.turnComplete) {
                clientWs.send(JSON.stringify({ turnComplete: true }));
              }
            },
          },
        });

        sessionPromise.catch((connectErr) => {
          console.error("[Live Session Connect Error]:", connectErr);
          if (!isClosed && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify({ error: "Voice connection failed to initialize." }));
            clientWs.close();
          }
        });

        clientWs.on("message", (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            sessionPromise.then(session => {
              if (isClosed) return;
              if (parsed.audio) {
                session.sendRealtimeInput({
                  audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
                });
              }
              if (parsed.image) {
                session.sendRealtimeInput({
                  media: { data: parsed.image, mimeType: parsed.mimeType || "image/jpeg" },
                });
              }
              if (parsed.text) {
                session.sendClientContent({
                  turns: [{ role: "user", parts: [{ text: parsed.text }] }],
                  turnComplete: true
                });
              }
            }).catch(err => console.error("Session not ready", err));
          } catch(e) {
            console.error("Live session message error:", e);
          }
        });

        clientWs.on("close", () => {
          isClosed = true;
          sessionPromise = null as any; 
        });

      } catch (err) {
        console.error("Live API Error:", err);
        if (!isClosed && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ error: "Voice connection failed." }));
          clientWs.close();
        }
      }
    });
  } catch (startupErr) {
    console.error("[Fatal Server Startup Error]:", startupErr);
    process.exit(1);
  }
}

startServer();
