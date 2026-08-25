import re

with open('src/pages/Sufia.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'phase17TestSuite' not in content:
    content = content.replace("import { phase16TestSuite, Phase16TestCaseResult } from '../lib/trading/phase16TestSuite';", "import { phase16TestSuite, Phase16TestCaseResult } from '../lib/trading/phase16TestSuite';\nimport { phase17TestSuite, Phase17TestCaseResult } from '../lib/trading/phase17TestSuite';")

# Add state
state_code = """
  // Phase 17 Dual-Market Intelligence
  const [isRunningPhase17Tests, setIsRunningPhase17Tests] = useState(false);
  const [phase17TestResults, setPhase17TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase17TestCaseResult[] } | null>(null);
"""
if 'isRunningPhase17Tests' not in content:
    content = content.replace("const [isRunningPhase16Tests, setIsRunningPhase16Tests] = useState(false);", state_code.strip() + "\n\n  const [isRunningPhase16Tests, setIsRunningPhase16Tests] = useState(false);")

# Add handler
handler_code = """
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
"""
if 'handleRunPhase17Tests' not in content:
    content = content.replace("const handleRunPhase16Tests = async () => {", handler_code.strip() + "\n\n  const handleRunPhase16Tests = async () => {")

# Add UI
ui_code = """
          {/* Phase 17 Dual-Market Intelligence Orchestration */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Settings className="w-3.5 h-3.5 text-rose-400" />
                <span>Phase 17 Dual-Market Intelligence</span>
              </div>
              <button
                onClick={handleRunPhase17Tests}
                disabled={isRunningPhase17Tests}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500/30 text-rose-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase17Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase17Tests ? 'Testing...' : 'Run Phase 17 Tests'}</span>
              </button>
            </div>

            {phase17TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 17 Suite Result:</span>
                  <span className={phase17TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase17TestResults.passed}/{phase17TestResults.total} PASSED ({Math.round((phase17TestResults.passed / phase17TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase17TestResults.results.map((t) => (
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
if 'Phase 17 Dual-Market Intelligence Orchestration' not in content:
    content = content.replace("{/* Phase 16 Production-Grade Trading Intelligence Orchestration */}", ui_code.strip() + "\n\n          {/* Phase 16 Production-Grade Trading Intelligence Orchestration */}")

with open('src/pages/Sufia.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

