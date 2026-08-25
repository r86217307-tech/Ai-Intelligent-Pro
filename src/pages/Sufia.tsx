import React, { useState, useEffect } from 'react';
import { AssistantProvider, useAssistant } from '../lib/voice/AssistantProvider';
import SufiaOrb from '../components/sufia/SufiaOrb';
import { voiceManager } from '../lib/voice/voiceManager';
import { visionManager } from '../lib/vision/visionManager';
import { visionContextManager, VisualContext } from '../lib/vision/visionContextManager';
import { GuardrailsTestSuite, TestCaseResult } from '../lib/trading/guardrailsTestSuite';
import { ReliabilityTestSuite, ReliabilityTestCaseResult } from '../lib/recovery/reliabilityTestSuite';
import { contextOrchestratorTestSuite, OrchestratorTestCaseResult } from '../lib/conversation/contextOrchestratorTestSuite';
import { phase12TestSuite, Phase12TestCaseResult } from '../lib/conversation/phase12TestSuite';
import { phase13TestSuite, Phase13TestCaseResult } from '../lib/memory/phase13TestSuite';
import { toolIntelligenceTestSuite, ToolTestCaseResult } from '../lib/tools/toolIntelligenceTestSuite';
import { phase15TestSuite, Phase15TestCaseResult } from '../lib/adaptive/phase15TestSuite';
import { phase16TestSuite, Phase16TestCaseResult } from '../lib/trading/phase16TestSuite';
import { phase17TestSuite, Phase17TestCaseResult } from '../lib/trading/phase17TestSuite';
import { phase18TestSuite, Phase18TestCaseResult } from '../lib/trading/phase18TestSuite';
import { phase19TestSuite, Phase19TestCaseResult } from '../lib/trading/phase19TestSuite';
import { phase20TestSuite, Phase20TestCaseResult } from '../lib/production/phase20TestSuite';
import { phase21TestSuite, Phase21TestCaseResult } from '../lib/mobile/phase21TestSuite';
import { phase22TestSuite, Phase22TestCaseResult } from '../lib/mobile/phase22TestSuite';
import { phase23CloudBuildTestSuite, Phase23TestCaseResult } from '../lib/mobile/phase23CloudBuildTestSuite';
import { nativeBridge } from '../lib/mobile/nativeBridge';
import { mobileCapabilityManager, MobileCapabilities } from '../lib/mobile/mobileCapabilityManager';
import { mobileLifecycleManager } from '../lib/mobile/mobileLifecycleManager';
import { actionPlanner } from '../lib/tools/actionPlanner';
import { memoryManager } from '../lib/memory/memoryManager';
import { latencyTelemetry, LatencyTelemetryReport } from '../lib/telemetry/latencyTelemetry';
import { sessionRecoveryManager } from '../lib/recovery/sessionRecoveryManager';
import { 
  Repeat, 
  Monitor, 
  MonitorOff, 
  AlertCircle, 
  Terminal, 
  Eye, 
  RefreshCw, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  Activity,
  Zap,
  Sparkles,
  Radio,
  Settings,
  Smartphone
} from 'lucide-react';

