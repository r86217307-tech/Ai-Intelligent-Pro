import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, KeyRound, ShieldCheck, ArrowRight, Sparkles, Lock, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { user, loginWithKey } = useAuth();
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = loginWithKey(inputKey);
    if (!result.success && result.error) {
      setError(result.error);
    }
  };

  const handleQuickKey = (key: string) => {
    setInputKey(key);
    setError(null);
    loginWithKey(key);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel p-6 sm:p-8 rounded-3xl flex flex-col items-center text-center relative z-10 border border-primary/20 shadow-[0_0_50px_rgba(139,92,246,0.15)]">
        <div className="w-16 h-16 bg-gradient-to-br from-primary/30 to-purple-600/10 rounded-2xl flex items-center justify-center mb-5 neon-glow-primary border border-primary/40">
          <Activity className="text-primary w-9 h-9" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white mb-1">
          Ai <span className="text-primary">Intelligent</span>
        </h1>
        <p className="text-text-muted text-xs sm:text-sm mb-6 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 inline" />
          Sufia AI Access Key System
        </p>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="text-left space-y-1.5">
            <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5 ml-1">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              Enter Your Access Key
            </label>
            <div className="relative">
              <input
                type="text"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. SUFIA-VIP-2026"
                className="w-full py-3.5 px-4 bg-surface border border-border rounded-xl font-mono text-sm sm:text-base text-white placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary uppercase tracking-wider transition-all"
                autoComplete="off"
                autoFocus
              />
              <Lock className="w-4 h-4 text-text-muted/50 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs text-left animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 px-6 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all active:scale-95"
          >
            <span>Activate Access</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        {/* Demo / Quick Key Options */}
        <div className="w-full mt-6 pt-5 border-t border-border/60">
          <span className="text-[11px] font-semibold text-text-muted/70 uppercase tracking-widest block mb-3">
            Quick Activation Keys
          </span>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => handleQuickKey("SUFIA-VIP-2026")}
              className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              SUFIA-VIP-2026
            </button>
            <button
              type="button"
              onClick={() => handleQuickKey("VIP-OTC-8899")}
              className="px-3 py-1.5 rounded-lg bg-surface hover:bg-white/5 border border-border text-text-muted hover:text-white text-xs font-mono font-bold transition-colors"
            >
              VIP-OTC-8899
            </button>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-text-muted/60 max-w-xs leading-relaxed">
          The Access Key unlocks full AI trading analysis, live voice assistant, and Forex intelligence. Keep your key secure.
        </p>
      </div>
    </div>
  );
}

