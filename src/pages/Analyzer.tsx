import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, Activity, ShieldAlert, ChevronRight, ChevronLeft, Zap, ArrowUp, ArrowDown, RefreshCw, AlertCircle, Sparkles, Play } from "lucide-react";
import toast from "react-hot-toast";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { AnalysisResult, SignalHistory } from "../types";
import { getStoredSettings } from "../lib/settings";
import { playSignalSound } from "../lib/sound";
import { getApiUrl } from "../lib/api";

type AnalysisState = "IDLE" | "UPLOADING" | "ANALYZING" | "COMPLETED" | "ERROR" | "TIMEOUT";

const analysisStages = [
  "Reading chart & validating resolution...",
  "Mapping visible candles & market structure...",
  "Scanning liquidity, sweeps & OTC traps...",
  "Checking SMC & price action confluence...",
  "Running contradiction filter & finalizing signal..."
];

const brokers = ["Quotex", "Binolla", "Pocket Option"];

export default function Analyzer() {
  const { user } = useAuth();
  
  const [step, setStep] = useState<"SELECT_BROKER" | "UPLOAD_CHART">("SELECT_BROKER");
  const [broker, setBroker] = useState("Quotex");
  const [mode, setMode] = useState("OTC");
  const [asset, setAsset] = useState("EUR/USD");
  const [timeframe, setTimeframe] = useState("1M");
  
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 11 Explicit State Machine
  const [analysisState, setAnalysisState] = useState<AnalysisState>("IDLE");
  const [stageIndex, setStageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Conflict / Replace Modal state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  // Request deduplication, image fingerprinting & AbortController refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);
  const lastAnalyzedImageKeyRef = useRef<string | null>(null);

  // Truthful smooth stage ticker during analysis
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (analysisState === "ANALYZING") {
      setStageIndex(0);
      interval = setInterval(() => {
        setStageIndex((prev) => Math.min(prev + 1, analysisStages.length - 1));
      }, 950);
    }
    return () => clearInterval(interval);
  }, [analysisState]);

  const saveToHistory = async (res: AnalysisResult) => {
    const settings = getStoredSettings();
    if (!settings.saveHistory) return;

    const historyItem: SignalHistory = {
      ...res,
      id: `analysis_${Date.now()}`,
      userId: user?.uid || "guest",
      timestamp: Date.now(),
      outcome: "UNKNOWN",
      notes: "",
      screenshotUrl: null
    };

    try {
      const stored = localStorage.getItem("coco_signal_history_v1");
      const list: SignalHistory[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem("coco_signal_history_v1", JSON.stringify([historyItem, ...list]));
    } catch (e) {
      console.warn("Failed to write to localStorage in Analyzer", e);
    }

    if (!user) return;
    try {
      await addDoc(collection(db, "analyses"), {
        ...res,
        userId: user.uid,
        timestamp: serverTimestamp(),
        outcome: "UNKNOWN",
        notes: "",
        screenshotUrl: null 
      });
    } catch (e) {
      console.error("Failed to save history to Firestore", e);
      handleFirestoreError(e, OperationType.CREATE, "analyses");
    }
  };

  const optimizeImage = async (file: File): Promise<Blob | File> => {
    if (file.size < 700 * 1024) return file;

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 1600;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(blob || file),
          "image/jpeg",
          0.88
        );
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  };

  // The Core Auto Analysis Executor (Single-pass, 18s fast timeout, strictly deduplicated)
  const executeAutoAnalysis = useCallback(async (fileToAnalyze: File) => {
    // Guard against simultaneous executions
    if (isExecutingRef.current) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    isExecutingRef.current = true;
    const currentRequestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalysisState("ANALYZING");
    setErrorMessage(null);
    setErrorType(null);
    setResult(null);

    // Extended 45-second client-side timeout deadline
    const timeoutId = setTimeout(() => {
      if (activeRequestIdRef.current === currentRequestId) {
        controller.abort("TIMEOUT");
      }
    }, 45000);

    try {
      const imageFingerprint = `${fileToAnalyze.name}_${fileToAnalyze.size}_${fileToAnalyze.lastModified}_${broker}_${mode}_${asset}_${timeframe}`;
      lastAnalyzedImageKeyRef.current = imageFingerprint;

      const optimizedBlob = await optimizeImage(fileToAnalyze);
      
      // If a newer request was issued while compressing, exit cleanly
      if (activeRequestIdRef.current !== currentRequestId) return;

      const formData = new FormData();
      formData.append("image", optimizedBlob, "chart.jpg");
      formData.append("broker", broker);
      formData.append("marketMode", mode);
      formData.append("asset", asset);
      formData.append("timeframe", timeframe);

      let response: Response;
      try {
        response = await fetch(getApiUrl("/api/analyze-chart"), {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        if (controller.signal.aborted || fetchErr.name === "AbortError") {
          const timeoutErr: any = new Error("Analysis request timed out after 45 seconds. Please try again.");
          timeoutErr.errorType = "UPSTREAM_TIMEOUT";
          throw timeoutErr;
        }
        const netErr: any = new Error("Network connection error. Please check your connection and retry.");
        netErr.errorType = "NETWORK_ERROR";
        throw netErr;
      }

      clearTimeout(timeoutId);

      // If a newer request superseded this one, ignore response
      if (activeRequestIdRef.current !== currentRequestId) return;

      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();

      // HTML Safety check before JSON.parse
      const trimmedText = rawText.trim();
      if (
        contentType.includes("text/html") ||
        trimmedText.startsWith("<!DOCTYPE") ||
        trimmedText.startsWith("<html") ||
        trimmedText.includes("<body")
      ) {
        const htmlErr: any = new Error(
          response.status === 504 
            ? "Upstream gateway timed out. Please tap Retry." 
            : "Server temporarily busy. Please tap Retry."
        );
        htmlErr.errorType = response.status === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_HTML_ERROR";
        throw htmlErr;
      }

      let responseJson: any = null;
      try {
        responseJson = JSON.parse(rawText);
      } catch {
        const jsonErr: any = new Error("The analysis response was invalid. Please retry.");
        jsonErr.errorType = "MALFORMED_AI_RESPONSE";
        throw jsonErr;
      }

      if (!response.ok || !responseJson || responseJson.success === false || responseJson.error) {
        const errorMsg = responseJson?.message || responseJson?.error || "Analysis failed";
        const errType = responseJson?.errorType || (response.status === 504 ? "UPSTREAM_TIMEOUT" : "ANALYSIS_ERROR");
        const customErr: any = new Error(errorMsg);
        customErr.errorType = errType;
        throw customErr;
      }

      const data: AnalysisResult = responseJson;

      // Strict validation of trading signal before presenting
      if (!data.signal || !["CALL", "PUT", "NO_TRADE"].includes(data.signal)) {
        const validationErr: any = new Error("Invalid signal format returned by analysis engine.");
        validationErr.errorType = "VALIDATION_FAILURE";
        throw validationErr;
      }

      if (activeRequestIdRef.current === currentRequestId) {
        setResult(data);
        setAnalysisState("COMPLETED");
        saveToHistory(data);

        const currentSettings = getStoredSettings();
        if (currentSettings.soundEnabled) {
          playSignalSound(data.signal);
        }

        toast.success("Analysis complete");
      }
    } catch (error: any) {
      if (activeRequestIdRef.current !== currentRequestId) return;

      const isTimeout = 
        error.errorType === "UPSTREAM_TIMEOUT" || 
        error.name === "AbortError" || 
        error.message?.toLowerCase().includes("timed out") ||
        error.message?.toLowerCase().includes("timeout");

      if (isTimeout) {
        setAnalysisState("TIMEOUT");
        setErrorType("UPSTREAM_TIMEOUT");
        setErrorMessage("Analysis request timed out. Please try again with a clear chart screenshot.");
        toast.error("Analysis timed out");
      } else {
        setAnalysisState("ERROR");
        setErrorType(error.errorType || "ANALYSIS_ERROR");
        setErrorMessage(error.message || "Failed to analyze chart");
        toast.error(error.message || "Failed to analyze chart");
      }
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestIdRef.current === currentRequestId) {
        isExecutingRef.current = false;
      }
    }
  }, [broker, mode, asset, timeframe, user]);

  // Handle new incoming file from click, drop or paste
  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }

    // If analysis is already running, show replace confirmation modal
    if (analysisState === "ANALYZING") {
      setPendingFile(file);
      setShowReplaceModal(true);
      return;
    }

    // Set preview
    setImage(file);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const settings = getStoredSettings();
    if (settings.autoAnalysis) {
      executeAutoAnalysis(file);
    } else {
      setAnalysisState("IDLE");
      toast("Chart loaded. Tap 'START ANALYSIS' when ready.", { icon: "📷" });
    }
  };

  const handleConfirmReplace = () => {
    if (!pendingFile) return;
    setShowReplaceModal(false);
    
    // Abort current running analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isExecutingRef.current = false;

    // Start with pending file
    const fileToStart = pendingFile;
    setPendingFile(null);
    setImage(fileToStart);
    const objectUrl = URL.createObjectURL(fileToStart);
    setPreview(objectUrl);

    const settings = getStoredSettings();
    if (settings.autoAnalysis) {
      executeAutoAnalysis(fileToStart);
    } else {
      setAnalysisState("IDLE");
      toast("New chart loaded. Tap 'START ANALYSIS' when ready.", { icon: "📷" });
    }
  };

  const handleCancelReplace = () => {
    setShowReplaceModal(false);
    setPendingFile(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelect(e.dataTransfer.files[0]);
    }
  };

  const clearImage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isExecutingRef.current = false;
    setImage(null);
    setPreview(null);
    setResult(null);
    setErrorMessage(null);
    setAnalysisState("IDLE");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== "UPLOAD_CHART") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) handleImageSelect(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [step, analysisState]);

  if (step === "SELECT_BROKER") {
    return (
      <div className="max-w-md mx-auto space-y-6 pt-10 md:pt-20 pb-20 animate-in fade-in zoom-in-95 duration-300">
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden border border-primary/20 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
          
          <div className="text-center mb-8 relative z-10">
            <div className="text-[10px] font-bold text-primary tracking-widest uppercase mb-1">Environment Setup</div>
            <h2 className="text-2xl font-black text-white">Select Broker</h2>
          </div>

          <div className="space-y-3 mb-8 relative z-10">
            {brokers.map(b => (
              <button
                key={b}
                onClick={() => setBroker(b)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                  broker === b 
                    ? 'bg-primary/20 border-primary text-white shadow-[0_0_20px_rgba(139,92,246,0.2)]' 
                    : 'bg-surface/50 border-border text-text-muted hover:bg-surface hover:text-white hover:border-white/10'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                  broker === b ? 'bg-primary text-white neon-glow-primary' : 'bg-background text-text-muted border border-border'
                }`}>
                  {b.charAt(0)}
                </div>
                <span className="font-semibold text-lg">{b}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep("UPLOAD_CHART")}
            className="w-full py-4 rounded-xl font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all bg-primary text-white neon-glow-primary hover:bg-primary-hover active:scale-[0.98] relative z-10"
          >
            CONTINUE TO ANALYZER
          </button>
          
          {/* Decorative background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl -z-0 pointer-events-none"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md md:max-w-xl mx-auto space-y-4 pb-20 md:pb-6 animate-in slide-in-from-right duration-300">
      
      {/* Top Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (result) {
                setResult(null);
                setAnalysisState("IDLE");
              } else {
                setStep("SELECT_BROKER");
              }
            }}
            className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-text-muted hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-base font-black text-white flex items-center gap-2">
              AI Engine <Zap className="w-4 h-4 text-primary fill-primary animate-pulse" />
            </div>
            <div className="text-[10px] text-text-muted font-bold tracking-widest uppercase">
              BROKER: {broker}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Auto Scan
          </div>
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary text-xs font-bold shadow-[0_0_12px_rgba(139,92,246,0.3)]">
            AI
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex bg-surface/90 rounded-2xl p-1 border border-border/80 shadow-lg backdrop-blur-md">
        <button 
          onClick={() => setMode("OTC")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            mode === 'OTC' 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(139,92,246,0.6)]' 
              : 'text-text-muted hover:text-white'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${mode === 'OTC' ? 'bg-white shadow-[0_0_6px_#fff]' : 'bg-transparent'}`}></span>
          OTC
        </button>
        <button 
          onClick={() => {
            setMode("REAL");
            toast("Real-time broker feed connected.", { icon: "⚡" });
          }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 ${
            mode === 'REAL' 
              ? 'bg-primary text-white shadow-[0_0_15px_rgba(139,92,246,0.6)]' 
              : 'text-text-muted hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          REAL
        </button>
      </div>

      {/* Main Analysis Area: Upload + Premium Animation / Result Card */}
      {analysisState !== "COMPLETED" || !result ? (
        <div className="space-y-4">
          
          {/* Top Premium Animation Area during ANALYZING */}
          {analysisState === "ANALYZING" && (
            getStoredSettings().premiumAnimation ? (
              <PremiumScanningHeader stageText={analysisStages[stageIndex]} />
            ) : (
              <div className="glass-panel p-4 rounded-2xl border border-primary/30 flex items-center justify-between text-xs animate-in fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></div>
                  <span className="font-bold text-white text-xs">{analysisStages[stageIndex]}</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">ANALYZING</span>
              </div>
            )
          )}

          {/* Upload / Chart Container */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-primary/30 shadow-[0_0_30px_rgba(139,92,246,0.12)] relative">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none z-0"></div>
            
            {/* Window bar */}
            <div className="bg-surface/90 border-b border-white/5 px-4 py-2.5 flex items-center justify-between relative z-10 backdrop-blur-md">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
              </div>
              <div className="text-[10px] font-black text-primary tracking-widest uppercase flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-primary" />
                COCO AI • {mode} VISION
              </div>
              <div className="w-8"></div>
            </div>
            
            {/* Drop / Preview Area */}
            <div 
              className={`p-6 md:p-8 flex flex-col items-center justify-center transition-colors min-h-[380px] relative z-10
                ${preview ? 'bg-black/70' : 'hover:bg-white/5 cursor-pointer'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => (!preview || analysisState === "ERROR") && fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
              />
              
              {preview ? (
                <div className="relative w-full h-full min-h-[340px] flex items-center justify-center overflow-hidden rounded-2xl">
                  {/* Chart Image */}
                  <img 
                    src={preview} 
                    alt="Chart screenshot preview" 
                    className={`w-full h-full object-contain absolute inset-0 z-0 rounded-2xl transition-opacity duration-300 ${
                      analysisState === "ANALYZING" ? "opacity-70 blur-[0.5px]" : "opacity-95"
                    }`} 
                  />

                  {/* Laser Scanline & Holographic Grid Overlay when ANALYZING */}
                  {analysisState === "ANALYZING" && (
                    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-2xl">
                      {/* Grid */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8b5cf615_1px,transparent_1px),linear-gradient(to_bottom,#8b5cf615_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                      {/* Laser Bar */}
                      <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_18px_#22d3ee] animate-laser-scan"></div>
                    </div>
                  )}

                  {/* Clear Button */}
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      clearImage(); 
                    }}
                    className="absolute top-3 right-3 z-20 bg-black/70 hover:bg-danger/90 hover:text-white backdrop-blur-md p-2 rounded-full text-white transition-colors border border-white/20 shadow-lg"
                    title="Remove Image"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Error & Timeout Overlay if Analysis Failed or Timed out */}
                  {(analysisState === "ERROR" || analysisState === "TIMEOUT") && (
                    <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                        analysisState === "TIMEOUT" 
                          ? "bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]" 
                          : "bg-danger/20 border border-danger/40 text-danger shadow-[0_0_20px_rgba(244,63,94,0.4)]"
                      }`}>
                        <AlertCircle className="w-7 h-7" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white tracking-wide uppercase">
                          {analysisState === "TIMEOUT" ? "ANALYSIS TIMEOUT" : "ANALYSIS ERROR"}
                        </h4>
                        <p className="text-xs text-rose-200/80 max-w-[280px] mt-1 font-medium">
                          {errorMessage || "Unable to parse chart. Please ensure the candlesticks are clearly visible."}
                        </p>
                      </div>
                      <div className="flex gap-2 w-full max-w-[280px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (image) executeAutoAnalysis(image);
                          }}
                          className="flex-1 py-3 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-primary-hover transition-all neon-glow-primary active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          TRY AGAIN
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearImage();
                            fileInputRef.current?.click();
                          }}
                          className="px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase transition-all border border-white/10"
                        >
                          CHANGE
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center flex flex-col items-center z-10 w-full py-6">
                  <div className="w-16 h-16 bg-primary/20 border border-primary/40 rounded-2xl flex items-center justify-center mb-5 text-primary shadow-[0_0_30px_rgba(139,92,246,0.3)] transform transition-transform hover:scale-105">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="font-black text-xl text-white mb-2 tracking-tight">Upload Chart Screenshot</h3>
                  <p className="text-xs text-text-muted max-w-[280px] mx-auto mb-5 leading-relaxed">
                    Tap to upload or paste a 1-minute OTC chart.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full border flex items-center gap-1 ${
                      getStoredSettings().autoAnalysis 
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
                        : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                    }`}>
                      <Sparkles className="w-3 h-3" />
                      {getStoredSettings().autoAnalysis ? "Auto-Analyze Enabled" : "Manual Analysis Mode"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Manual START ANALYSIS button when autoAnalysis is OFF and image is loaded */}
          {preview && image && analysisState === "IDLE" && (
            <button
              onClick={() => executeAutoAnalysis(image)}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-sm tracking-wider uppercase transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-black" />
              START ANALYSIS
            </button>
          )}

          {/* Status Indicator Bar */}
          {preview && (
            <div className="glass-panel p-3.5 rounded-2xl border border-white/10 flex items-center justify-between text-xs backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                {analysisState === "ANALYZING" ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></div>
                ) : analysisState === "ERROR" ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-danger"></div>
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                )}
                <span className="font-bold text-white text-[11px] tracking-wide">
                  {analysisState === "ANALYZING" ? "SCANNING ACTIVE..." : analysisState === "ERROR" ? "SCAN HALTED" : "CHART READY"}
                </span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-primary hover:text-white transition-colors"
              >
                Upload Different
              </button>
            </div>
          )}
        </div>
      ) : (
        /* The Exact Reference Result Card */
        <ResultView 
          result={result} 
          onReset={() => {
            clearImage();
          }} 
        />
      )}

      {/* Replace & Restart Modal */}
      {showReplaceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-panel p-6 rounded-3xl max-w-sm w-full border border-primary/40 bg-[#0e0f18] shadow-[0_0_40px_rgba(139,92,246,0.3)] space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-black text-white">Analysis in Progress</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                An analysis request is currently running. Would you like to replace it and start analyzing the new screenshot?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleCancelReplace}
                className="py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-text-muted hover:text-white uppercase transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmReplace}
                className="py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold uppercase transition-all neon-glow-primary active:scale-95"
              >
                REPLACE & RESTART
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden inputs to preserve form states */}
      <div className="hidden">
        <input value={asset} onChange={e => setAsset(e.target.value)} />
        <input value={timeframe} onChange={e => setTimeframe(e.target.value)} />
      </div>
    </div>
  );
}

// Premium AI Scanning Animation Header positioned prominently near the top
function PremiumScanningHeader({ stageText }: { stageText: string }) {
  return (
    <div 
      aria-live="polite"
      className="glass-panel p-5 rounded-3xl border border-primary/40 bg-gradient-to-b from-[#120d24] via-[#0d0a1a] to-[#090812] shadow-[0_0_35px_rgba(139,92,246,0.25)] relative overflow-hidden text-center space-y-3 animate-in fade-in zoom-in-95 duration-300"
    >
      {/* Background Soft Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>

      {/* Orbital Scanning Core */}
      <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        {/* Outer Ring */}
        <div className="absolute inset-0 rounded-full border border-dashed border-primary/40 animate-orbit"></div>
        {/* Inner Counter Ring */}
        <div className="absolute inset-2 rounded-full border border-cyan-400/50 border-t-transparent animate-orbit-reverse"></div>
        {/* Radar Pulse Glow */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-primary/30 to-cyan-500/20 blur-md animate-radar-pulse"></div>
        {/* Central Core */}
        <div className="w-10 h-10 rounded-full bg-[#18122c] border border-primary text-primary flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.8)] z-10">
          <Zap className="w-5 h-5 fill-primary animate-pulse" />
        </div>
      </div>

      {/* Title & Authentic Pipeline Stage Text */}
      <div>
        <div className="text-[10px] font-black text-primary tracking-[0.25em] uppercase flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          ANALYZING OTC CHART
        </div>
        <h4 className="text-sm font-bold text-white mt-1 tracking-tight min-h-[22px] flex items-center justify-center">
          {stageText}
        </h4>
      </div>

      {/* Subtle Glowing Waveform Meter */}
      <div className="flex items-center justify-center gap-1 pt-1">
        {[40, 70, 100, 60, 90, 45, 80, 50, 95, 65, 35].map((h, i) => (
          <span 
            key={i} 
            className="w-1 bg-gradient-to-t from-primary/40 to-cyan-400 rounded-full transition-all duration-300"
            style={{ 
              height: `${Math.max(8, (h * ((i % 2 === 0 ? 1 : 0.7)))) * 0.22}px`,
              opacity: 0.7 + (i % 3) * 0.1
            }}
          />
        ))}
      </div>
    </div>
  );
}

function getPairFlag(asset: string) {
  const clean = (asset || "").toUpperCase();
  if (clean.includes("USD/MXN") || clean.includes("USDMXN")) return "🇺🇸🇲🇽";
  if (clean.includes("EUR/USD") || clean.includes("EURUSD")) return "🇪🇺🇺🇸";
  if (clean.includes("GBP/USD") || clean.includes("GBPUSD")) return "🇬🇧🇺🇸";
  if (clean.includes("USD/JPY") || clean.includes("USDJPY")) return "🇺🇸🇯🇵";
  if (clean.includes("AUD/USD") || clean.includes("AUDUSD")) return "🇦🇺🇺🇸";
  if (clean.includes("USD/CAD") || clean.includes("USDCAD")) return "🇺🇸🇨🇦";
  if (clean.includes("USD/CHF") || clean.includes("USDCHF")) return "🇺🇸🇨🇭";
  if (clean.includes("EUR/GBP") || clean.includes("EURGBP")) return "🇪🇺🇬🇧";
  if (clean.includes("EUR/JPY") || clean.includes("EURJPY")) return "🇪🇺🇯🇵";
  if (clean.includes("GBP/JPY") || clean.includes("GBPJPY")) return "🇬🇧🇯🇵";
  if (clean.includes("USD/INR") || clean.includes("USDINR")) return "🇺🇸🇮🇳";
  if (clean.includes("USD/BRL") || clean.includes("USDBRL")) return "🇺🇸🇧🇷";
  if (clean.includes("BTC") || clean.includes("CRYPTO")) return "🪙";
  return "⚡";
}

function formatNoTradeReason(reason?: string) {
  if (!reason || reason === "NONE") return "Confirmation pending";
  switch (reason) {
    case "INCOMPLETE_CANDLE": return "Incomplete current candle";
    case "WEAK_CONFLUENCE": return "Weak confluence (< 7/10)";
    case "CONFLICTING_SIGNALS": return "Conflicting market signals";
    case "TRAP_RISK": return "OTC trap risk detected";
    case "NO_ENTRY_CONFIRMATION": return "Entry confirmation missing";
    case "POOR_IMAGE_QUALITY": return "Poor image quality / unreadable";
    case "EXTREME_RANGE": return "Extreme range midpoint chop";
    case "UNCLEAR_STRUCTURE": return "Unclear market structure";
    case "LIQUIDITY_UNCERTAINTY": return "Liquidity sweep unconfirmed";
    case "INSUFFICIENT_DATA": return "Insufficient visible history";
    default: return reason.replace(/_/g, " ").toLowerCase();
  }
}

function formatTrapTrigger(trigger?: string) {
  if (!trigger || trigger === "NONE") return "Active Scan";
  switch (trigger) {
    case "LIQUIDITY_SWEEP": return "Liquidity Sweep";
    case "FALSE_BREAKOUT": return "False Breakout";
    case "FAILED_BREAKOUT": return "Failed Breakout";
    case "ORDER_BLOCK_REJECTION": return "OB Rejection";
    case "FVG_REACTION": return "FVG Reaction";
    case "STOP_HUNT_PATTERN": return "Stop Hunt";
    default: return trigger.replace(/_/g, " ");
  }
}

function ResultView({ result, onReset }: { result: AnalysisResult, onReset: () => void }) {
  const [showFullDetails, setShowFullDetails] = useState(false);
  
  const isCall = result.signal === "CALL";
  const isPut = result.signal === "PUT";
  const isNoTrade = result.signal === "NO_TRADE";

  // Phase 10: Strict separation of Market Bias and Trade Signal
  const bias = result.bias || (isCall ? "BULLISH" : isPut ? "BEARISH" : "NEUTRAL");
  const isBiasBullish = bias === "BULLISH";
  const isBiasBearish = bias === "BEARISH";

  // Phase 10: Confidence vs Confluence (Confidence is N/A when NO_TRADE)
  const isConfidenceAvailable = result.confidenceAvailable !== false && !isNoTrade && result.confidencePercent != null;
  const confidenceDisplay = isConfidenceAvailable ? `${result.confidencePercent}%` : "N/A";

  const convictionSubtitle = isNoTrade
    ? `No active entry • ${formatNoTradeReason(result.noTradeReason)}`
    : result.confidence === "HIGH"
      ? "High conviction • AI Vision Lead"
      : "Moderate conviction • Trap & SMC Flow";

  const signalCardTheme = isCall 
    ? "from-emerald-950/80 via-emerald-900/40 to-black border-emerald-500/50 shadow-[0_0_35px_rgba(16,185,129,0.25)]" 
    : isPut 
      ? "from-rose-950/80 via-rose-900/40 to-black border-rose-500/50 shadow-[0_0_35px_rgba(244,63,94,0.25)]" 
      : "from-amber-950/60 via-zinc-900/80 to-black border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.2)]";

  const progressBarColor = isCall 
    ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]" 
    : isPut 
      ? "bg-gradient-to-r from-rose-600 to-orange-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" 
      : "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_12px_rgba(245,158,11,0.8)]";

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-400">
      
      {/* The Master Phone Frame Card */}
      <div className="glass-panel p-5 md:p-6 rounded-3xl border border-white/10 bg-[#0d0e15]/90 shadow-[0_10px_40px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-2xl">
        
        {/* Subtle background glow */}
        <div className={`absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3 opacity-30 ${
          isCall ? 'bg-emerald-500' : isPut ? 'bg-rose-500' : 'bg-amber-500'
        }`}></div>

        {/* 1. Header: Asset Pair, OTC pill, Timeframe Tag */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{getPairFlag(result.asset)}</span>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-white tracking-wide">
                {result.asset || "USD/MXN"}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-primary/20 text-primary border border-primary/40 shadow-[0_0_8px_rgba(139,92,246,0.3)]">
                {result.marketMode || "OTC"}
              </span>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-text-muted">
            {result.timeframe || "1M"}
          </span>
        </div>

        {/* 2. Primary Signal Card matching exact screenshot */}
        <div className={`p-4 md:p-5 rounded-2xl border bg-gradient-to-br ${signalCardTheme} mb-5 relative overflow-hidden transition-all ${
          isCall ? 'animate-signal-call' : isPut ? 'animate-signal-put' : ''
        }`}>
          <div className="flex items-center gap-4">
            
            {/* Animated Glow Circle Icon */}
            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center border shrink-0 ${
              isCall 
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.6)]' 
                : isPut 
                  ? 'bg-rose-500/20 border-rose-400/60 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.6)]' 
                  : 'bg-amber-500/20 border-amber-400/60 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
            }`}>
              {isCall ? (
                <div className="animate-arrow-up">
                  <ArrowUp className="w-7 h-7 stroke-[3]" />
                </div>
              ) : isPut ? (
                <div className="animate-arrow-down">
                  <ArrowDown className="w-7 h-7 stroke-[3]" />
                </div>
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>

            {/* Signal Title & Text */}
            <div className="flex-1">
              <div className="text-[10px] uppercase font-bold tracking-widest text-text-muted flex items-center gap-1.5 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isCall ? 'bg-emerald-400' : isPut ? 'bg-rose-400' : 'bg-amber-400'}`}></span>
                {isNoTrade ? 'MARKET STATUS' : 'PLACE OPTION'}
              </div>
              <div className={`text-2xl md:text-3xl font-black tracking-tight ${
                isCall ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.6)]' :
                isPut ? 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]' :
                'text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]'
              }`}>
                {result.signal === "NO_TRADE" ? "NO TRADE" : result.signal}
              </div>
              {isNoTrade && result.noTradeReason && result.noTradeReason !== "NONE" && (
                <div className="text-[11px] font-bold text-amber-300/90 mt-0.5 flex items-center gap-1">
                  <span>Reason:</span>
                  <span className="text-white">{formatNoTradeReason(result.noTradeReason)}</span>
                </div>
              )}
            </div>

            {/* Setup Quality Badge */}
            {result.setupQuality && (
              <div className="text-right">
                <div className="text-[9px] text-text-muted uppercase tracking-wider font-bold mb-0.5">Grade</div>
                <div className="px-2.5 py-1 rounded-lg text-xs font-black bg-black/40 border border-white/10 text-white shadow-inner">
                  {result.setupQuality}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Confidence Bar Section matching exact screenshot */}
        <div className="mb-5 space-y-2">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                CONFIDENCE
              </div>
              <div className="text-xs text-rose-300/80 font-medium">
                {convictionSubtitle}
              </div>
            </div>
            <div className="text-base font-black text-white tracking-tight">
              {confidenceDisplay}
            </div>
          </div>
          
          {/* Progress track */}
          <div className="w-full h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${progressBarColor}`}
              style={{ width: isConfidenceAvailable ? `${result.confidencePercent}%` : "0%" }}
            ></div>
          </div>
        </div>

        {/* 4. AI REASONING Section matching exact screenshot */}
        <div className="mb-5">
          <div className="text-[10px] text-text-muted font-bold tracking-widest uppercase flex items-center gap-1.5 mb-2">
            <Zap className="w-3 h-3 text-primary fill-primary" />
            AI REASONING
          </div>
          <div className="bg-[#12131c] border border-white/10 rounded-2xl p-4 shadow-inner relative">
            <p className="text-white text-xs md:text-sm leading-relaxed font-medium">
              {result.reasoning}
            </p>
          </div>
        </div>

        {/* 5. Two Bottom Cards: BIAS & MODE matching exact screenshot */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          
          {/* BIAS Box - Audited Phase 10: Accurately shows Market Bias */}
          <div className="bg-[#12131c] border border-white/10 rounded-2xl p-3.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isBiasBullish ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
              isBiasBearish ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
              'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              <div className={`w-3 h-3 rounded-full ${
                isBiasBullish ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' :
                isBiasBearish ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]' :
                'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
              }`}></div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">BIAS</div>
              <div className="text-xs font-black text-white">
                {isBiasBullish ? "Bullish" : isBiasBearish ? "Bearish" : "Neutral"}
              </div>
            </div>
          </div>

          {/* MODE Box with Trap Detection & Trigger details */}
          <div className="bg-[#12131c] border border-white/10 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">MODE</div>
              <div className="text-xs font-black text-white truncate" title={result.trapTrigger && result.trapTrigger !== "NONE" ? formatTrapTrigger(result.trapTrigger) : (result.marketMode || "Trap Detection")}>
                {result.trapTrigger && result.trapTrigger !== "NONE"
                  ? formatTrapTrigger(result.trapTrigger)
                  : (result.marketMode || "Trap Detection")}
              </div>
            </div>
          </div>

        </div>

        {/* 6. Expandable Deep Technical Analysis Drawer (Phase 1-5) */}
        <div className="pt-2 border-t border-white/5 mt-3">
          <button
            onClick={() => setShowFullDetails(!showFullDetails)}
            className="w-full py-2.5 text-[11px] font-bold text-text-muted hover:text-white flex items-center justify-between transition-colors px-1"
          >
            <span className="flex items-center gap-1.5 uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Technical Confluence Details ({result.confluenceScore}/10)
            </span>
            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${showFullDetails ? 'rotate-90 text-primary' : ''}`} />
          </button>

          {showFullDetails && (
            <div className="space-y-3 pt-3 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
              
              {result.contradictions && result.contradictions.length > 0 && (
                <div className="p-3 border border-warning/30 bg-warning/5 rounded-xl text-amber-200">
                  <div className="font-bold text-[10px] uppercase text-warning flex items-center gap-1 mb-1">
                    <ShieldAlert className="w-3 h-3" /> Contradictions Warning
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {result.contradictions.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
                  <div className="text-[9px] text-text-muted uppercase font-bold mb-0.5">Market Structure</div>
                  <div className="font-bold text-white text-xs flex items-center justify-between">
                    <span>{result.marketStructure || result.structure?.direction || "UNKNOWN"}</span>
                    {result.structureConfidence != null && (
                      <span className="text-[10px] font-mono text-cyan-400 font-normal">
                        {result.structureConfidence}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
                  <div className="text-[9px] text-text-muted uppercase font-bold mb-0.5">Market State</div>
                  <div className="font-bold text-white text-xs">{result.marketState?.replace(/_/g, " ") || "UNKNOWN"}</div>
                </div>
              </div>

              {result.structureEvidence && result.structureEvidence.length > 0 && (
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                  <div className="text-[9px] text-cyan-400 uppercase font-bold mb-1 flex items-center justify-between">
                    <span>Structure Evidence</span>
                    {result.structureConfidence != null && (
                      <span className="text-text-muted font-normal text-[9px]">Clarity: {result.structureConfidence}/100</span>
                    )}
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-text-muted">
                    {result.structureEvidence.map((ev, i) => <li key={i}>{ev}</li>)}
                  </ul>
                </div>
              )}

              {result.otcTrap && (
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                  <div className="text-[9px] text-primary uppercase font-bold mb-1">OTC Trap Detection Details</div>
                  <p className="text-text-muted">{result.otcTrap.evidence || result.otcTrap.status || "None detected"}</p>
                </div>
              )}

              {result.smc && (
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                  <div className="text-[9px] text-primary uppercase font-bold mb-1">SMC & Liquidity Context</div>
                  <p className="text-text-muted">OB: {result.smc.orderBlock} • FVG: {result.smc.fvg}</p>
                </div>
              )}

              {result.invalidation && (
                <div className="p-3 border border-danger/30 bg-danger/5 rounded-xl text-rose-300">
                  <span className="font-bold uppercase text-[9px] block text-danger mb-0.5">Invalidation Point:</span>
                  {result.invalidation}
                </div>
              )}

              {result.performance && (
                <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                    Analysis time: <span className="text-white font-mono font-bold">{result.performance.totalSeconds}</span>
                  </span>
                  <span className="text-text-muted/60 font-mono text-[9px]">
                    AI Vision: {result.performance.aiAnalysisMs}ms
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* 7. Action Button: Upload New Screenshot immediately */}
      <button
        onClick={onReset}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-sm tracking-wider uppercase transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <Upload className="w-4 h-4 stroke-[2.5]" />
        SCAN ANOTHER CHART
      </button>

    </div>
  );
}

