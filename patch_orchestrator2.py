import re

with open('src/lib/trading/tradingOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

explanation_logic = """
    // 20. Explain the result naturally
    if (result.finalSignal === 'NO_TRADE' || result.finalSignal === 'INSUFFICIENT_DATA') {
      result.explanation = `Analyzer সিদ্ধান্ত: ${result.finalSignal}। ${safetyCheck?.spokenExplanation || analysis.reasoning}`;
    } else {
      if (result.marketType === 'OTC') {
        result.explanation = `Market: OTC\\nTimeframe: 1M\\nStructure: ${result.structure}\\nS/R: ${result.dynamicSRZones?.length ? result.dynamicSRZones.map(z => z.price).join(', ') : 'N/A'}\\nSNR: ${result.snrStrength}/10\\nLiquidity: ${result.liquidity.length > 0 ? 'Swept' : 'None'}\\nSMC: ${result.smcDetected ? 'Detected' : 'None'}\\nPrice Action: ${analysis.bullishEvidence?.join(', ') || ''} ${analysis.bearishEvidence?.join(', ') || ''}\\nDecision: ${result.finalSignal} (${result.signalState})`;
      } else {
        result.explanation = `Market: REAL FOREX\\nTimeframe: 1M\\nTechnical Bias: ${result.structure}\\nFundamental Bias: ${result.newsContext || 'N/A'}\\nS/R: ${result.dynamicSRZones?.length ? result.dynamicSRZones.map(z => z.price).join(', ') : 'N/A'}\\nSNR: ${result.snrStrength}/10\\nLiquidity: ${result.liquidity.length > 0 ? 'Swept' : 'None'}\\nVolatility: ${result.volatility}\\nDecision: ${result.finalSignal} (${result.signalState})`;
      }
    }
"""

# replace the old section
content = re.sub(r"    // 20\. Explain the result naturally.*", explanation_logic + "\n    return result;\n  }\n}\n\nexport const tradingOrchestrator = TradingOrchestrator.getInstance();", content, flags=re.DOTALL)

with open('src/lib/trading/tradingOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)

