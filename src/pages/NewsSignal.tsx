import React, { useState, useEffect } from "react";
import { 
  Globe, 
  Flame, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  BarChart3, 
  Zap, 
  ShieldAlert, 
  Layers, 
  FlaskConical, 
  HelpCircle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { toast } from "react-hot-toast";
import { ForexNewsItem, ForexNewsAnalysisResult } from "../types";
import { playSignalSound, playTestSound } from "../lib/sound";
import { getApiUrl } from "../lib/api";

const FOREX_PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "AUD/USD",
  "NZD/USD",
  "USD/CAD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY"
];

export default function NewsSignal() {
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [activeTab, setActiveTab] = useState<"analyzer" | "calendar" | "test-lab">("analyzer");
  
  const [calendarEvents, setCalendarEvents] = useState<ForexNewsItem[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [analysisResult, setAnalysisResult] = useState<ForexNewsAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [apiError, setApiError] = useState<string | null>(null);

  // Filter state for calendar
  const [impactFilter, setImpactFilter] = useState<"ALL" | "HIGH">("HIGH");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");

  // Test Mode State
  const [testEvent, setTestEvent] = useState<ForexNewsItem | null>(null);
  const [userTestPrediction, setUserTestPrediction] = useState<"CALL" | "PUT" | "NO_TRADE" | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isEvaluatingTest, setIsEvaluatingTest] = useState<boolean>(false);

  useEffect(() => {
    fetchEconomicCalendar();
  }, []);

  useEffect(() => {
    if (selectedPair) {
      runNewsAnalysis(selectedPair);
    }
  }, [selectedPair]);

  const fetchEconomicCalendar = async () => {
    setIsLoadingCalendar(true);
    setApiError(null);
    try {
      const res = await fetch(getApiUrl("/api/forex-news/calendar"));
      if (!res.ok) {
        throw new Error("HTTP error " + res.status);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        setCalendarEvents(data.events);
        setLastUpdated(new Date().toLocaleTimeString());
        
        // Pick first high-impact event for test lab default if none set
        const highImpact = data.events.find((e: ForexNewsItem) => e.impact === "HIGH");
        if (highImpact && !testEvent) {
          setTestEvent(highImpact);
        }
      } else {
        throw new Error(data.message || "Failed to load economic calendar");
      }
    } catch (err: any) {
      console.error("Calendar fetch error:", err);
      setApiError("NEWS DATA UNAVAILABLE: Could not fetch live economic calendar.");
      toast.error("Failed to fetch economic calendar");
    } finally {
      setIsLoadingCalendar(false);
    }
  };

  const runNewsAnalysis = async (pair: string) => {
    setIsAnalyzing(true);
    setApiError(null);
    setAnalysisStep("Connecting to economic calendar feeds...");

    try {
      setTimeout(() => setAnalysisStep("Filtering NFP, CPI & high-impact macro reports..."), 300);
      setTimeout(() => setAnalysisStep("Evaluating Base vs Quote currency fundamental surprise..."), 600);
      setTimeout(() => setAnalysisStep("Validating central bank stance & conflict thresholds..."), 900);

      const res = await fetch(getApiUrl("/api/forex-news/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forexPair: pair })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "News analysis server error");
      }

      const data = await res.json();
      if (data.success && data.result) {
        setAnalysisResult(data.result);
        playSignalSound(data.result.newsSignal);

        // Save to history if local setting allows
        saveNewsSignalToLocalHistory(data.result);
      } else {
        throw new Error(data.message || "Analysis generation failed");
      }
    } catch (err: any) {
      console.error("News Analysis Error:", err);
      setApiError("NEWS DATA UNAVAILABLE: Unable to complete macroeconomic analysis.");
      toast.error("News analysis request failed");
      playTestSound("WRONG");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveNewsSignalToLocalHistory = (result: ForexNewsAnalysisResult) => {
    try {
      const storedSettings = localStorage.getItem("coco_settings_v1");
      const settings = storedSettings ? JSON.parse(storedSettings) : { saveHistory: true };

      if (settings.saveHistory !== false) {
        const existingHistoryRaw = localStorage.getItem("coco_news_history_v1");
        const existingHistory = existingHistoryRaw ? JSON.parse(existingHistoryRaw) : [];

        const newRecord = {
          id: `news_${Date.now()}`,
          timestamp: Date.now(),
          forexPair: result.forexPair,
          event: result.primaryEvent?.event || "Economic Release",
          currency: result.primaryEvent?.currency || "USD",
          signal: result.newsSignal,
          bias: result.fundamentalBias,
          actual: result.actual,
          forecast: result.forecast,
          previous: result.previous,
          confidence: result.confidence
        };

        const updatedHistory = [newRecord, ...existingHistory].slice(0, 50);
        localStorage.setItem("coco_news_history_v1", JSON.stringify(updatedHistory));
      }
    } catch (e) {
      console.warn("Could not save news history:", e);
    }
  };

  const submitTestPrediction = async (prediction: "CALL" | "PUT" | "NO_TRADE") => {
    if (!testEvent) return;
    setUserTestPrediction(prediction);
    setIsEvaluatingTest(true);

    try {
      const res = await fetch(getApiUrl("/api/forex-news/test-mode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: testEvent.event,
          forecast: testEvent.forecast,
          previous: testEvent.previous,
          userSignal: prediction,
          actual: testEvent.actual || "272K"
        })
      });

      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        if (data.testResult === "CORRECT") {
          playTestSound("CORRECT");
          toast.success("Correct Fundamental Prediction!");
        } else {
          playTestSound("WRONG");
          toast.error("Prediction Missed");
        }
      }
    } catch (e) {
      toast.error("Test mode evaluation failed");
    } finally {
      setIsEvaluatingTest(false);
    }
  };

  // Find High Impact Alert Event
  const highImpactAlert = calendarEvents.find(
    e => e.impact === "HIGH" && (e.status === "UPCOMING" || e.status === "JUST_RELEASED")
  );

  const filteredCalendar = calendarEvents.filter(e => {
    if (impactFilter === "HIGH" && e.impact !== "HIGH") return false;
    if (currencyFilter !== "ALL" && e.currency !== currencyFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/80 border border-border rounded-2xl p-4 sm:p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-primary bg-primary/20 px-2 py-0.5 rounded border border-primary/30 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> REAL FOREX • MACROECONOMICS
            </span>
            {lastUpdated && (
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" /> Updated {lastUpdated}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            HIGH-IMPACT NEWS SIGNAL
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Real economic calendar news, NFP, CPI & central bank interest rate analysis.
          </p>
        </div>

        <button
          onClick={fetchEconomicCalendar}
          disabled={isLoadingCalendar}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface hover:bg-white/10 border border-border text-sm font-semibold text-text hover:text-white transition-all active:scale-95 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingCalendar ? "animate-spin text-primary" : ""}`} />
          <span>Refresh News</span>
        </button>
      </div>

      {/* High Impact Alert Banner (If Active) */}
      {highImpactAlert && (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse ${
          highImpactAlert.status === "UPCOMING" 
            ? "bg-amber-500/10 border-amber-500/40 text-amber-200" 
            : "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              highImpactAlert.status === "UPCOMING" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"
            }`}>
              {highImpactAlert.status === "UPCOMING" ? <ShieldAlert className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-black/40 border border-current">
                  🔴 {highImpactAlert.status === "UPCOMING" ? "HIGH IMPACT NEWS UPCOMING" : "JUST RELEASED"}
                </span>
                <span className="text-xs font-bold text-white">{highImpactAlert.currency}</span>
              </div>
              <h3 className="font-black text-base text-white mt-1">{highImpactAlert.event}</h3>
              <p className="text-xs opacity-90 mt-0.5">
                Release Time: {new Date(highImpactAlert.time).toLocaleTimeString()} | Forecast: {highImpactAlert.forecast || 'N/A'} | Prev: {highImpactAlert.previous || 'N/A'}
              </p>
            </div>
          </div>
          {highImpactAlert.actual && (
            <div className="bg-black/40 px-3 py-2 rounded-xl border border-white/10 text-right shrink-0">
              <span className="text-[10px] text-text-muted block font-semibold uppercase">Actual Release</span>
              <span className="text-base font-black text-emerald-400">{highImpactAlert.actual}</span>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("analyzer")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "analyzer" 
              ? "bg-primary text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]" 
              : "bg-surface text-text-muted hover:text-white border border-border"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Live News Analyzer
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "calendar" 
              ? "bg-primary text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]" 
              : "bg-surface text-text-muted hover:text-white border border-border"
          }`}
        >
          <Calendar className="w-4 h-4" /> Economic Calendar ({calendarEvents.length})
        </button>
        <button
          onClick={() => setActiveTab("test-lab")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "test-lab" 
              ? "bg-primary text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]" 
              : "bg-surface text-text-muted hover:text-white border border-border"
          }`}
        >
          <FlaskConical className="w-4 h-4" /> News Lab (Test Mode)
        </button>
      </div>

      {/* API ERROR BANNER */}
      {apiError && (
        <div className="p-4 bg-danger/10 border border-danger/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-danger">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">{apiError}</span>
          </div>
          <button
            onClick={() => runNewsAnalysis(selectedPair)}
            className="px-3 py-1.5 bg-danger/20 hover:bg-danger/30 rounded-lg text-xs font-bold transition-all border border-danger/30 shrink-0"
          >
            Retry Analysis
          </button>
        </div>
      )}

      {/* TAB 1: LIVE NEWS ANALYZER */}
      {activeTab === "analyzer" && (
        <div className="space-y-6">
          {/* Forex Pair Selector Chips */}
          <div className="bg-surface border border-border rounded-2xl p-4">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-2.5">
              Select Real Forex Currency Pair
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {FOREX_PAIRS.map(pair => (
                <button
                  key={pair}
                  onClick={() => setSelectedPair(pair)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${
                    selectedPair === pair 
                      ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(139,92,246,0.2)]" 
                      : "bg-background border-border text-text-muted hover:text-white hover:border-white/20"
                  }`}
                >
                  <span>{pair}</span>
                  {selectedPair === pair && <Zap className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          {/* Analysis Progress Overlay */}
          {isAnalyzing && (
            <div className="p-8 bg-surface border border-primary/30 rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <Globe className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider">
                  ANALYZING {selectedPair} NEWS
                </h3>
                <p className="text-xs text-primary font-semibold mt-1 animate-pulse">
                  {analysisStep}
                </p>
              </div>
            </div>
          )}

          {/* MARKET CLOSED BANNER / CARD */}
          {!isAnalyzing && analysisResult && analysisResult.marketStatus && !analysisResult.marketStatus.isOpen && (
            <div className="bg-surface border border-rose-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl relative overflow-hidden">
              <div className="flex items-start sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400 border border-rose-500/30">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                      REAL FOREX MARKET STATUS
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                      REAL FOREX MARKET CLOSED
                    </h2>
                  </div>
                </div>
                <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-extrabold uppercase">
                  INACTIVE
                </span>
              </div>

              <div className="p-4 bg-background/60 border border-border rounded-xl space-y-2">
                <div className="text-xs font-bold text-text-muted uppercase">Market Schedule Reason</div>
                <p className="text-xs sm:text-sm text-white font-medium">
                  {analysisResult.marketStatus.reason}
                </p>
                <div className="text-xs text-text-muted pt-2 border-t border-border flex items-center justify-between">
                  <span>Current Window: <strong className="text-white">{analysisResult.marketStatus.session}</strong></span>
                  <span>Signals auto-activate on market open</span>
                </div>
              </div>
            </div>
          )}

          {/* ANALYSIS RESULT CARD */}
          {!isAnalyzing && analysisResult && (analysisResult.marketStatus?.isOpen ?? true) && (
            <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-6 shadow-2xl relative overflow-hidden">
              
              {/* Top Pair & Signal Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                    REAL FOREX FUNDAMENTAL SIGNAL
                  </span>
                  <div className="flex items-center gap-3 mt-1">
                    <h2 className="text-2xl sm:text-3xl font-black text-white">{analysisResult.forexPair}</h2>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-white/5 border border-border text-text-muted">
                      Base: {analysisResult.baseCurrency} | Quote: {analysisResult.quoteCurrency}
                    </span>
                  </div>
                </div>

                {/* Primary Signal Badge */}
                <div className={`px-6 py-3 rounded-2xl border-2 flex items-center gap-3 shadow-xl ${
                  analysisResult.newsSignal === "CALL" 
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]" 
                    : analysisResult.newsSignal === "PUT" 
                    ? "bg-rose-500/10 border-rose-500 text-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.2)]" 
                    : "bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]"
                }`}>
                  {analysisResult.newsSignal === "CALL" && <ArrowUpRight className="w-8 h-8 stroke-[3]" />}
                  {analysisResult.newsSignal === "PUT" && <ArrowDownRight className="w-8 h-8 stroke-[3]" />}
                  {analysisResult.newsSignal === "NO_TRADE" && <ShieldAlert className="w-8 h-8 stroke-[2]" />}
                  <div>
                    <span className="text-[10px] font-bold block uppercase tracking-wider opacity-80">FINAL SIGNAL</span>
                    <span className="text-2xl font-black tracking-tight">{analysisResult.newsSignal.replace("_", " ")}</span>
                  </div>
                </div>
              </div>

              {/* Grid Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-background/60 border border-border p-3 sm:p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Primary Event</span>
                  <span className="text-xs sm:text-sm font-black text-white truncate block mt-1" title={analysisResult.primaryEvent?.event}>
                    {analysisResult.primaryEvent?.event || "Economic Report"}
                  </span>
                </div>

                <div className="bg-background/60 border border-border p-3 sm:p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-text-muted uppercase block">News Surprise</span>
                  <span className={`text-xs sm:text-sm font-black block mt-1 ${
                    analysisResult.newsSurprise === "POSITIVE" ? "text-emerald-400" :
                    analysisResult.newsSurprise === "NEGATIVE" ? "text-rose-400" : "text-amber-400"
                  }`}>
                    {analysisResult.newsSurprise}
                  </span>
                </div>

                <div className="bg-background/60 border border-border p-3 sm:p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Event Risk</span>
                  <span className={`text-xs sm:text-sm font-black block mt-1 ${
                    analysisResult.eventRisk === "EXTREME" || analysisResult.eventRisk === "HIGH" ? "text-rose-400" : "text-emerald-400"
                  }`}>
                    {analysisResult.eventRisk}
                  </span>
                </div>

                <div className="bg-background/60 border border-border p-3 sm:p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Confidence</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${analysisResult.confidence}%` }}></div>
                    </div>
                    <span className="text-xs font-black text-primary">{analysisResult.confidence}%</span>
                  </div>
                </div>
              </div>

              {/* Economic Figures Bar (Actual vs Forecast vs Previous) */}
              <div className="bg-background/80 border border-border rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Actual Release</span>
                  <span className="text-base sm:text-lg font-black text-emerald-400 mt-0.5 block">
                    {analysisResult.actual}
                  </span>
                </div>
                <div className="border-x border-border">
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Forecast</span>
                  <span className="text-base sm:text-lg font-black text-white mt-0.5 block">
                    {analysisResult.forecast}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-muted uppercase block">Previous</span>
                  <span className="text-base sm:text-lg font-black text-text-muted mt-0.5 block">
                    {analysisResult.previous}
                  </span>
                </div>
              </div>

              {/* Base vs Quote Currency Bias */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-background/50 border border-border rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-text-muted">{analysisResult.baseCurrency} Currency Bias</span>
                  <span className={`text-xs font-extrabold px-2.5 py-1 rounded uppercase ${
                    analysisResult.baseCurrencyBias === "BULLISH" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    analysisResult.baseCurrencyBias === "BEARISH" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-white/10 text-white"
                  }`}>
                    {analysisResult.baseCurrencyBias}
                  </span>
                </div>

                <div className="p-3.5 bg-background/50 border border-border rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-text-muted">{analysisResult.quoteCurrency} Currency Bias</span>
                  <span className={`text-xs font-extrabold px-2.5 py-1 rounded uppercase ${
                    analysisResult.quoteCurrencyBias === "BULLISH" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    analysisResult.quoteCurrencyBias === "BEARISH" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-white/10 text-white"
                  }`}>
                    {analysisResult.quoteCurrencyBias}
                  </span>
                </div>
              </div>

              {/* AI Hybrid Stance & Qualitative Badges */}
              {analysisResult.aiPolicyTone && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-background/50 border border-border rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-text-muted flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-primary" /> AI Central Bank Stance
                    </span>
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded uppercase ${
                      analysisResult.aiPolicyTone === "HAWKISH" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                      analysisResult.aiPolicyTone === "DOVISH" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-white/10 text-white"
                    }`}>
                      {analysisResult.aiPolicyTone}
                    </span>
                  </div>

                  <div className="p-3 bg-background/50 border border-border rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-text-muted flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-primary" /> Qualitative Confirmation
                    </span>
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded uppercase ${
                      analysisResult.aiConfirmation === "ALIGNED" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                      analysisResult.aiConfirmation === "CONFLICTING" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/10 text-text-muted"
                    }`}>
                      {analysisResult.aiConfirmation}
                    </span>
                  </div>
                </div>
              )}

              {/* AI Macro Explanation Reason */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <Layers className="w-4 h-4" /> Macroeconomic Analysis & Evidence
                </div>
                <p className="text-xs sm:text-sm text-text leading-relaxed font-medium">
                  {analysisResult.reason}
                </p>
                {analysisResult.keyEvidence && analysisResult.keyEvidence.length > 0 && (
                  <ul className="space-y-1 pt-2 border-t border-primary/10">
                    {analysisResult.keyEvidence.map((ev, i) => (
                      <li key={i} className="text-xs text-text-muted flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* TAB 2: ECONOMIC CALENDAR */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-muted">Impact:</span>
              <button
                onClick={() => setImpactFilter("HIGH")}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  impactFilter === "HIGH" ? "bg-rose-500 text-white" : "bg-background text-text-muted"
                }`}
              >
                High Impact Only
              </button>
              <button
                onClick={() => setImpactFilter("ALL")}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  impactFilter === "ALL" ? "bg-primary text-white" : "bg-background text-text-muted"
                }`}
              >
                All Events
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-muted">Currency:</span>
              <select
                value={currencyFilter}
                onChange={e => setCurrencyFilter(e.target.value)}
                className="bg-background border border-border text-white text-xs font-bold rounded-lg px-2.5 py-1.5"
              >
                <option value="ALL">All Currencies</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (Pound)</option>
                <option value="JPY">JPY (Yen)</option>
                <option value="AUD">AUD (Aussie)</option>
                <option value="CAD">CAD (Loonie)</option>
              </select>
            </div>
          </div>

          {/* Events List */}
          <div className="space-y-2.5">
            {filteredCalendar.length === 0 ? (
              <div className="p-8 text-center bg-surface border border-border rounded-2xl text-text-muted text-xs">
                No matching economic calendar events found.
              </div>
            ) : (
              filteredCalendar.map(ev => (
                <div
                  key={ev.id}
                  className="bg-surface hover:bg-surface/80 border border-border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase shrink-0 ${
                      ev.impact === "HIGH" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}>
                      {ev.currency}
                    </span>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">{ev.event}</h4>
                      <span className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {new Date(ev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Status: {ev.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="text-right text-xs">
                      <span className="text-text-muted text-[10px] block font-semibold">ACT / FCT / PREV</span>
                      <span className="font-bold text-emerald-400">{ev.actual || "N/A"}</span>
                      <span className="text-text-muted"> / {ev.forecast || "N/A"} / {ev.previous || "N/A"}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: NEWS LAB (TEST MODE) */}
      {activeTab === "test-lab" && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
              <FlaskConical className="w-4 h-4" /> HISTORICAL NEWS PREDICTION LAB (LOOK-AHEAD PROTECTED)
            </div>
            <p className="text-xs text-text-muted">
              Test your macroeconomic analysis skills on real historical economic releases. The actual release value is strictly hidden until you lock in your prediction.
            </p>

            {/* Test Event Selection */}
            {testEvent && (
              <div className="bg-background border border-border rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                      {testEvent.impact} IMPACT RELEASE
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">{testEvent.currency} — {testEvent.event}</h3>
                  </div>
                  <span className="px-2.5 py-1 bg-white/5 border border-border rounded text-xs font-bold text-text-muted">
                    Pre-Release Evaluation
                  </span>
                </div>

                {/* Pre-event Figures (Actual Hidden) */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-surface/50 rounded-xl border border-border">
                    <span className="text-[10px] text-text-muted font-bold block uppercase">Forecast</span>
                    <span className="text-sm font-black text-white">{testEvent.forecast || "N/A"}</span>
                  </div>
                  <div className="p-3 bg-surface/50 rounded-xl border border-border">
                    <span className="text-[10px] text-text-muted font-bold block uppercase">Previous</span>
                    <span className="text-sm font-black text-text-muted">{testEvent.previous || "N/A"}</span>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/30 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-primary font-bold block uppercase">Actual Result</span>
                    <span className="text-xs font-extrabold text-primary animate-pulse">🔒 LOCKED</span>
                  </div>
                </div>

                {/* Prediction Buttons */}
                {!testResult && (
                  <div className="pt-2 space-y-2">
                    <span className="text-xs font-bold text-text-muted block">Predict Market Impact Direction:</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => submitTestPrediction("CALL")}
                        disabled={isEvaluatingTest}
                        className="py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 font-black text-xs sm:text-sm transition-all active:scale-95"
                      >
                        BULLISH (CALL)
                      </button>
                      <button
                        onClick={() => submitTestPrediction("PUT")}
                        disabled={isEvaluatingTest}
                        className="py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 font-black text-xs sm:text-sm transition-all active:scale-95"
                      >
                        BEARISH (PUT)
                      </button>
                      <button
                        onClick={() => submitTestPrediction("NO_TRADE")}
                        disabled={isEvaluatingTest}
                        className="py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 font-black text-xs sm:text-sm transition-all active:scale-95"
                      >
                        NO TRADE
                      </button>
                    </div>
                  </div>
                )}

                {/* Test Evaluation Output */}
                {testResult && (
                  <div className={`p-4 rounded-xl border space-y-2 mt-4 ${
                    testResult.testResult === "CORRECT" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "bg-rose-500/10 border-rose-500/40 text-rose-300"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm uppercase flex items-center gap-1.5">
                        {testResult.testResult === "CORRECT" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                        PREDICTION RESULT: {testResult.testResult}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-black/40">
                        Actual Revealed: {testResult.actual}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed font-medium">
                      {testResult.review}
                    </p>
                    <button
                      onClick={() => {
                        setTestResult(null);
                        setUserTestPrediction(null);
                      }}
                      className="mt-2 text-xs font-bold text-white underline hover:no-underline"
                    >
                      Test Another Event
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
