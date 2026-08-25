import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Cpu, Activity, Clock, Shield, Calendar, BarChart2, Infinity as InfinityIcon, Maximize, Link2, FlaskConical, Globe } from "lucide-react";
import { getApiUrl } from "../lib/api";

type HealthStatus = "CHECKING" | "CONNECTED" | "DISCONNECTED";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("CHECKING");
  const [latency, setLatency] = useState<number | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [uptime, setUptime] = useState<number | null>(null);

  const checkHealth = async () => {
    setHealthStatus("CHECKING");
    const startTime = performance.now();
    try {
      const res = await fetch(getApiUrl("/api/health"), {
        method: "GET",
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        const endTime = performance.now();
        setLatency(Math.round(endTime - startTime));
        setAiConfigured(!!data.aiConfigured);
        setUptime(data.uptime);
        setHealthStatus("CONNECTED");
      } else {
        setHealthStatus("DISCONNECTED");
        setLatency(null);
        setAiConfigured(null);
      }
    } catch (err) {
      console.warn("[Dashboard Health] Ping failed:", err);
      setHealthStatus("DISCONNECTED");
      setLatency(null);
      setAiConfigured(null);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="flex flex-col h-full space-y-4 pb-20 md:pb-0 px-2 max-w-md mx-auto mt-2">
      
      {/* Welcome Card */}
      <div className="relative p-5 rounded-[2rem] border border-primary/50 overflow-hidden bg-[#0d091a] shadow-[0_0_30px_rgba(139,92,246,0.3)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50"></div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 p-0.5 overflow-hidden shadow-lg shadow-cyan-500/30">
              <img 
                src={user?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.displayName || 'Admin'}`} 
                alt="Avatar" 
                className="w-full h-full object-cover rounded-[14px] bg-background"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-primary tracking-widest uppercase mb-0.5">Key Activated</span>
              <span className="text-xl font-black text-white leading-tight mb-1 truncate max-w-[140px]">
                {user?.displayName || "VIP Trader"}
              </span>
              <div className="flex items-center gap-1 bg-primary/20 border border-primary/30 px-2 py-0.5 rounded-full w-max">
                <Shield className="w-3 h-3 text-primary fill-primary" />
                <span className="text-[9px] font-bold text-primary tracking-widest uppercase">{user?.keyType || "VIP Access"}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-end gap-2 pr-2">
             <div className="flex flex-col items-center animate-pulse">
               <div className="w-1 h-3 bg-danger rounded-t-sm"></div>
               <div className="w-3 h-6 bg-danger rounded-sm shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>
               <div className="w-1 h-4 bg-danger rounded-b-sm"></div>
             </div>
             <div className="flex flex-col items-center animate-pulse delay-75 mb-2">
               <div className="w-1 h-4 bg-success rounded-t-sm"></div>
               <div className="w-3 h-8 bg-success rounded-sm shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
               <div className="w-1 h-2 bg-success rounded-b-sm"></div>
             </div>
          </div>
        </div>
      </div>

      {/* Real-time Network Diagnostic Checker */}
      <div className="relative p-3.5 rounded-[1.5rem] border border-white/10 bg-black/45 flex flex-col gap-2.5 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors border ${
              healthStatus === "CONNECTED" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              healthStatus === "DISCONNECTED" ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
              "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
            }`}>
              <Activity className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-white leading-none flex items-center gap-1.5">
                API Connection
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                  healthStatus === "CONNECTED" ? "bg-emerald-400 animate-ping" :
                  healthStatus === "DISCONNECTED" ? "bg-rose-500" :
                  "bg-amber-400 animate-pulse"
                }`} />
              </span>
              <span className="text-[9px] font-bold text-text-muted mt-1.5 tracking-wider uppercase">
                {healthStatus === "CONNECTED" ? `CONNECTED • LATENCY: ${latency || 0}ms` :
                 healthStatus === "DISCONNECTED" ? "LINK_FAILURE_DETECTED" :
                 "PINGING_AUTHORITATIVE_API..."}
              </span>
            </div>
          </div>
          <button 
            onClick={checkHealth}
            disabled={healthStatus === "CHECKING"}
            className={`px-3 py-1.5 rounded-xl font-bold text-[9px] tracking-widest uppercase transition-all duration-200 active:scale-95 ${
              healthStatus === "CONNECTED" ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30" :
              healthStatus === "DISCONNECTED" ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 animate-bounce" :
              "bg-white/5 text-text-muted border border-white/10"
            }`}
          >
            {healthStatus === "CHECKING" ? "PINGING" : "TEST LINK"}
          </button>
        </div>

        {healthStatus === "CONNECTED" && (
          <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-white/5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span>AI Engine: <span className={aiConfigured ? "text-emerald-400" : "text-rose-400"}>{aiConfigured ? "ONLINE" : "OFFLINE_KEY"}</span></span>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span>Uptime: <span className="text-white">{uptime !== null ? `${Math.floor(uptime / 60)}m` : "N/A"}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Daily Limit */}
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30 text-cyan-400">
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white leading-tight">Daily Limit</span>
          <span className="text-[10px] font-semibold text-text-muted tracking-wider uppercase">Resets every 24 hours</span>
        </div>
      </div>

      {/* Feature Banner: Real Forex High Impact News */}
      <button
        onClick={() => navigate('/news')}
        className="relative p-4 rounded-3xl border border-rose-500/40 bg-gradient-to-r from-[#210915] via-[#14060d] to-[#0a0307] flex items-center justify-between overflow-hidden group shadow-[0_0_20px_rgba(244,63,94,0.2)] hover:shadow-[0_0_30px_rgba(244,63,94,0.35)] transition-all active:scale-98 text-left"
      >
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center border border-rose-500/40 text-rose-400 shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.4)]">
            <Globe className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">
                REAL FOREX
              </span>
            </div>
            <h3 className="text-white font-black text-base leading-tight mt-0.5">News Signal Analyzer</h3>
            <p className="text-[10px] font-semibold text-text-muted">NFP, CPI, Interest Rates & Macro Reports</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 border border-rose-500/30 shrink-0">
          <Maximize className="w-4 h-4" />
        </div>
      </button>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        
        {/* Card 1: AI Analyzer */}
        <button 
          onClick={() => navigate('/analyzer')}
          className="relative p-4 rounded-[2rem] border border-primary/40 bg-gradient-to-b from-[#160d2b] to-[#0f091a] flex flex-col justify-between aspect-[4/5] overflow-hidden group shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.3)] transition-all active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
          <div className="flex justify-between items-start w-full relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 text-primary shadow-[0_0_15px_rgba(139,92,246,0.5)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary/70 border border-primary/20">
              <Maximize className="w-3 h-3" />
            </div>
          </div>
          <div className="relative z-10 mt-auto">
            <h3 className="text-white font-black text-lg leading-tight mb-1">AI Analyzer</h3>
            <p className="text-[10px] font-bold text-primary tracking-widest uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Quantum Tech
            </p>
          </div>
        </button>

        {/* Card 2: Live Signal */}
        <button 
          onClick={() => navigate('/analyzer')}
          className="relative p-4 rounded-[2rem] border border-success/40 bg-gradient-to-b from-[#0a1a14] to-[#05100c] flex flex-col justify-between aspect-[4/5] overflow-hidden group shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-success/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
          <div className="flex justify-between items-start w-full relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-success/20 flex items-center justify-center border border-success/30 text-success shadow-[0_0_15px_rgba(16,185,129,0.5)]">
              <Activity className="w-5 h-5" />
            </div>
            <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center text-success/70 border border-success/20">
              <Link2 className="w-3 h-3" />
            </div>
          </div>
          <div className="relative z-10 mt-auto">
            <h3 className="text-white font-black text-lg leading-tight mb-1">Live Signal</h3>
            <p className="text-[10px] font-bold text-success tracking-widest uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span> Real-Time Data
            </p>
          </div>
        </button>

        {/* Card 3: Test Mode */}
        <button 
          onClick={() => navigate('/test-mode')}
          className="relative p-4 rounded-[2rem] border border-indigo-500/40 bg-gradient-to-b from-[#14102b] to-[#0c0919] flex flex-col justify-between aspect-[4/5] overflow-hidden group shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:shadow-[0_0_25px_rgba(99,102,241,0.3)] transition-all active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
          <div className="flex justify-between items-start w-full relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400/70 border border-indigo-500/20">
              <Maximize className="w-3 h-3" />
            </div>
          </div>
          <div className="relative z-10 mt-auto">
            <h3 className="text-white font-black text-lg leading-tight mb-1">Test Mode</h3>
            <p className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span> Strategy Lab
            </p>
          </div>
        </button>

        {/* Card 4: Management */}
        <button 
          onClick={() => navigate('/settings')}
          className="relative p-4 rounded-[2rem] border border-warning/40 bg-gradient-to-b from-[#1c1405] to-[#120d03] flex flex-col justify-between aspect-[4/5] overflow-hidden group shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_25px_rgba(245,158,11,0.3)] transition-all active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-warning/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
          <div className="flex justify-between items-start w-full relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-warning/20 flex items-center justify-center border border-warning/30 text-warning shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              <Shield className="w-5 h-5" />
            </div>
            <div className="w-6 h-6 rounded-full bg-warning/10 flex items-center justify-center text-warning/70 border border-warning/20">
              <Link2 className="w-3 h-3" />
            </div>
          </div>
          <div className="relative z-10 mt-auto">
            <h3 className="text-white font-black text-lg leading-tight mb-1">Management</h3>
            <p className="text-[10px] font-bold text-warning tracking-widest uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></span> Risk Protect
            </p>
          </div>
        </button>

      </div>

      {/* Footer */}
      <div className="text-center mt-6 mb-2">
        <p className="text-[9px] font-bold text-primary/60 tracking-widest uppercase">© 2024 COCO AI. ALL RIGHTS RESERVED.</p>
      </div>

    </div>
  );
}

