import sys

with open('src/lib/conversation/contextOrchestrator.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "const bridgeRes = await sufiaTradingBridge.analyzeCurrentChart();" in line:
        skip = True
        new_lines.append("      // Phase 16: Execute authoritative chart analysis via trading orchestrator\n")
        new_lines.append("      const p16Res = await tradingOrchestrator.orchestrate1MTrading();\n")
        new_lines.append("      const bridgeRes = sufiaTradingBridge.getLatestAnalysis();\n")
        new_lines.append("\n")
        new_lines.append("      if (p16Res.dataValid && bridgeRes) {\n")
        new_lines.append("        const p12Spoken = sufiaTradingBridge.formatConversationalSummary(bridgeRes, !p16Res.freshnessValid);\n")
        new_lines.append("        let finalSpoken = p12Spoken;\n")
        new_lines.append("        if (p16Res.finalSignal === 'NO_TRADE' && p16Res.explanation) {\n")
        new_lines.append("            finalSpoken = p16Res.explanation;\n")
        new_lines.append("        }\n")
        new_lines.append("        return {\n")
        new_lines.append("          domain: 'chart_analysis',\n")
        new_lines.append("          spokenResponse: finalSpoken,\n")
        new_lines.append("          authoritativeSignal: p16Res.finalSignal,\n")
        new_lines.append("          freshness: this.getFreshnessMeta('chart_analysis', bridgeRes.timestamp, 'tradingOrchestrator', p16Res.freshnessValid ? 'FRESH' : 'STALE'),\n")
        new_lines.append("        };\n")
        new_lines.append("      } else {\n")
        new_lines.append("        return {\n")
        new_lines.append("          domain: 'chart_analysis',\n")
        new_lines.append("          spokenResponse: p16Res.explanation || 'চার্ট অ্যানালাইসিস করার সময় একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।',\n")
        new_lines.append("          authoritativeSignal: 'NO_TRADE',\n")
        new_lines.append("          freshness: this.getFreshnessMeta('chart_analysis', Date.now(), 'tradingOrchestrator', 'UNAVAILABLE'),\n")
        new_lines.append("        };\n")
        new_lines.append("      }\n")
        continue

    if skip:
        if "    // Follow-up question about existing analysis" in line:
            skip = False
            new_lines.append(line)
        continue

    new_lines.append(line)

with open('src/lib/conversation/contextOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