function SufiaVoiceScreen() {
  const { 
    state, 
    connectionState, 
    updateSettings,
    isScreenSharing,
    screenShareStatus,
    isScreenShareSupported,
    startScreenShare,
    stopScreenShare,
  } = useAssistant();
  const [processingText, setProcessingText] = useState('Thinking...');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState(() => visionManager.getDiagnostics());
  const [visualContext, setVisualContext] = useState<VisualContext>(() => visionContextManager.getContext());
  
  // Phase 9 Test Suite
  const [isRunningGuardrailTests, setIsRunningGuardrailTests] = useState(false);
  const [guardrailTestResults, setGuardrailTestResults] = useState<{ total: number; passed: number; failed: number; results: TestCaseResult[] } | null>(null);

  // Phase 10 Reliability Test Suite & Telemetry
  const [isRunningReliabilityTests, setIsRunningReliabilityTests] = useState(false);
  const [reliabilityTestResults, setReliabilityTestResults] = useState<{ total: number; passed: number; failed: number; results: ReliabilityTestCaseResult[] } | null>(null);
  const [telemetryReport, setTelemetryReport] = useState<LatencyTelemetryReport>(() => latencyTelemetry.getReport());

  // Phase 11 Orchestration Test Suite
  const [isRunningOrchestratorTests, setIsRunningOrchestratorTests] = useState(false);
  const [orchestratorTestResults, setOrchestratorTestResults] = useState<{ total: number; passed: number; failed: number; results: OrchestratorTestCaseResult[] } | null>(null);

  // Phase 12 Conversational Intelligence Test Suite
  const [isRunningPhase12Tests, setIsRunningPhase12Tests] = useState(false);
  const [phase12TestResults, setPhase12TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase12TestCaseResult[] } | null>(null);

  // Phase 13 Advanced Memory & Personalization Test Suite
  const [isRunningPhase13Tests, setIsRunningPhase13Tests] = useState(false);
  const [phase13TestResults, setPhase13TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase13TestCaseResult[] } | null>(null);

  // Phase 14 Tool Intelligence Test Suite
  const [isRunningPhase14Tests, setIsRunningPhase14Tests] = useState(false);
  const [phase14TestResults, setPhase14TestResults] = useState<{ total: number; passed: number; failed: number; results: ToolTestCaseResult[] } | null>(null);

  // Phase 15 Advanced Adaptive Intelligence Test Suite
  const [isRunningPhase15Tests, setIsRunningPhase15Tests] = useState(false);
  const [phase15TestResults, setPhase15TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase15TestCaseResult[] } | null>(null);

  // Phase 16 Production-Grade Trading Intelligence Orchestration
  // Phase 17 Dual-Market Intelligence
  // Phase 18 Production Security & Hardening
  // Phase 19 Android Readiness & Mobile Production Architecture
  // Phase 20 Production Deployment & Backend Infrastructure Validation
  // Phase 23 Phone-Only Cloud Android Build Pipeline
  const [isRunningPhase23Tests, setIsRunningPhase23Tests] = useState(false);
  const [phase23TestResults, setPhase23TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase23TestCaseResult[] } | null>(null);

  // Phase 22 Real Android Build, APK/AAB Generation & Device Validation
  const [isRunningPhase22Tests, setIsRunningPhase22Tests] = useState(false);
  const [phase22TestResults, setPhase22TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase22TestCaseResult[] } | null>(null);

  // Phase 21 Android Application Packaging & Native Bridge Readiness
  const [isRunningPhase21Tests, setIsRunningPhase21Tests] = useState(false);
  const [phase21TestResults, setPhase21TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase21TestCaseResult[] } | null>(null);

  const [isRunningPhase20Tests, setIsRunningPhase20Tests] = useState(false);
  const [phase20TestResults, setPhase20TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase20TestCaseResult[] } | null>(null);

  const [isRunningPhase19Tests, setIsRunningPhase19Tests] = useState(false);
  const [phase19TestResults, setPhase19TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase19TestCaseResult[] } | null>(null);

  const [isRunningPhase18Tests, setIsRunningPhase18Tests] = useState(false);
  const [phase18TestResults, setPhase18TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase18TestCaseResult[] } | null>(null);

  const [isRunningPhase17Tests, setIsRunningPhase17Tests] = useState(false);
  const [phase17TestResults, setPhase17TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase17TestCaseResult[] } | null>(null);

  const [isRunningPhase16Tests, setIsRunningPhase16Tests] = useState(false);
  const [phase16TestResults, setPhase16TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase16TestCaseResult[] } | null>(null);

  const [currentActionState, setCurrentActionState] = useState(actionPlanner.getState());

  useEffect(() => {
    // Poll the action planner state
    const interval = setInterval(() => {
      setCurrentActionState(actionPlanner.getState());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // If state is anything other than IDLE (or ERROR), Sufia voice is active
  const isVoiceActive = state !== 'IDLE' && state !== 'ERROR';

  useEffect(() => {
    const unsubscribeVision = visionContextManager.subscribe((ctx) => {
      setVisualContext(ctx);
    });
    
    latencyTelemetry.onTelemetryUpdated = (report) => {
      setTelemetryReport(report);
    };

    return () => {
      unsubscribeVision();
    };
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (state === 'PROCESSING') {
      setProcessingText('Thinking...');
      timeout = setTimeout(() => {
        setProcessingText('একটু সময় দাও, আমি শুনছি...');
      }, 2000);
    } else {
      setProcessingText('Thinking...');
    }
    return () => clearTimeout(timeout);
  }, [state]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const refreshDiagnostics = () => {
    setDiagnostics(visionManager.getDiagnostics());
    setTelemetryReport(latencyTelemetry.getReport());
  };

  const getStatusDisplay = () => {
    if (connectionState === 'CONNECTING') return 'Connecting...';
    if (connectionState === 'RECONNECTING') return 'Reconnecting...';
    if (connectionState === 'FAILED') return 'Connection Failed';
    if (connectionState === 'DISCONNECTED') return 'Disconnected';
    
    switch (state) {
      case 'LISTENING': return 'Listening...';
      case 'USER_SPEAKING': return 'Hearing you...';
      case 'PROCESSING': return processingText;
      case 'SPEAKING': return 'Speaking...';
      case 'ERROR': return 'Error occurred';
      default: return isScreenSharing ? 'Vision Ready' : 'Off';
    }
  };

  const getVisionBadgeInfo = () => {
    if (!isScreenSharing) return null;
    if (visualContext.state === 'ACTIVE') {
      return {
        label: 'VISION ACTIVE',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        dot: 'bg-emerald-400',
        animate: true,
      };
    }
    if (visualContext.state === 'STALE') {
      return {
        label: 'VISION UPDATING',
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        dot: 'bg-amber-400',
        animate: false,
      };
    }
    return {
      label: 'VISION READY',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      dot: 'bg-blue-400',
      animate: false,
    };
  };

  const handleToggleVoice = async () => {
    if (!mobileLifecycleManager.isTapAllowed('toggle_voice', 500)) return;
    try {
      if (isVoiceActive) {
        voiceManager.stopListening(true);
        updateSettings({ continuousListening: false });
      } else {
        updateSettings({ continuousListening: true });
        await voiceManager.startListening();
      }
    } catch (err: any) {
      showToast('Microphone access failed. Please grant permission.');
    }
  };

  const handleToggleScreenShare = async () => {
    if (!mobileLifecycleManager.isTapAllowed('toggle_screen_share', 600)) return;
    if (isScreenSharing) {
      stopScreenShare();
      showToast('Screen sharing stopped.');
    } else {
      const caps = mobileCapabilityManager.detectCapabilities();
      if (caps.isMobile) {
        showToast('Screen sharing is not supported on mobile. Please upload chart screenshots in the Analyzer tab.');
        return;
      }

      const success = await startScreenShare();
      if (!success) {
        refreshDiagnostics();
        const diag = visionManager.getDiagnostics();
        if (diag.apiStatus === 'RESTRICTED_IFRAME') {
          showToast('Screen sharing restricted inside preview iframe. Please open the app in a new tab.');
        } else if (diag.apiStatus === 'INSECURE_CONTEXT') {
          showToast('Screen sharing requires a secure HTTPS connection.');
        } else if (diag.apiStatus === 'UNSUPPORTED') {
          showToast('Screen sharing is not supported on this device or browser. Use chart screenshot upload instead.');
        } else {
          showToast(visionManager.getState().error || 'Could not start screen sharing.');
        }
      } else {
        showToast('Screen sharing active. Sufia is watching your screen.');
      }
    }
  };

  const handleRunGuardrailsTests = async () => {
    setIsRunningGuardrailTests(true);
    try {
      const results = await GuardrailsTestSuite.runAllTests();
      setGuardrailTestResults(results);
    } catch (e) {
      console.error('Guardrails tests error:', e);
    } finally {
      setIsRunningGuardrailTests(false);
    }
  };

  const handleRunReliabilityTests = async () => {
    setIsRunningReliabilityTests(true);
    try {
      const results = await ReliabilityTestSuite.runAllTests();
      setReliabilityTestResults(results);
    } catch (e) {
      console.error('Reliability tests error:', e);
    } finally {
      setIsRunningReliabilityTests(false);
    }
  };

  const handleRunOrchestratorTests = async () => {
    setIsRunningOrchestratorTests(true);
    try {
      const results = await contextOrchestratorTestSuite.runAllTests();
      setOrchestratorTestResults(results);
    } catch (e) {
      console.error('Orchestrator tests error:', e);
    } finally {
      setIsRunningOrchestratorTests(false);
    }
  };

  const handleRunPhase12Tests = async () => {
    setIsRunningPhase12Tests(true);
    try {
      const results = await phase12TestSuite.runAllTests();
      setPhase12TestResults(results);
    } catch (e) {
      console.error('Phase 12 tests error:', e);
    } finally {
      setIsRunningPhase12Tests(false);
    }
  };

  const handleRunPhase13Tests = async () => {
    setIsRunningPhase13Tests(true);
    try {
      const results = await phase13TestSuite.runAllTests();
      setPhase13TestResults(results);
    } catch (e) {
      console.error('Phase 13 tests error:', e);
    } finally {
      setIsRunningPhase13Tests(false);
    }
  };

  const handleRunPhase14Tests = async () => {
    setIsRunningPhase14Tests(true);
    try {
      const results = await toolIntelligenceTestSuite.runAllTests();
      setPhase14TestResults(results);
    } catch (e) {
      console.error('Phase 14 tests error:', e);
    } finally {
      setIsRunningPhase14Tests(false);
    }
  };

  const handleRunPhase15Tests = async () => {
    setIsRunningPhase15Tests(true);
    try {
      const results = await phase15TestSuite.runAllTests();
      setPhase15TestResults(results);
    } catch (e) {
      console.error('Phase 15 tests error:', e);
    } finally {
      setIsRunningPhase15Tests(false);
    }
  };

  useEffect(() => {
    if (showDiagnostics) {
      const unregister = nativeBridge.registerBackHandler(() => {
        setShowDiagnostics(false);
        return true;
      }, 100);
      return unregister;
    }
  }, [showDiagnostics]);

  const handleRunPhase23Tests = async () => {
    setIsRunningPhase23Tests(true);
    try {
      const results = await phase23CloudBuildTestSuite.runAllTests();
      setPhase23TestResults(results);
    } catch (e) {
      console.error('Phase 23 tests error:', e);
    } finally {
      setIsRunningPhase23Tests(false);
    }
  };

  const handleRunPhase22Tests = async () => {
    setIsRunningPhase22Tests(true);
    try {
      const results = await phase22TestSuite.runAllTests();
      setPhase22TestResults(results);
    } catch (e) {
      console.error('Phase 22 tests error:', e);
    } finally {
      setIsRunningPhase22Tests(false);
    }
  };

  const handleRunPhase21Tests = async () => {
    setIsRunningPhase21Tests(true);
    try {
      const results = await phase21TestSuite.runAllTests();
      setPhase21TestResults(results);
    } catch (e) {
      console.error('Phase 21 tests error:', e);
    } finally {
      setIsRunningPhase21Tests(false);
    }
  };

  const handleRunPhase20Tests = async () => {
    setIsRunningPhase20Tests(true);
    try {
      const results = await phase20TestSuite.runAllTests();
      setPhase20TestResults(results);
    } catch (e) {
      console.error('Phase 20 tests error:', e);
    } finally {
      setIsRunningPhase20Tests(false);
    }
  };

  const handleRunPhase19Tests = async () => {
    setIsRunningPhase19Tests(true);
    try {
      const results = await phase19TestSuite.runAllTests();
      setPhase19TestResults(results);
    } catch (e) {
      console.error('Phase 19 tests error:', e);
    } finally {
      setIsRunningPhase19Tests(false);
    }
  };

  const handleRunPhase18Tests = async () => {
    setIsRunningPhase18Tests(true);
    try {
      const results = await phase18TestSuite.runAllTests();
      setPhase18TestResults(results);
    } catch (e) {
      console.error('Phase 18 tests error:', e);
    } finally {
      setIsRunningPhase18Tests(false);
    }
  };

  const handleRunPhase17Tests = async () => {
    setIsRunningPhase17Tests(true);
    try {
      const results = await phase17TestSuite.runAllTests();
      setPhase17TestResults(results);
    } catch (e) {
      console.error('Phase 17 tests error:', e);
    } finally {
      setIsRunningPhase17Tests(false);
    }
  };

  const handleRunPhase16Tests = async () => {
    setIsRunningPhase16Tests(true);
    try {
      const results = await phase16TestSuite.runAllTests();
      setPhase16TestResults(results);
    } catch (e) {
      console.error('Phase 16 tests error:', e);
    } finally {
      setIsRunningPhase16Tests(false);
    }
  };

  const visionBadge = getVisionBadgeInfo();

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 bg-[#09090b] text-white select-none overflow-hidden font-sans">
      {/* Background radial glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className={`w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-1000 ${
          state === 'SPEAKING' ? 'bg-cyan-500/20' :
          state === 'USER_SPEAKING' ? 'bg-blue-500/25' :
          state === 'PROCESSING' ? 'bg-purple-500/20' :
          isScreenSharing ? 'bg-emerald-500/15' :
          'bg-blue-600/10'
        }`} />
      </div>

      {/* Top Header / Status Indicators */}
      <div className="relative z-10 w-full flex items-center justify-between max-w-md pt-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              refreshDiagnostics();
              setShowDiagnostics(!showDiagnostics);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white transition-all text-xs"
            title="Toggle Diagnostics"
          >
            <span className="font-semibold tracking-wide">SUFIA AI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">v2.0 PRO</span>
          </button>
        </div>

        {/* Vision & Connection Status Badges */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono ${
            connectionState === 'CONNECTED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
            connectionState === 'RECONNECTING' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300 animate-pulse' :
            'bg-white/5 border-white/10 text-white/50'
          }`}>
            <Radio className="w-3 h-3" />
            <span>{connectionState}</span>
          </div>

          {isScreenSharing && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-pulse">
              <Eye className="w-3.5 h-3.5" />
              <span className="text-[11px] tracking-wider uppercase font-semibold">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Center Interactive Sufia Orb */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 my-auto">
        <div 
          onClick={handleToggleVoice}
          className="cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95"
          title={isVoiceActive ? "Click to stop voice" : "Click to start voice"}
        >
          <SufiaOrb />
        </div>

        {/* Vision Active Status Badge */}
        {visionBadge && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium backdrop-blur-md animate-in fade-in transition-all ${visionBadge.color}`}>
            <span className={`w-2 h-2 rounded-full ${visionBadge.dot} ${visionBadge.animate ? 'animate-ping' : ''}`} />
            <Monitor className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">{visionBadge.label}</span>
          </div>
        )}

        {/* Phase 14 Action Status Badge */}
        {currentActionState !== 'IDLE' && currentActionState !== 'COMPLETED' && currentActionState !== 'FAILED' && currentActionState !== 'CANCELLED' && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border bg-indigo-500/15 border-indigo-500/30 text-indigo-400 text-xs font-medium backdrop-blur-md animate-in fade-in transition-all">
            <Settings className="w-3.5 h-3.5 animate-spin" />
            <span className="font-mono text-[10px] tracking-wider uppercase font-semibold">ACTION: {currentActionState}</span>
          </div>
        )}

        <span className={`text-sm font-medium tracking-wide transition-opacity duration-300 ${
          isVoiceActive || isScreenSharing ? 'text-white/60 animate-pulse' : 'text-white/0'
        }`}>
          {getStatusDisplay()}
        </span>
      </div>

      {/* Developer Diagnostics Panel (Hidden from normal users unless toggled) */}
      {showDiagnostics && (
        <div className="absolute top-16 left-4 right-4 z-30 max-h-[460px] overflow-y-auto p-4 rounded-2xl bg-[#121214]/95 border border-white/15 backdrop-blur-xl shadow-2xl text-xs font-mono text-white/80 space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-semibold text-white tracking-wider text-[11px] uppercase flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-blue-400" /> Sufia Reliability & Telemetry System
            </span>
            <button 
              onClick={() => setShowDiagnostics(false)}
              className="text-white/40 hover:text-white text-[11px]"
            >
              ✕
            </button>
          </div>

          {/* Real Latency Telemetry Grid */}
          <div className="p-2.5 rounded-lg bg-blue-500/[0.04] border border-blue-500/20 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-blue-300">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Real Latency Telemetry</span>
              <span className="text-[10px] text-white/40">{telemetryReport.totalSamplesRecorded} samples</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] pt-1">
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <div className="text-white/40 text-[9px] uppercase">TTFA (Audio)</div>
                <div className="font-bold text-emerald-400 text-xs mt-0.5">
                  {telemetryReport.voiceTTFA.lastMs > 0 ? `${telemetryReport.voiceTTFA.lastMs}ms` : 'Ready'}
                </div>
                <div className="text-[8px] text-white/40 mt-0.5">Avg: {telemetryReport.voiceTTFA.averageMs}ms</div>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <div className="text-white/40 text-[9px] uppercase">TTFR (Response)</div>
                <div className="font-bold text-cyan-400 text-xs mt-0.5">
                  {telemetryReport.voiceTTFR.lastMs > 0 ? `${telemetryReport.voiceTTFR.lastMs}ms` : 'Ready'}
                </div>
                <div className="text-[8px] text-white/40 mt-0.5">Avg: {telemetryReport.voiceTTFR.averageMs}ms</div>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <div className="text-white/40 text-[9px] uppercase">Vision Stream</div>
                <div className="font-bold text-purple-400 text-xs mt-0.5">
                  {telemetryReport.visionLatency.lastMs > 0 ? `${telemetryReport.visionLatency.lastMs}ms` : 'Ready'}
                </div>
                <div className="text-[8px] text-white/40 mt-0.5">Avg: {telemetryReport.visionLatency.averageMs}ms</div>
              </div>
            </div>
          </div>

          {/* Runtime & Preview Environment Diagnostic */}
          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Runtime & Environment Diagnostics
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[9px]">
                {nativeBridge.detectEnvironment()}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">Capacitor Native:</span>{' '}
                <span className="font-semibold text-white">
                  {(window as any)?.Capacitor ? 'YES' : 'NO (Safe Web Mode)'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">Android Bridge:</span>{' '}
                <span className="font-semibold text-white">
                  {(window as any)?.AndroidBridge ? 'YES' : 'NO (Browser Fallback)'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">AudioWorklet:</span>{' '}
                <span className="font-semibold text-emerald-400">
                  {typeof window !== 'undefined' && 'audioWorklet' in AudioContext.prototype ? 'SUPPORTED' : 'FALLBACK'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">WebSocket:</span>{' '}
                <span className="font-semibold text-emerald-400">
                  {typeof window !== 'undefined' && 'WebSocket' in window ? 'AVAILABLE' : 'UNAVAILABLE'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">Secure Context:</span>{' '}
                <span className="font-semibold text-cyan-400">
                  {typeof window !== 'undefined' && window.isSecureContext ? 'YES (HTTPS)' : 'DEV (HTTP)'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-black/40 border border-white/5">
                <span className="text-white/40">Active Route:</span>{' '}
                <span className="font-semibold text-white/90 font-mono text-[9px]">
                  {typeof window !== 'undefined' ? window.location.pathname : '/sufia'}
                </span>
              </div>
            </div>
          </div>

          {/* Connection & Queue State */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-white/40 text-[9px] uppercase tracking-wider">Audio Queue Size</div>
              <div className="font-semibold mt-0.5 text-white">
                {voiceManager.getAudioQueueLength()} / 10 (Bounded)
              </div>
            </div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-white/40 text-[9px] uppercase tracking-wider">Auto-Reconnects</div>
              <div className="font-semibold mt-0.5 text-emerald-400">
                {sessionRecoveryManager.getReconnectCount()} attempts
              </div>
            </div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-white/40 text-[9px] uppercase tracking-wider">Visual Context State</div>
              <div className={`font-semibold mt-0.5 ${
                visualContext.state === 'ACTIVE' ? 'text-emerald-400' :
                visualContext.state === 'STALE' ? 'text-amber-400' : 'text-white/50'
              }`}>
                {visualContext.state} ({visualContext.confidence})
              </div>
            </div>

            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-white/40 text-[9px] uppercase tracking-wider">Screen Capture API</div>
              <div className={`font-semibold mt-0.5 ${diagnostics.hasGetDisplayMedia ? 'text-emerald-400' : 'text-amber-400'}`}>
                {diagnostics.hasGetDisplayMedia ? 'SUPPORTED' : 'UNSUPPORTED'}
              </div>
            </div>
          </div>

          {/* Phase 23 Phone-Only Cloud Android Build Pipeline */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>Phase 23 Phone-Only Cloud Build Suite</span>
              </div>
              <button
                onClick={handleRunPhase23Tests}
                disabled={isRunningPhase23Tests}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase23Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase23Tests ? 'Testing...' : 'Run 30 Cloud Build Tests'}</span>
              </button>
            </div>

            {phase23TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 23 Suite Result:</span>
                  <span className={phase23TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase23TestResults.passed}/{phase23TestResults.total} PASSED ({Math.round((phase23TestResults.passed / phase23TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase23TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                          t.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-300' :
                          t.status === 'CONFIGURED' || t.status === 'PREPARED' ? 'bg-cyan-500/20 text-cyan-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>
                          {t.status}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono">
                          {t.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 22 Real Android Build, APK/AAB Generation & Device Validation */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 22 Real Android Build & Device Validation Suite</span>
              </div>
              <button
                onClick={handleRunPhase22Tests}
                disabled={isRunningPhase22Tests}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase22Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase22Tests ? 'Testing...' : 'Run 30 Android Build Tests'}</span>
              </button>
            </div>

            {phase22TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 22 Suite Result:</span>
                  <span className={phase22TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase22TestResults.passed}/{phase22TestResults.total} PASSED ({Math.round((phase22TestResults.passed / phase22TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase22TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                          t.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-300' :
                          t.status === 'PREPARED' || t.status === 'BUILDABLE' ? 'bg-cyan-500/20 text-cyan-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>
                          {t.status}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono">
                          {t.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 21 Android Application Packaging & Native Bridge Readiness */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 21 Android Packaging & Native Bridge Suite</span>
              </div>
              <button
                onClick={handleRunPhase21Tests}
                disabled={isRunningPhase21Tests}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase21Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase21Tests ? 'Testing...' : 'Run 40 Android Bridge Tests'}</span>
              </button>
            </div>

            {phase21TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 21 Suite Result:</span>
                  <span className={phase21TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase21TestResults.passed}/{phase21TestResults.total} PASSED ({Math.round((phase21TestResults.passed / phase21TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase21TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 20 Production Deployment & Backend Infrastructure Validation */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Phase 20 Production & Backend Infra Suite</span>
              </div>
              <button
                onClick={handleRunPhase20Tests}
                disabled={isRunningPhase20Tests}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase20Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase20Tests ? 'Testing...' : 'Run 40 Production Tests'}</span>
              </button>
            </div>

            {phase20TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 20 Suite Result:</span>
                  <span className={phase20TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase20TestResults.passed}/{phase20TestResults.total} PASSED ({Math.round((phase20TestResults.passed / phase20TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase20TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 19 Android Readiness & Mobile Production Architecture */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 19 Android Readiness & Mobile Suite</span>
              </div>
              <button
                onClick={handleRunPhase19Tests}
                disabled={isRunningPhase19Tests}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase19Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase19Tests ? 'Testing...' : 'Run 30 Mobile Tests'}</span>
              </button>
            </div>

            {phase19TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 19 Suite Result:</span>
                  <span className={phase19TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase19TestResults.passed}/{phase19TestResults.total} PASSED ({Math.round((phase19TestResults.passed / phase19TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase19TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 15 Advanced Adaptive Intelligence Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 15 Advanced Adaptive Intelligence Suite</span>
              </div>
              <button
                onClick={handleRunPhase15Tests}
                disabled={isRunningPhase15Tests}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase15Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase15Tests ? 'Testing...' : 'Run Phase 15 Tests'}</span>
              </button>
            </div>

            {phase15TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 15 Suite Result:</span>
                  <span className={phase15TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase15TestResults.passed}/{phase15TestResults.total} PASSED ({Math.round((phase15TestResults.passed / phase15TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase15TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 14 Autonomous Tool Intelligence Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 14 Autonomous Tool Intelligence Suite</span>
              </div>
              <button
                onClick={handleRunPhase14Tests}
                disabled={isRunningPhase14Tests}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase14Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase14Tests ? 'Testing...' : 'Run Phase 14 Tests'}</span>
              </button>
            </div>

            {phase14TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 14 Suite Result:</span>
                  <span className={phase14TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase14TestResults.passed}/{phase14TestResults.total} PASSED ({Math.round((phase14TestResults.passed / phase14TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase14TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 13 Advanced Memory & Long-Term Intelligence Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 13 Advanced Memory & Personalization Suite</span>
              </div>
              <button
                onClick={handleRunPhase13Tests}
                disabled={isRunningPhase13Tests}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase13Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase13Tests ? 'Testing...' : 'Run 21 Phase 13 Tests'}</span>
              </button>
            </div>

            {phase13TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 13 Suite Result:</span>
                  <span className={phase13TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase13TestResults.passed}/{phase13TestResults.total} PASSED ({Math.round((phase13TestResults.passed / phase13TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase13TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 12 Human-Like Conversational Intelligence Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Phase 12 Conversational Intelligence Suite</span>
              </div>
              <button
                onClick={handleRunPhase12Tests}
                disabled={isRunningPhase12Tests}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase12Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase12Tests ? 'Testing...' : 'Run 25 Phase 12 Tests'}</span>
              </button>
            </div>

            {phase12TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 12 Suite Result:</span>
                  <span className={phase12TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase12TestResults.passed}/{phase12TestResults.total} PASSED ({Math.round((phase12TestResults.passed / phase12TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase12TestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 11 Context Orchestrator & Multimodal Intelligence Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>Phase 11 Context Orchestration Suite</span>
              </div>
              <button
                onClick={handleRunOrchestratorTests}
                disabled={isRunningOrchestratorTests}
                className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 hover:bg-purple-500/30 text-purple-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningOrchestratorTests ? 'animate-spin' : ''}`} />
                <span>{isRunningOrchestratorTests ? 'Testing...' : 'Run 12 Orchestration Tests'}</span>
              </button>
            </div>

            {orchestratorTestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-44 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Orchestration Suite Result:</span>
                  <span className={orchestratorTestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {orchestratorTestResults.passed}/{orchestratorTestResults.total} PASSED ({Math.round((orchestratorTestResults.passed / orchestratorTestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {orchestratorTestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 10 Reliability & Failure Injection Test Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span>Phase 10 Reliability & Recovery Suite</span>
              </div>
              <button
                onClick={handleRunReliabilityTests}
                disabled={isRunningReliabilityTests}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 text-blue-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningReliabilityTests ? 'animate-spin' : ''}`} />
                <span>{isRunningReliabilityTests ? 'Testing...' : 'Run 15 Reliability Tests'}</span>
              </button>
            </div>

            {reliabilityTestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-44 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Reliability Suite Result:</span>
                  <span className={reliabilityTestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {reliabilityTestResults.passed}/{reliabilityTestResults.total} PASSED ({Math.round((reliabilityTestResults.passed / reliabilityTestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {reliabilityTestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70 font-mono shrink-0">
                        {t.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 9 Safety & Trading Guardrails Section */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 9 Safety & Guardrails Engine</span>
              </div>
              <button
                onClick={handleRunGuardrailsTests}
                disabled={isRunningGuardrailTests}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningGuardrailTests ? 'animate-spin' : ''}`} />
                <span>{isRunningGuardrailTests ? 'Running...' : 'Run 20 Guardrail Tests'}</span>
              </button>
            </div>

            {guardrailTestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-44 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Guardrails Summary:</span>
                  <span className={guardrailTestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {guardrailTestResults.passed}/{guardrailTestResults.total} PASSED ({Math.round((guardrailTestResults.passed / guardrailTestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {guardrailTestResults.results.map((t) => (
                    <div key={t.id} className="flex items-start justify-between text-[10px] p-1 rounded bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-1.5 flex-1 pr-2">
                        {t.passed ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="text-white/80">{t.id}. {t.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono">
                        <span className="text-white/40">[{t.actualSignal}]</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70">{t.reasonCode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Temporary Notification / Error Toast */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-sm px-4 py-2 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2 backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Live Screen Preview PIP */}
      {isScreenSharing && (
        <div className="relative z-20 w-full max-w-xs mb-4 rounded-xl overflow-hidden border border-emerald-500/30 shadow-2xl bg-black/80 flex flex-col group animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-950/40 border-b border-emerald-500/20 text-[9px] font-mono font-medium text-emerald-400">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              SUFIA LIVE SCREEN FEED
            </span>
            <span className="text-white/40 group-hover:text-white/80 transition-colors text-[8px]">1280x720 (FPS: 10)</span>
          </div>
          <div className="relative w-full aspect-video bg-black/60">
            <video 
              id="sufia-screen-preview" 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className="relative z-10 w-full flex items-center justify-center gap-4 max-w-md pb-4">
        {/* Screen Share Toggle Button */}
        <button
          onClick={handleToggleScreenShare}
          className={`flex items-center justify-center w-12 h-12 rounded-full border transition-all duration-300 ${
            isScreenSharing 
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
              : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title={isScreenSharing ? "Stop Screen Share" : "Share Screen with Sufia"}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Primary Voice Mic Toggle Button */}
        <button
          onClick={handleToggleVoice}
          className={`flex items-center justify-center w-14 h-14 rounded-full border transition-all duration-300 shadow-xl ${
            isVoiceActive
              ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_30px_rgba(6,182,212,0.5)] scale-105'
              : 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:scale-105'
          }`}
          title={isVoiceActive ? "Turn off Voice" : "Turn on Voice"}
        >
          <Repeat className={`w-6 h-6 ${isVoiceActive ? 'animate-spin-slow' : ''}`} />
        </button>
      </div>
    </div>
  );
}

export default function Sufia() {
  return (
    <AssistantProvider>
      <SufiaVoiceScreen />
    </AssistantProvider>
  );
}
