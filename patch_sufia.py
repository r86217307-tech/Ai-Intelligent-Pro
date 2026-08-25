import re

with open('src/pages/Sufia.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'phase16TestSuite' not in content:
    content = content.replace("import { phase15TestSuite, Phase15TestCaseResult } from '../lib/adaptive/phase15TestSuite';", "import { phase15TestSuite, Phase15TestCaseResult } from '../lib/adaptive/phase15TestSuite';\nimport { phase16TestSuite, Phase16TestCaseResult } from '../lib/trading/phase16TestSuite';")

# Add state
state_code = """
  // Phase 16 Production-Grade Trading Intelligence Orchestration
  const [isRunningPhase16Tests, setIsRunningPhase16Tests] = useState(false);
  const [phase16TestResults, setPhase16TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase16TestCaseResult[] } | null>(null);
"""
if 'isRunningPhase16Tests' not in content:
    content = content.replace("const [currentActionState, setCurrentActionState]", state_code.strip() + "\n\n  const [currentActionState, setCurrentActionState]")

# Add handler
handler_code = """
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
"""
if 'handleRunPhase16Tests' not in content:
    content = content.replace("const visionBadge = getVisionBadgeInfo();", handler_code.strip() + "\n\n  const visionBadge = getVisionBadgeInfo();")

# Add UI
ui_code = """
          {/* Phase 16 Production-Grade Trading Intelligence Orchestration */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phase 16 Production Trading Orchestration</span>
              </div>
              <button
                onClick={handleRunPhase16Tests}
                disabled={isRunningPhase16Tests}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase16Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase16Tests ? 'Testing...' : 'Run Phase 16 Tests'}</span>
              </button>
            </div>

            {phase16TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 16 Suite Result:</span>
                  <span className={phase16TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase16TestResults.passed}/{phase16TestResults.total} PASSED ({Math.round((phase16TestResults.passed / phase16TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase16TestResults.results.map((t) => (
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
"""
if 'Phase 16 Production-Grade Trading Intelligence Orchestration' not in content:
    content = content.replace("{/* Phase 15 Advanced Adaptive Intelligence Section */}", ui_code.strip() + "\n\n          {/* Phase 15 Advanced Adaptive Intelligence Section */}")

with open('src/pages/Sufia.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
