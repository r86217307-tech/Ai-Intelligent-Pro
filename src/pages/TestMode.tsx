import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  FlaskConical, Upload, X, ShieldAlert, Zap, ArrowUp, ArrowDown, 
  RefreshCw, AlertCircle, Sparkles, CheckCircle2, XCircle, HelpCircle, 
  Trash2, Filter, BarChart3, ChevronDown, ChevronUp, Clock, History as HistoryIcon,
  Layers, Compass, Flame, Shield, Check, Info
} from "lucide-react";
import toast from "react-hot-toast";
import { 
  collection, addDoc, query, where, getDocs, orderBy, updateDoc, doc, deleteDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { AnalysisResult, TestRecord } from "../types";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl } from "../lib/api";

type TestState = "IDLE" | "ANALYZING" | "AWAITING_RESULT" | "COMPLETED" | "ERROR";

const analysisStages = [
  "Reading chart & validating resolution...",
  "Mapping visible candles & market structure...",
  "Scanning liquidity, sweeps & OTC traps...",
  "Checking SMC & price action confluence...",
  "Running contradiction filter & finalizing test signal..."
];

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

export default function TestMode() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"LAB" | "HISTORY">("LAB");

  // Config
  const [broker, setBroker] = useState("Quotex");
  const [mode, setMode] = useState<"OTC" | "REAL">("OTC");
  const [asset, setAsset] = useState("USD/MXN_OTC");
  const [timeframe, setTimeframe] = useState("M1");

  // Upload & Active State
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [testState, setTestState] = useState<TestState>("IDLE");
  const [stageIndex, setStageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRecord, setActiveRecord] = useState<TestRecord | null>(null);
  const [showFullDetails, setShowFullDetails] = useState(false);

  // History & Stats State
  const [testHistory, setTestHistory] = useState<TestRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterType, setFilterType] = useState<"ALL" | "CALL" | "PUT" | "NO_TRADE" | "CORRECT" | "WRONG" | "INVALID">("ALL");
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<TestRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Replace Confirmation Modal State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  // Request deduplication & AbortController refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);

  // Stage animation ticker
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (testState === "ANALYZING") {
      setStageIndex(0);
      interval = setInterval(() => {
        setStageIndex((prev) => Math.min(prev + 1, analysisStages.length - 1));
      }, 950);
    }
    return () => clearInterval(interval);
  }, [testState]);

  // Load Test History
  const fetchTestHistory = useCallback(async () => {
    setLoadingHistory(true);
    let localRecords: TestRecord[] = [];
    try {
      const stored = localStorage.getItem("coco_test_history_v1");
      if (stored) {
        localRecords = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to read test history from localStorage", e);
    }

    if (!user) {
      setTestHistory(localRecords);
      setLoadingHistory(false);
      return;
    }

    try {
      const q = query(
        collection(db, "test_history"),
        where("userId", "==", user.uid),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(q);
      const fsData = snapshot.docs.map(d => {
        const docData = d.data();
        return {
          ...docData,
          id: d.id
        } as TestRecord;
      });

      const existingIds = new Set(fsData.map(d => d.id));
      const combined = [...fsData];
      for (const item of localRecords) {
        if (!existingIds.has(item.id)) {
          combined.push(item);
        }
      }
      setTestHistory(combined);
    } catch (err) {
      console.error("Failed to load test history from Firestore", err);
      setTestHistory(localRecords);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTestHistory();
  }, [fetchTestHistory]);

  const optimizeImage = async (file: File): Promise<Blob | File> => {
    if (file.size < 700 * 1024) return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file);
    });
  };

  // The Core Auto Analysis for Test Mode
  const executeAutoAnalysis = useCallback(async (fileToAnalyze: File) => {
    if (isExecutingRef.current) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    isExecutingRef.current = true;
    const currentRequestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTestState("ANALYZING");
    setErrorMessage(null);
    setActiveRecord(null);

    // Extended 45-second client-side timeout deadline
    const timeoutId = setTimeout(() => {
      if (activeRequestIdRef.current === currentRequestId) {
        controller.abort("TIMEOUT");
      }
    }, 45000);

    try {
      const optimizedBlob = await optimizeImage(fileToAnalyze);
      if (activeRequestIdRef.current !== currentRequestId) return;

      const formData = new FormData();
      formData.append("image", optimizedBlob, "chart.jpg");
      formData.append("broker", broker);
      formData.append("mode", mode);
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
          const timeoutErr: any = new Error("Analysis request timed out after 45 seconds. Please tap Try Again.");
          timeoutErr.errorType = "UPSTREAM_TIMEOUT";
          throw timeoutErr;
        }
        const netErr: any = new Error("Network connection error. Please check your connection and retry.");
        netErr.errorType = "NETWORK_ERROR";
        throw netErr;
      }

      clearTimeout(timeoutId);
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
            ? "Analysis service timed out. Please tap Try Again." 
            : "Server temporarily busy. Please tap Try Again."
        );
        htmlErr.errorType = response.status === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_HTML_ERROR";
        throw htmlErr;
      }

      let responseJson: any = null;
      try {
        responseJson = JSON.parse(rawText);
      } catch {
        const jsonErr: any = new Error("Invalid response received from analysis engine. Please tap Try Again.");
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

      // Strict validation of trading signal before creating a test record
      if (!data.signal || !["CALL", "PUT", "NO_TRADE"].includes(data.signal)) {
        const validationErr: any = new Error("Invalid signal format returned by analysis engine.");
        validationErr.errorType = "VALIDATION_FAILURE";
        throw validationErr;
      }

      if (activeRequestIdRef.current === currentRequestId) {
        let finalRecordId = `test_${Date.now()}`;

        const baseRecordData = {
          ...data,
          userId: user?.uid || "guest",
          timestamp: Date.now(),
          screenshotUrl: preview || null,
          actualResult: "PENDING" as "PENDING",
          testResult: (data.signal === "NO_TRADE" ? "NO_TRADE" : "PENDING") as ("NO_TRADE" | "PENDING"),
          status: (data.signal === "NO_TRADE" ? "COMPLETED" : "PENDING") as ("COMPLETED" | "PENDING"),
        };

        // Persist to separate test_history collection in Firestore
        if (user) {
          try {
            const docRef = await addDoc(collection(db, "test_history"), baseRecordData);
            finalRecordId = docRef.id;
          } catch (dbErr) {
            console.error("Failed to save initial test record to Firestore", dbErr);
          }
        }

        const initialRecord: TestRecord = {
          ...baseRecordData,
          id: finalRecordId,
        };

        // Sync with localStorage
        try {
          const stored = localStorage.getItem("coco_test_history_v1") || "[]";
          const list: TestRecord[] = JSON.parse(stored);
          const filtered = list.filter(t => t.id !== initialRecord.id);
          localStorage.setItem("coco_test_history_v1", JSON.stringify([initialRecord, ...filtered]));
        } catch (e) {
          console.warn("Failed to write to localStorage", e);
        }

        setActiveRecord(initialRecord);
        setTestHistory(prev => [initialRecord, ...prev.filter(t => t.id !== initialRecord.id)]);

        if (data.signal === "NO_TRADE") {
          setTestState("COMPLETED");
          toast("AI Analysis: NO TRADE condition detected", { icon: "⚠️" });
        } else {
          setTestState("AWAITING_RESULT");
          toast.success("Signal locked. Awaiting next candle result.");
        }
      }
    } catch (error: any) {
      if (activeRequestIdRef.current !== currentRequestId) return;
      setTestState("ERROR");
      if (error.name === "AbortError" || error.message?.includes("timed out")) {
        setErrorMessage("Analysis timed out. Network or AI engine took too long.");
        toast.error("Analysis timed out");
      } else {
        setErrorMessage(error.message || "Failed to analyze test chart");
        toast.error(error.message || "Failed to analyze test chart");
      }
    } finally {
      clearTimeout(timeoutId);
      if (activeRequestIdRef.current === currentRequestId) {
        isExecutingRef.current = false;
      }
    }
  }, [broker, mode, asset, timeframe, user, preview]);

  // Handle incoming file
  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file");
      return;
    }

    if (testState === "ANALYZING") {
      setPendingFile(file);
      setShowReplaceModal(true);
      return;
    }

    setImage(file);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    executeAutoAnalysis(file);
  };

  const handleConfirmReplace = () => {
    if (!pendingFile) return;
    setShowReplaceModal(false);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isExecutingRef.current = false;

    const fileToStart = pendingFile;
    setPendingFile(null);
    setImage(fileToStart);
    const objectUrl = URL.createObjectURL(fileToStart);
    setPreview(objectUrl);
    executeAutoAnalysis(fileToStart);
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

  // Submit Actual Result (UP / DOWN / INVALID)
  const handleSelectActualResult = async (actual: "UP" | "DOWN" | "INVALID") => {
    if (!activeRecord) return;

    let computedResult: "CORRECT" | "WRONG" | "NO_TRADE" | "INVALID" = "INVALID";
    let postReview = "";

    if (activeRecord.signal === "NO_TRADE") {
      computedResult = "NO_TRADE";
    } else if (actual === "INVALID") {
      computedResult = "INVALID";
      postReview = "Test flagged as invalid due to anomalous broker behavior or skipped candle.";
    } else if (activeRecord.signal === "CALL") {
      if (actual === "UP") {
        computedResult = "CORRECT";
      } else {
        computedResult = "WRONG";
        postReview = "Bullish setup failed. Market encountered higher timeframe resistance or swift OTC counter-rejection.";
      }
    } else if (activeRecord.signal === "PUT") {
      if (actual === "DOWN") {
        computedResult = "CORRECT";
      } else {
        computedResult = "WRONG";
        postReview = "Bearish setup failed. Demand zone absorption or OTC liquidity trap resulted in upward continuation.";
      }
    }

    const updatedRecord: TestRecord = {
      ...activeRecord,
      actualResult: actual,
      testResult: computedResult,
      status: actual === "INVALID" ? "INVALID" : "COMPLETED",
      postTestReview: postReview,
    };

    setActiveRecord(updatedRecord);
    setTestState("COMPLETED");

    // Update in Firestore
    if (user && activeRecord.id) {
      try {
        let targetDocId = activeRecord.id;
        if (targetDocId.startsWith("test_")) {
          const q = query(
            collection(db, "test_history"),
            where("userId", "==", user.uid)
          );
          const snapshot = await getDocs(q);
          const match = snapshot.docs.find(d => d.id === activeRecord.id || d.data().timestamp === activeRecord.timestamp);
          if (match) {
            targetDocId = match.id;
          }
        }

        if (!targetDocId.startsWith("test_")) {
          const ref = doc(db, "test_history", targetDocId);
          await updateDoc(ref, {
            actualResult: actual,
            testResult: computedResult,
            status: updatedRecord.status,
            postTestReview: postReview,
          });
          updatedRecord.id = targetDocId;
        }
      } catch (err) {
        console.error("Failed to update test record in Firestore", err);
      }
    }

    // Update local state and localStorage
    setTestHistory(prev => prev.map(t => t.id === activeRecord.id ? updatedRecord : t));
    try {
      const stored = localStorage.getItem("coco_test_history_v1");
      if (stored) {
        const list: TestRecord[] = JSON.parse(stored);
        const updatedList = list.map(t => (t.id === activeRecord.id || t.timestamp === activeRecord.timestamp) ? updatedRecord : t);
        localStorage.setItem("coco_test_history_v1", JSON.stringify(updatedList));
      }
    } catch (e) {
      console.warn("Failed to update test history in localStorage", e);
    }

    if (computedResult === "CORRECT") {
      toast.success("✓ Test evaluation: CORRECT", { icon: "🎯" });
    } else if (computedResult === "WRONG") {
      toast.error("✕ Test evaluation: WRONG", { icon: "❌" });
    } else if (computedResult === "NO_TRADE") {
      toast("NO TRADE state verified", { icon: "ℹ️" });
    } else {
      toast("Test marked as INVALID", { icon: "⚠️" });
    }
  };

  const startNewTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isExecutingRef.current = false;
    setImage(null);
    setPreview(null);
    setActiveRecord(null);
    setErrorMessage(null);
    setTestState("IDLE");
    setShowFullDetails(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteRecord = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setDeletingId(id);

    // 1. Instantly remove from React state
    setTestHistory(prev => prev.filter(t => t.id !== id));
    if (activeRecord?.id === id) {
      startNewTest();
    }
    if (selectedHistoryItem?.id === id) {
      setSelectedHistoryItem(null);
    }

    // 2. Instantly remove from localStorage
    try {
      const stored = localStorage.getItem("coco_test_history_v1");
      if (stored) {
        const list: TestRecord[] = JSON.parse(stored);
        const filtered = list.filter(t => t.id !== id);
        localStorage.setItem("coco_test_history_v1", JSON.stringify(filtered));
      }
    } catch (err) {
      console.warn("Failed to remove test history from localStorage", err);
    }

    // 3. Remove from Firestore if user logged in
    try {
      if (user) {
        let targetDocId = id;
        if (targetDocId.startsWith("test_")) {
          const q = query(
            collection(db, "test_history"),
            where("userId", "==", user.uid)
          );
          const snapshot = await getDocs(q);
          const itemInState = testHistory.find(t => t.id === id);
          const match = snapshot.docs.find(
            d => d.id === id || (itemInState && d.data().timestamp === itemInState.timestamp)
          );
          if (match) {
            targetDocId = match.id;
          }
        }

        if (!targetDocId.startsWith("test_")) {
          await deleteDoc(doc(db, "test_history", targetDocId));
        }
      }
    } catch (err) {
      console.warn("Could not delete record from Firestore", id, err);
    } finally {
      setDeletingId(null);
      toast.success("Test record deleted");
    }
  };

  const handleClearAllHistory = async () => {
    if (testHistory.length === 0) return;

    setLoadingHistory(true);

    // 1. Instantly clear React state & localStorage
    setTestHistory([]);
    setSelectedHistoryItem(null);
    try {
      localStorage.removeItem("coco_test_history_v1");
    } catch (e) {
      console.warn("Failed to clear test history from localStorage", e);
    }

    // 2. Clear Firestore collection for user
    try {
      if (user) {
        const q = query(
          collection(db, "test_history"),
          where("userId", "==", user.uid)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "test_history", d.id)));
        await Promise.all(deletePromises);
      }
    } catch (err) {
      console.error("Error clearing test history from Firestore", err);
    } finally {
      setLoadingHistory(false);
      toast.success("All test history records deleted");
    }
  };

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeTab !== "LAB") return;
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
  }, [activeTab, testState]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = testHistory.length;
    const correct = testHistory.filter(t => t.testResult === "CORRECT").length;
    const wrong = testHistory.filter(t => t.testResult === "WRONG").length;
    const noTrade = testHistory.filter(t => t.testResult === "NO_TRADE").length;
    const invalid = testHistory.filter(t => t.testResult === "INVALID").length;
    const valid = correct + wrong;

    const callTests = testHistory.filter(t => t.signal === "CALL");
    const callCorrect = callTests.filter(t => t.testResult === "CORRECT").length;
    const callWrong = callTests.filter(t => t.testResult === "WRONG").length;

    const putTests = testHistory.filter(t => t.signal === "PUT");
    const putCorrect = putTests.filter(t => t.testResult === "CORRECT").length;
    const putWrong = putTests.filter(t => t.testResult === "WRONG").length;

    const rate = valid > 0 ? ((correct / valid) * 100).toFixed(1) : "0.0";

    return {
      total,
      valid,
      correct,
      wrong,
      noTrade,
      invalid,
      callTotal: callTests.length,
      callCorrect,
      callWrong,
      putTotal: putTests.length,
      putCorrect,
      putWrong,
      rate
    };
  }, [testHistory]);

  const filteredHistory = useMemo(() => {
    return testHistory.filter(t => {
      if (filterType === "ALL") return true;
      if (filterType === "CALL") return t.signal === "CALL";
      if (filterType === "PUT") return t.signal === "PUT";
      if (filterType === "NO_TRADE") return t.signal === "NO_TRADE";
      if (filterType === "CORRECT") return t.testResult === "CORRECT";
      if (filterType === "WRONG") return t.testResult === "WRONG";
      if (filterType === "INVALID") return t.testResult === "INVALID";
      return true;
    });
  }, [testHistory, filterType]);

  return (
    <div className="max-w-md md:max-w-xl mx-auto space-y-4 pb-20 md:pb-6 animate-in slide-in-from-right duration-300">
      
      {/* Top Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-wide uppercase">TEST MODE</h2>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                LAB
              </span>
            </div>
            <p className="text-[11px] text-text-muted font-medium">Verify AI signals with next candle outcomes</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-surface/90 rounded-xl p-1 border border-border">
          <button
            onClick={() => setActiveTab("LAB")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "LAB" ? "bg-primary text-white shadow-md" : "text-text-muted hover:text-white"
            }`}
          >
            Active Lab
          </button>
          <button
            onClick={() => {
              setActiveTab("HISTORY");
              fetchTestHistory();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "HISTORY" ? "bg-primary text-white shadow-md" : "text-text-muted hover:text-white"
            }`}
          >
            <span>History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 text-white font-mono">
              {stats.total}
            </span>
          </button>
        </div>
      </div>

      {/* Main Tab: ACTIVE LAB */}
      {activeTab === "LAB" && (
        <div className="space-y-4">
          
          {/* Mode Switcher */}
          <div className="flex bg-surface/90 rounded-2xl p-1 border border-border/80 shadow-lg backdrop-blur-md">
            <button 
              onClick={() => setMode("OTC")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                mode === "OTC" 
                  ? "bg-primary text-white neon-glow-primary shadow-md" 
                  : "text-text-muted hover:text-white"
              }`}
            >
              OTC Market
            </button>
            <button 
              onClick={() => setMode("REAL")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                mode === "REAL" 
                  ? "bg-primary text-white neon-glow-primary shadow-md" 
                  : "text-text-muted hover:text-white"
              }`}
            >
              Real Market
            </button>
          </div>

          {/* Top Premium Animation Area during ANALYZING */}
          {testState === "ANALYZING" && (
            <TestScanningHeader stageText={analysisStages[stageIndex]} />
          )}

          {/* Upload / Test Area when no active test or during scanning */}
          {!activeRecord ? (
            <div className="glass-panel rounded-3xl overflow-hidden border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.15)] relative">
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent pointer-events-none z-0"></div>
              
              <div className="p-4 border-b border-border flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {broker} • {timeframe} TEST BENCH
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
                  ISOLATED LAB
                </div>
              </div>

              {/* Drop / Preview Area */}
              <div 
                className={`p-6 md:p-8 flex flex-col items-center justify-center transition-colors min-h-[360px] relative z-10
                  ${preview ? 'bg-black/70' : 'hover:bg-white/5 cursor-pointer'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => (!preview || testState === "ERROR") && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => e.target.files && handleImageSelect(e.target.files[0])} 
                  accept="image/*" 
                  className="hidden" 
                />

                {preview ? (
                  <div className="relative w-full h-full min-h-[320px] flex items-center justify-center overflow-hidden rounded-2xl">
                    <img 
                      src={preview} 
                      alt="Test chart preview" 
                      className={`w-full h-full object-contain absolute inset-0 z-0 rounded-2xl transition-opacity duration-300 ${
                        testState === "ANALYZING" ? "opacity-70 blur-[0.5px]" : "opacity-95"
                      }`} 
                    />

                    {testState === "ANALYZING" && (
                      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-2xl">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#6366f115_1px,transparent_1px),linear-gradient(to_bottom,#6366f115_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                        <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_18px_#818cf8] animate-laser-scan"></div>
                      </div>
                    )}

                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        startNewTest(); 
                      }}
                      className="absolute top-3 right-3 z-20 bg-black/70 hover:bg-danger/90 hover:text-white backdrop-blur-md p-2 rounded-full text-white transition-colors border border-white/20 shadow-lg"
                      title="Remove Image"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {testState === "ERROR" && (
                      <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-danger/20 border border-danger/40 flex items-center justify-center text-danger shadow-[0_0_20px_rgba(244,63,94,0.4)]">
                          <AlertCircle className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-white tracking-wide uppercase">TEST ANALYSIS FAILED</h4>
                          <p className="text-xs text-rose-200/80 max-w-[280px] mt-1 font-medium">
                            {errorMessage || "Unable to parse test chart screenshot."}
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
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center flex flex-col items-center z-10 w-full py-6">
                    <div className="w-16 h-16 bg-indigo-500/20 border border-indigo-400/40 rounded-2xl flex items-center justify-center mb-5 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.3)] transform transition-transform hover:scale-105">
                      <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-bold text-white mb-2">Upload Test Chart Screenshot</h3>
                    <p className="text-xs text-text-muted max-w-[280px] mx-auto mb-5 leading-relaxed">
                      Upload a 1-minute OTC chart. AI will analyze and lock the signal before you enter the actual next candle.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-300 tracking-wider uppercase px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Auto Test Scan
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ACTIVE TEST RESULT & ACTUAL CANDLE EVALUATION */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
              
              {/* Top Banner: Signal Locked & State Indicator */}
              <div className="glass-panel p-4 rounded-3xl border border-indigo-500/40 bg-gradient-to-r from-[#14102b] to-[#0c0919] flex items-center justify-between shadow-[0_0_25px_rgba(99,102,241,0.2)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white uppercase tracking-wide">
                        AI SIGNAL LOCKED
                      </span>
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                    </div>
                    <p className="text-[10px] text-text-muted">Original AI analysis strictly preserved</p>
                  </div>
                </div>
                <button
                  onClick={startNewTest}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase transition-all flex items-center gap-1.5 border border-white/15"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  New Test
                </button>
              </div>

              {/* Primary AI Signal Display */}
              <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-[#0e0c1a] text-center space-y-4 shadow-xl">
                <div className="flex items-center justify-between text-xs text-text-muted border-b border-white/5 pb-3">
                  <span className="font-bold text-white">{activeRecord.asset}</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono border border-white/10">
                    {activeRecord.timeframe} {activeRecord.marketMode}
                  </span>
                  <span className="font-bold text-primary">Setup Grade: {activeRecord.setupQuality}</span>
                </div>

                {/* Big Signal Badge */}
                <div className="py-2">
                  <span className="text-[11px] font-extrabold text-text-muted uppercase tracking-widest block mb-1">
                    GENERATED AI SIGNAL
                  </span>
                  <div className="inline-flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black text-2xl tracking-wider shadow-lg">
                    {activeRecord.signal === "CALL" && (
                      <span className="text-emerald-400 bg-emerald-500/20 border-2 border-emerald-500/50 px-6 py-2 rounded-2xl flex items-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                        <ArrowUp className="w-6 h-6 animate-bounce" /> CALL (BUY)
                      </span>
                    )}
                    {activeRecord.signal === "PUT" && (
                      <span className="text-rose-400 bg-rose-500/20 border-2 border-rose-500/50 px-6 py-2 rounded-2xl flex items-center gap-2 shadow-[0_0_25px_rgba(244,63,94,0.3)]">
                        <ArrowDown className="w-6 h-6 animate-bounce" /> PUT (SELL)
                      </span>
                    )}
                    {activeRecord.signal === "NO_TRADE" && (
                      <span className="text-amber-400 bg-amber-500/20 border-2 border-amber-500/50 px-6 py-2 rounded-2xl flex items-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.3)]">
                        <ShieldAlert className="w-6 h-6" /> NO TRADE
                      </span>
                    )}
                  </div>
                  {activeRecord.signal === "NO_TRADE" && activeRecord.noTradeReason && activeRecord.noTradeReason !== "NONE" && (
                    <div className="text-xs text-amber-300/90 font-bold mt-2">
                      Reason: <span className="text-white">{formatNoTradeReason(activeRecord.noTradeReason)}</span>
                    </div>
                  )}
                </div>

                {/* Key Metric Pills */}
                <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">Bias</span>
                    <span className={`font-black uppercase truncate block ${
                      activeRecord.bias === "BULLISH" ? "text-emerald-400" :
                      activeRecord.bias === "BEARISH" ? "text-rose-400" : "text-amber-400"
                    }`}>
                      {activeRecord.bias || (activeRecord.signal === "CALL" ? "BULLISH" : activeRecord.signal === "PUT" ? "BEARISH" : "NEUTRAL")}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">Confidence</span>
                    <span className="font-black text-white">
                      {activeRecord.signal === "NO_TRADE" ? "N/A" : (activeRecord.confidencePercent ? `${activeRecord.confidencePercent}%` : activeRecord.confidence)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">Confluence</span>
                    <span className="font-black text-cyan-400">{activeRecord.confluenceScore}/10</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">Setup</span>
                    <span className="font-black text-primary truncate block">{activeRecord.setupQuality || "N/A"}</span>
                  </div>
                </div>
              </div>

              {/* Actual Next Candle Section (Interactive) */}
              <div className="glass-panel p-6 rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-[#110d24] to-[#090714] space-y-4 shadow-xl">
                <div className="text-center">
                  <span className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase">
                    STEP 2 • VERIFICATION
                  </span>
                  <h3 className="text-base font-black text-white mt-0.5">ACTUAL NEXT CANDLE</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Look at your live broker chart. What candle formed right after the analysis?
                  </p>
                </div>

                {/* The 3 Decision Buttons */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <button
                    onClick={() => handleSelectActualResult("UP")}
                    className={`py-3.5 px-2 rounded-2xl font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-all ${
                      activeRecord.actualResult === "UP"
                        ? "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.6)] ring-2 ring-white scale-105"
                        : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 active:scale-95"
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" />
                    <span>UP (GREEN)</span>
                  </button>

                  <button
                    onClick={() => handleSelectActualResult("DOWN")}
                    className={`py-3.5 px-2 rounded-2xl font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-all ${
                      activeRecord.actualResult === "DOWN"
                        ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.6)] ring-2 ring-white scale-105"
                        : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 active:scale-95"
                    }`}
                  >
                    <ArrowDown className="w-4 h-4" />
                    <span>DOWN (RED)</span>
                  </button>

                  <button
                    onClick={() => handleSelectActualResult("INVALID")}
                    className={`py-3.5 px-2 rounded-2xl font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-all ${
                      activeRecord.actualResult === "INVALID"
                        ? "bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.6)] ring-2 ring-white scale-105"
                        : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/40 active:scale-95"
                    }`}
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>INVALID</span>
                  </button>
                </div>

                {/* Dynamic Comparison Outcome Card */}
                {activeRecord.testResult !== "PENDING" && (
                  <div className={`p-4 rounded-2xl border transition-all mt-3 ${
                    activeRecord.testResult === "CORRECT"
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                      : activeRecord.testResult === "WRONG"
                      ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                      : activeRecord.testResult === "NO_TRADE"
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                      : "bg-white/5 border-white/20 text-white"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {activeRecord.testResult === "CORRECT" && <CheckCircle2 className="w-6 h-6" />}
                        {activeRecord.testResult === "WRONG" && <XCircle className="w-6 h-6" />}
                        {activeRecord.testResult === "NO_TRADE" && <Info className="w-6 h-6" />}
                        {activeRecord.testResult === "INVALID" && <HelpCircle className="w-6 h-6" />}
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider block opacity-80">
                            TEST EVALUATION RESULT
                          </span>
                          <span className="text-base font-black tracking-wide">
                            {activeRecord.testResult === "CORRECT" && "✓ CORRECT EVALUATION"}
                            {activeRecord.testResult === "WRONG" && "✕ WRONG EVALUATION"}
                            {activeRecord.testResult === "NO_TRADE" && "NO TRADE RECORDED"}
                            {activeRecord.testResult === "INVALID" && "INVALID TEST LABELED"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <span className="block opacity-70">Actual: {activeRecord.actualResult}</span>
                        <span className="block font-bold">Signal: {activeRecord.signal}</span>
                      </div>
                    </div>

                    {/* Post-Test Review for WRONG results */}
                    {activeRecord.postTestReview && (
                      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-rose-200/90 leading-relaxed bg-black/30 p-2.5 rounded-xl">
                        <span className="font-bold block mb-0.5 text-rose-300 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" /> Post-Test Review:
                        </span>
                        {activeRecord.postTestReview}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Expandable Technical Evidence Drawer */}
              <div className="glass-panel p-4 rounded-3xl border border-white/10 space-y-3">
                <button
                  onClick={() => setShowFullDetails(!showFullDetails)}
                  className="w-full flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider py-1"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Deep Technical Breakdown ({activeRecord.confluenceScore}/10)
                  </span>
                  {showFullDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showFullDetails && (
                  <div className="pt-3 border-t border-white/10 space-y-3 text-xs animate-in fade-in duration-200">
                    <div className="bg-black/40 p-3 rounded-xl space-y-1">
                      <span className="text-[10px] text-text-muted font-bold uppercase">AI Reasoning</span>
                      <p className="text-text-muted leading-relaxed">{activeRecord.reasoning}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] text-cyan-400 font-bold uppercase block mb-1">Market Structure</span>
                        <div className="text-xs font-bold text-white flex items-center justify-between">
                          <span>{activeRecord.marketStructure || activeRecord.structure?.direction || "UNKNOWN"}</span>
                          {activeRecord.structureConfidence != null && (
                            <span className="text-[10px] font-mono text-cyan-400 font-normal">
                              {activeRecord.structureConfidence}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] text-text-muted font-bold uppercase block mb-1">Market State</span>
                        <div className="text-xs font-bold text-white">{activeRecord.marketState?.replace(/_/g, " ") || "UNKNOWN"}</div>
                      </div>
                    </div>

                    {activeRecord.structureEvidence && activeRecord.structureEvidence.length > 0 && (
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1">
                        <span className="text-[10px] text-cyan-400 font-bold uppercase block mb-0.5">Structure Evidence</span>
                        <ul className="space-y-1 text-[11px] text-text-muted">
                          {activeRecord.structureEvidence.map((e, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className="text-cyan-400">•</span> {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase block mb-1">Bullish Confluence</span>
                        <ul className="space-y-1 text-[11px] text-text-muted">
                          {activeRecord.bullishEvidence?.slice(0, 3).map((e, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className="text-emerald-400">•</span> {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1">Bearish Confluence</span>
                        <ul className="space-y-1 text-[11px] text-text-muted">
                          {activeRecord.bearishEvidence?.slice(0, 3).map((e, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className="text-rose-400">•</span> {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {activeRecord.invalidation && (
                      <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-rose-300 text-[11px]">
                        <span className="font-bold block">Invalidation Level:</span>
                        {activeRecord.invalidation}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Conflict Replace Modal */}
          {showReplaceModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="glass-panel p-6 rounded-3xl max-w-sm w-full border border-indigo-500/40 bg-[#0e0f18] space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mx-auto">
                  <FlaskConical className="w-6 h-6 animate-pulse" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-black text-white">Test Analysis in Progress</h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    A test analysis is currently running. Would you like to replace it with the new screenshot?
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleCancelReplace}
                    className="py-3 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-text-muted hover:text-white uppercase"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleConfirmReplace}
                    className="py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold uppercase neon-glow-primary"
                  >
                    REPLACE & RESTART
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Secondary Tab: TEST HISTORY & STATISTICS */}
      {activeTab === "HISTORY" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          
          {/* Top Statistics Cards */}
          <div className="glass-panel p-5 rounded-3xl border border-indigo-500/30 bg-[#0e0b1c] space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">TEST LAB STATISTICS</h3>
              </div>
              <span className="text-[10px] text-text-muted uppercase">Historical Metric</span>
            </div>

            {/* Big Test Result Rate Metric */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-transparent border border-indigo-500/30">
              <div>
                <span className="text-[10px] font-extrabold text-indigo-300 uppercase tracking-widest block">
                  TEST RESULT RATE
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-black text-white font-mono">{stats.rate}%</span>
                  <span className="text-[11px] text-text-muted">
                    ({stats.correct}/{stats.valid} valid tests)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-white block">Total Tests: {stats.total}</span>
                <span className="text-[10px] text-text-muted">Invalid: {stats.invalid} | No Trade: {stats.noTrade}</span>
              </div>
            </div>

            {/* Directional Matrix */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* CALL Stats */}
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                <div className="flex items-center justify-between font-bold text-emerald-400">
                  <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> CALL Tests</span>
                  <span>{stats.callTotal}</span>
                </div>
                <div className="flex justify-between text-[11px] text-text-muted pt-1">
                  <span>Correct: <b className="text-emerald-400">{stats.callCorrect}</b></span>
                  <span>Wrong: <b className="text-rose-400">{stats.callWrong}</b></span>
                </div>
              </div>

              {/* PUT Stats */}
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                <div className="flex items-center justify-between font-bold text-rose-400">
                  <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> PUT Tests</span>
                  <span>{stats.putTotal}</span>
                </div>
                <div className="flex justify-between text-[11px] text-text-muted pt-1">
                  <span>Correct: <b className="text-emerald-400">{stats.putCorrect}</b></span>
                  <span>Wrong: <b className="text-rose-400">{stats.putWrong}</b></span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-text-muted/70 text-center leading-tight">
              Formula: Correct / (Correct + Wrong) × 100. Strictly historical test record evaluation.
            </p>
          </div>

          {/* Filter Pills & Actions */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
            <div className="flex items-center gap-1.5">
              {(["ALL", "CORRECT", "WRONG", "CALL", "PUT", "NO_TRADE", "INVALID"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-1.5 rounded-xl font-bold uppercase whitespace-nowrap transition-all text-[10px] ${
                    filterType === f 
                      ? "bg-primary text-white shadow-md" 
                      : "bg-surface text-text-muted hover:text-white border border-border"
                  }`}
                >
                  {f.replace("_", " ")}
                </button>
              ))}
            </div>

            {testHistory.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                className="px-2.5 py-1.5 rounded-xl font-bold text-[10px] text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 whitespace-nowrap flex items-center gap-1 transition-colors"
                title="Clear all history"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
            )}
          </div>

          {/* History List */}
          {loadingHistory ? (
            <div className="glass-panel p-8 text-center rounded-3xl">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <span className="text-xs text-text-muted">Loading test history...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl text-center flex flex-col items-center">
              <FlaskConical className="w-10 h-10 text-text-muted mb-3 opacity-40" />
              <h4 className="text-sm font-bold text-white">No Test Records Found</h4>
              <p className="text-xs text-text-muted mt-1">
                Upload a chart in the Active Lab to log your first verified test.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedHistoryItem(item)}
                  className="glass-panel p-4 rounded-2xl border border-white/10 hover:border-indigo-500/40 transition-all cursor-pointer space-y-2 bg-[#0d0a18]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                        item.signal === "CALL" ? "bg-emerald-500/20 text-emerald-400" :
                        item.signal === "PUT" ? "bg-rose-500/20 text-rose-400" :
                        "bg-amber-500/20 text-amber-400"
                      }`}>
                        {item.signal}
                      </span>
                      <span className="text-xs font-bold text-white">{item.asset}</span>
                      <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-white/5">
                        {item.timeframe}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black uppercase ${
                        item.testResult === "CORRECT" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                        item.testResult === "WRONG" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" :
                        item.testResult === "NO_TRADE" ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" :
                        "bg-white/10 text-text-muted border border-white/10"
                      }`}>
                        {item.testResult}
                      </span>
                      <button
                        onClick={(e) => handleDeleteRecord(item.id, e)}
                        className="p-1 text-text-muted hover:text-danger rounded-lg transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-text-muted pt-1 border-t border-white/5">
                    <span>Actual: <b className="text-white">{item.actualResult}</b></span>
                    <span>Confluence: <b className="text-cyan-400">{item.confluenceScore}/10</b></span>
                    <span>
                      {item.timestamp ? formatDistanceToNow(item.timestamp, { addSuffix: true }) : "Recent"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Test Detail Modal */}
          {selectedHistoryItem && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="glass-panel p-6 rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-indigo-500/40 bg-[#0e0c1c] space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-black text-white">Test Lab Record</h3>
                  </div>
                  <button 
                    onClick={() => setSelectedHistoryItem(null)}
                    className="p-1 rounded-full bg-white/10 text-text-muted hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Signal vs Actual */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">AI Signal</span>
                    <span className="text-lg font-black text-white">{selectedHistoryItem.signal}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-text-muted uppercase block">Actual Candle</span>
                    <span className="text-lg font-black text-white">{selectedHistoryItem.actualResult}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-white/10 text-center">
                  <span className="text-[10px] text-text-muted uppercase block">Test Result Outcome</span>
                  <span className="text-xl font-black text-indigo-400">{selectedHistoryItem.testResult}</span>
                </div>

                {/* Reasoning */}
                <div className="bg-black/30 p-3 rounded-xl space-y-1 text-xs">
                  <span className="text-[10px] text-text-muted font-bold uppercase">Original AI Reasoning</span>
                  <p className="text-text-muted leading-relaxed">{selectedHistoryItem.reasoning}</p>
                </div>

                {/* Post Test Review */}
                {selectedHistoryItem.postTestReview && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300">
                    <span className="font-bold block mb-1">Post-Test Review:</span>
                    {selectedHistoryItem.postTestReview}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleDeleteRecord(selectedHistoryItem.id)}
                    className="py-3 px-4 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-colors border border-rose-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedHistoryItem(null)}
                    className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase transition-colors"
                  >
                    Close Record
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}

function TestScanningHeader({ stageText }: { stageText: string }) {
  return (
    <div 
      aria-live="polite"
      className="glass-panel p-5 rounded-3xl border border-indigo-500/40 bg-gradient-to-b from-[#14102c] via-[#0d091e] to-[#090714] shadow-[0_0_35px_rgba(99,102,241,0.25)] relative overflow-hidden text-center space-y-3 animate-in fade-in zoom-in-95 duration-300"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-dashed border-indigo-500/40 animate-orbit"></div>
        <div className="absolute inset-2 rounded-full border border-cyan-400/50 border-t-transparent animate-orbit-reverse"></div>
        <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-indigo-500/30 to-purple-500/20 blur-md animate-radar-pulse"></div>
        <div className="w-10 h-10 rounded-full bg-[#15112e] border border-indigo-400 text-indigo-400 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.8)] z-10">
          <FlaskConical className="w-5 h-5 animate-pulse" />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-black text-indigo-400 tracking-[0.25em] uppercase flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          ANALYZING TEST CANDLE
        </div>
        <h4 className="text-sm font-bold text-white mt-1 tracking-tight min-h-[22px] flex items-center justify-center">
          {stageText}
        </h4>
      </div>

      <div className="flex items-center justify-center gap-1 pt-1">
        {[40, 70, 100, 60, 90, 45, 80, 50, 95, 65, 35].map((h, i) => (
          <span 
            key={i} 
            className="w-1 bg-gradient-to-t from-indigo-500/40 to-cyan-400 rounded-full transition-all duration-300"
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
