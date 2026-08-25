import re

with open('src/pages/Sufia.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'phase18TestSuite' not in content:
    content = content.replace("import { phase17TestSuite, Phase17TestCaseResult } from '../lib/trading/phase17TestSuite';", "import { phase17TestSuite, Phase17TestCaseResult } from '../lib/trading/phase17TestSuite';\nimport { phase18TestSuite, Phase18TestCaseResult } from '../lib/trading/phase18TestSuite';")

state_code = """
  // Phase 18 Production Security & Hardening
  const [isRunningPhase18Tests, setIsRunningPhase18Tests] = useState(false);
  const [phase18TestResults, setPhase18TestResults] = useState<{ total: number; passed: number; failed: number; results: Phase18TestCaseResult[] } | null>(null);
"""
if 'isRunningPhase18Tests' not in content:
    content = content.replace("const [isRunningPhase17Tests, setIsRunningPhase17Tests] = useState(false);", state_code.strip() + "\n\n  const [isRunningPhase17Tests, setIsRunningPhase17Tests] = useState(false);")

handler_code = """
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
"""
if 'handleRunPhase18Tests' not in content:
    content = content.replace("const handleRunPhase17Tests = async () => {", handler_code.strip() + "\n\n  const handleRunPhase17Tests = async () => {")

ui_code = """
          {/* Phase 18 Production Security & Hardening */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span>Phase 18 Production Hardening</span>
              </div>
              <button
                onClick={handleRunPhase18Tests}
                disabled={isRunningPhase18Tests}
                className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 text-blue-300 text-[10px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningPhase18Tests ? 'animate-spin' : ''}`} />
                <span>{isRunningPhase18Tests ? 'Testing...' : 'Run Phase 18 Tests'}</span>
              </button>
            </div>

            {phase18TestResults && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-white/80">Phase 18 Suite Result:</span>
                  <span className={phase18TestResults.failed === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {phase18TestResults.passed}/{phase18TestResults.total} PASSED ({Math.round((phase18TestResults.passed / phase18TestResults.total) * 100)}%)
                  </span>
                </div>
                <div className="space-y-1">
                  {phase18TestResults.results.map((t) => (
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
if 'Phase 18 Production Security' not in content:
    content = content.replace("{/* Phase 17 Dual-Market Intelligence Orchestration */}", ui_code.strip() + "\n\n          {/* Phase 17 Dual-Market Intelligence Orchestration */}")

with open('src/pages/Sufia.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

