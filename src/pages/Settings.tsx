import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Save, RotateCcw, Zap, Sliders, Shield, Volume2, History, AlertTriangle, CheckCircle2, Brain, Trash2 } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { AppSettings } from "../types";
import { DEFAULT_SETTINGS, getStoredSettings, saveStoredSettings } from "../lib/settings";
import { memoryManager } from "../lib/memory/memoryManager";
import { MemoryItem } from "../lib/memory/memoryTypes";

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  useEffect(() => {
    setMemories(memoryManager.getAllValidMemories());
  }, []);

  const handleDeleteMemory = (id: string) => {
    memoryManager.deleteMemory(id);
    setMemories(memoryManager.getAllValidMemories());
    toast.success("Memory item removed");
  };

  const handleClearAllMemories = () => {
    memoryManager.clearAllMemories();
    setMemories([]);
    toast.success("All stored memories cleared");
  };

  useEffect(() => {
    const loadSettings = async () => {
      // 1. First get from local storage
      const local = getStoredSettings();
      setSettings(local);

      // 2. Sync from Firestore if user logged in
      if (user) {
        try {
          const docRef = doc(db, "settings", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const remote = docSnap.data() as AppSettings;
            const merged = { ...DEFAULT_SETTINGS, ...remote };
            setSettings(merged);
            saveStoredSettings(merged);
          }
        } catch (e) {
          console.warn("Failed to load settings from Firestore", e);
        }
      }
      setLoading(false);
    };
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    saveStoredSettings(settings);

    if (user) {
      try {
        await setDoc(doc(db, "settings", user.uid), settings);
      } catch (e) {
        console.warn("Failed to sync settings to Firestore", e);
      }
    }

    setSaving(false);
    toast.success("Settings saved successfully");
  };

  const handleResetDefaults = async () => {
    setShowResetModal(false);
    setSettings(DEFAULT_SETTINGS);
    saveStoredSettings(DEFAULT_SETTINGS);

    if (user) {
      try {
        await setDoc(doc(db, "settings", user.uid), DEFAULT_SETTINGS);
      } catch (e) {
        console.warn("Failed to reset Firestore settings", e);
      }
    }

    toast.success("Settings reset to defaults");
  };

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-8 space-y-6 animate-in fade-in duration-300">
      
      {/* Page Title */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 border border-primary/40 rounded-xl flex items-center justify-center text-primary shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white">Application Settings</h2>
            <p className="text-xs text-text-muted">Configure preferences, controls & safety parameters</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold uppercase tracking-wider transition-all neon-glow-primary active:scale-95 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Access Key Status Card */}
      {user && (
        <div className="glass-panel p-4 md:p-5 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">{user.keyType}</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/30">Active</span>
              </div>
              <p className="text-xs font-mono text-text-muted tracking-wider mt-0.5">Key: {user.key}</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-primary bg-primary/10 border border-primary/30 px-3 py-1 rounded-lg">
            {user.displayName}
          </span>
        </div>
      )}

      <div className="space-y-5">
        
        {/* SECTION 1: LIVE ANALYSIS CONTROLS */}
        <div className="glass-panel p-5 md:p-6 rounded-3xl space-y-5 border border-white/10 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <h3 className="font-black text-white text-sm tracking-wide uppercase">Analyzer Preferences</h3>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase">
              Live Mode
            </span>
          </div>

          <div className="space-y-4">
            
            {/* Auto Analysis Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/60 border border-border">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Auto Analysis
                  {settings.autoAnalysis && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {settings.autoAnalysis 
                    ? "Analysis begins automatically upon screenshot upload" 
                    : "Upload previews chart; manual click required to start analysis"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, autoAnalysis: !settings.autoAnalysis })}
                className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
                  settings.autoAnalysis ? 'bg-primary' : 'bg-surface border border-border'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.autoAnalysis ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Premium Animation Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/60 border border-border">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Premium Scanning Animation
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {settings.premiumAnimation 
                    ? "Display orbital radar core & laser overlay during scan" 
                    : "Minimal scanning bar without visual overlays"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, premiumAnimation: !settings.premiumAnimation })}
                className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
                  settings.premiumAnimation ? 'bg-primary' : 'bg-surface border border-border'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.premiumAnimation ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Sound Feedback Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/60 border border-border">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-text-muted" /> Audio Chime Feedback
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  Play pleasant audio chime when signal decision completes
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, soundEnabled: !settings.soundEnabled })}
                className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
                  settings.soundEnabled ? 'bg-primary' : 'bg-surface border border-border'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.soundEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Save History Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/60 border border-border">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-text-muted" /> Save Signal History
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {settings.saveHistory 
                    ? "Store new completed signal records in history" 
                    : "Do not record new signals to history log"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, saveHistory: !settings.saveHistory })}
                className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
                  settings.saveHistory ? 'bg-primary' : 'bg-surface border border-border'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.saveHistory ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Default Broker & Asset Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Default Broker</label>
                <select 
                  value={settings.broker}
                  onChange={e => setSettings({ ...settings, broker: e.target.value })}
                  className="bg-surface border border-border rounded-xl p-3 text-xs text-white outline-none focus:border-primary transition-colors appearance-none font-bold"
                >
                  <option value="Quotex">Quotex</option>
                  <option value="Binolla">Binolla</option>
                  <option value="Pocket Option">Pocket Option</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Default Asset Pair</label>
                <input 
                  type="text"
                  value={settings.defaultAsset}
                  onChange={e => setSettings({ ...settings, defaultAsset: e.target.value })}
                  className="bg-surface border border-border rounded-xl p-3 text-xs text-white outline-none focus:border-primary transition-colors font-bold"
                  placeholder="e.g. EUR/USD"
                />
              </div>
            </div>

          </div>
        </div>

        {/* SECTION 2: TEST MODE PREFERENCES (STRICTLY ISOLATED) */}
        <div className="glass-panel p-5 md:p-6 rounded-3xl space-y-4 border border-cyan-500/20 bg-cyan-950/10">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="font-black text-white text-sm tracking-wide uppercase">Test Mode Settings</h3>
            </div>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full uppercase">
              Isolated
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Test Mode Default Broker</label>
              <select 
                value={settings.testModeDefaultBroker || "Quotex"}
                onChange={e => setSettings({ ...settings, testModeDefaultBroker: e.target.value })}
                className="bg-surface border border-border rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-400 transition-colors appearance-none font-bold"
              >
                <option value="Quotex">Quotex</option>
                <option value="Binolla">Binolla</option>
                <option value="Pocket Option">Pocket Option</option>
              </select>
            </div>

            <p className="text-[11px] text-text-muted leading-relaxed">
              Test Mode configuration is isolated and does not modify Live Analyzer AI parameters or risk settings.
            </p>
          </div>
        </div>

        {/* SECTION 3: RISK MANAGEMENT */}
        <div className="glass-panel p-5 md:p-6 rounded-3xl space-y-4 border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-warning" />
              <h3 className="font-black text-white text-sm tracking-wide uppercase">Risk Management Guidelines</h3>
            </div>
          </div>

          <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 leading-relaxed font-medium">
              Binary options trading involves substantial risk. Never use martingale staking or exceed your daily risk limits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Risk per trade (%)</label>
              <input 
                type="number"
                min="0.5" step="0.5" max="10"
                value={settings.riskPerTrade}
                onChange={e => setSettings({ ...settings, riskPerTrade: parseFloat(e.target.value) || 1 })}
                className="bg-surface border border-border rounded-xl p-3 text-xs text-white outline-none focus:border-primary font-bold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Max Daily Loss (%)</label>
              <input 
                type="number"
                min="1" step="1" max="50"
                value={settings.maxDailyLoss}
                onChange={e => setSettings({ ...settings, maxDailyLoss: parseFloat(e.target.value) || 5 })}
                className="bg-surface border border-border rounded-xl p-3 text-xs text-white outline-none focus:border-primary font-bold"
              />
            </div>
          </div>
        </div>

        {/* MEMORY & LONG-TERM CONVERSATION INTELLIGENCE */}
        <div className="glass-panel p-5 rounded-2xl border border-border bg-surface/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-400">
              <Brain className="w-5 h-5" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Remembered Preferences & Memory</h3>
            </div>

            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllMemories}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold flex items-center gap-1 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear All Memory</span>
              </button>
            )}
          </div>

          {memories.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              No saved preferences or explicit memories stored yet. Tell Sufia "এটা মনে রাখো: ..." or set language preferences in conversation.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {memories.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="font-medium text-white/90">{m.content}</span>
                    <div className="flex items-center gap-2 text-[9px] text-text-muted">
                      <span className="uppercase font-mono text-indigo-400 font-bold">[{m.category}]</span>
                      <span>Confidence: {m.confidence}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMemory(m.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-text-muted hover:text-rose-400 transition-colors shrink-0"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SAVE & RESET BUTTONS */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-primary hover:bg-primary-hover text-white font-black text-sm uppercase tracking-wider neon-glow-primary transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "SAVING PREFERENCES..." : "SAVE SETTINGS"}
          </button>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="w-full py-3 rounded-2xl border border-white/10 hover:border-rose-500/40 bg-white/5 hover:bg-rose-500/10 text-text-muted hover:text-rose-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET SETTINGS TO DEFAULT
          </button>
        </div>

      </div>

      {/* CONFIRM RESET MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-panel p-6 rounded-3xl max-w-sm w-full border border-rose-500/40 bg-[#0e0f18] shadow-[0_0_40px_rgba(244,63,94,0.3)] space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-black text-white">Reset User Preferences?</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                This will reset your UI settings (Auto Analysis, Animation, Sound, Default Broker) back to default values.
              </p>
              <div className="mt-3 p-3 bg-white/5 rounded-xl border border-white/10 text-[11px] text-emerald-300 flex items-center gap-2 text-left">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Your saved signal history and test history will remain completely safe.</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-text-muted hover:text-white uppercase transition-all"
              >
                CANCEL
              </button>

              <button
                onClick={handleResetDefaults}
                className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase transition-all shadow-[0_0_20px_rgba(244,63,94,0.4)] active:scale-95"
              >
                CONFIRM RESET
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
