import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { SignalHistory } from "../types";
import { Activity, Clock, Check, X, Minus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

export default function History() {
  const { user } = useAuth();
  const [history, setHistory] = useState<SignalHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      let localData: SignalHistory[] = [];
      try {
        const stored = localStorage.getItem("coco_signal_history_v1");
        if (stored) {
          localData = JSON.parse(stored);
        }
      } catch (e) {
        console.warn("Failed to read signal history from localStorage", e);
      }

      if (!user) {
        setHistory(localData);
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, "analyses"), 
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc")
        );
        const snapshot = await getDocs(q);
        const fsData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SignalHistory));
        const existingIds = new Set(fsData.map(d => d.id));
        const combined = [...fsData];
        for (const item of localData) {
          if (!existingIds.has(item.id)) {
            combined.push(item);
          }
        }
        setHistory(combined);
      } catch (error) {
        console.error("Failed to fetch history from Firestore", error);
        setHistory(localData);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [user]);

  const updateOutcome = async (id: string, outcome: "WIN" | "LOSS" | "EXPIRED" | "UNKNOWN") => {
    setHistory(prev => prev.map(item => item.id === id ? { ...item, outcome } : item));
    
    try {
      const stored = localStorage.getItem("coco_signal_history_v1");
      if (stored) {
        const list: SignalHistory[] = JSON.parse(stored);
        const updated = list.map(item => item.id === id ? { ...item, outcome } : item);
        localStorage.setItem("coco_signal_history_v1", JSON.stringify(updated));
      }
    } catch (e) {
      console.warn("Failed to update outcome in localStorage", e);
    }

    try {
      if (user) {
        const ref = doc(db, "analyses", id);
        await updateDoc(ref, { outcome });
      }
      toast.success(`Outcome updated to ${outcome}`);
    } catch (e) {
      console.warn("Failed to update outcome in Firestore", e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    // 1. Instantly remove from React state
    setHistory(prev => prev.filter(item => item.id !== id));

    // 2. Instantly remove from localStorage
    try {
      const stored = localStorage.getItem("coco_signal_history_v1");
      if (stored) {
        const list: SignalHistory[] = JSON.parse(stored);
        const filtered = list.filter(item => item.id !== id);
        localStorage.setItem("coco_signal_history_v1", JSON.stringify(filtered));
      }
    } catch (e) {
      console.warn("Failed to delete signal history from localStorage", e);
    }

    // 3. Remove from Firestore if user logged in
    try {
      if (user) {
        await deleteDoc(doc(db, "analyses", id));
      }
    } catch (err) {
      console.warn("Failed to delete record from Firestore", err);
    }

    toast.success("Signal record deleted");
  };

  const handleClearAllHistory = async () => {
    if (history.length === 0) return;

    setLoading(true);

    // 1. Instantly clear React state and localStorage
    setHistory([]);
    try {
      localStorage.removeItem("coco_signal_history_v1");
    } catch (e) {
      console.warn("Failed to clear signal history from localStorage", e);
    }

    // 2. Clear Firestore collection for user
    try {
      if (user) {
        const q = query(
          collection(db, "analyses"),
          where("userId", "==", user.uid)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "analyses", d.id)));
        await Promise.all(deletePromises);
      }
    } catch (err) {
      console.error("Failed to clear signal history from Firestore", err);
    } finally {
      setLoading(false);
      toast.success("All signal history deleted");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            <Clock className="text-primary w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Signal History</h2>
            <p className="text-sm text-text-muted">Track and verify your analysis outcomes</p>
          </div>
        </div>

        {history.length > 0 && (
          <button
            onClick={handleClearAllHistory}
            className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center">
          <Activity className="w-12 h-12 text-text-muted mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-white mb-2">No History Found</h3>
          <p className="text-text-muted">You haven't run any analyses yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <HistoryCard key={item.id} item={item} onUpdateOutcome={updateOutcome} onDeleteItem={handleDeleteItem} />
          ))}
        </div>
      )}
    </div>
  );
}

const HistoryCard: React.FC<{ 
  item: SignalHistory, 
  onUpdateOutcome: (id: string, outcome: any) => void,
  onDeleteItem: (id: string) => void
}> = ({ item, onUpdateOutcome, onDeleteItem }) => {
  const [showOutcomeMenu, setShowOutcomeMenu] = useState(false);
  
  const isCall = item.signal === "CALL";
  const isPut = item.signal === "PUT";
  
  const outcomeColor = 
    item.outcome === "WIN" ? "text-success border-success/30 bg-success/10" :
    item.outcome === "LOSS" ? "text-danger border-danger/30 bg-danger/10" :
    item.outcome === "EXPIRED" ? "text-text-muted border-border bg-surface" :
    "text-warning border-warning/30 bg-warning/10";

  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row gap-4 items-start md:items-center">
      <div className="flex-1 w-full">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isCall ? 'bg-success/20 text-success' : isPut ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'}`}>
            {item.signal}
          </span>
          {item.setupQuality && (
            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white">
              Grade {item.setupQuality}
            </span>
          )}
          {item.confluenceScore !== undefined && (
            <span className="text-xs text-text-muted px-2 py-0.5 bg-background rounded-md border border-border">
              {item.confluenceScore}/10
            </span>
          )}
          <span className="font-bold text-white">{item.asset}</span>
          <span className="text-xs text-text-muted px-2 py-0.5 bg-background rounded-md border border-border">
            {item.timeframe} {item.marketMode}
          </span>
          {item.timestamp && (
            <span className="text-xs text-text-muted ml-auto">
              {typeof item.timestamp === 'number' 
                ? formatDistanceToNow(item.timestamp, { addSuffix: true })
                : 'Just now'}
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted line-clamp-2 md:line-clamp-1">{item.reasoning}</p>
      </div>
      
      <div className="flex items-center justify-between w-full md:w-auto gap-3 border-t md:border-t-0 border-border pt-4 md:pt-0">
        <div className="relative">
          <button 
            onClick={() => setShowOutcomeMenu(!showOutcomeMenu)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-colors ${outcomeColor}`}
          >
            {item.outcome === "WIN" && <Check className="w-4 h-4" />}
            {item.outcome === "LOSS" && <X className="w-4 h-4" />}
            {item.outcome === "UNKNOWN" && <Minus className="w-4 h-4" />}
            {item.outcome}
          </button>
          
          {showOutcomeMenu && (
            <div className="absolute top-full right-0 mt-2 w-40 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-20">
              <button onClick={() => { onUpdateOutcome(item.id, "WIN"); setShowOutcomeMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-success hover:bg-white/5 font-semibold">WIN</button>
              <button onClick={() => { onUpdateOutcome(item.id, "LOSS"); setShowOutcomeMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-danger hover:bg-white/5 font-semibold">LOSS</button>
              <button onClick={() => { onUpdateOutcome(item.id, "EXPIRED"); setShowOutcomeMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-text-muted hover:bg-white/5 font-semibold">EXPIRED</button>
              <button onClick={() => { onUpdateOutcome(item.id, "UNKNOWN"); setShowOutcomeMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-warning hover:bg-white/5 font-semibold">UNKNOWN</button>
            </div>
          )}
        </div>
        
        <button 
          onClick={() => onDeleteItem(item.id)}
          className="p-2 text-text-muted hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
          title="Delete record"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
