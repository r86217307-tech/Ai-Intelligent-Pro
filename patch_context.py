import re

with open('src/lib/conversation/contextOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """
      if (p16Res.dataValid && bridgeRes) {
        const p12Spoken = sufiaTradingBridge.formatConversationalSummary(bridgeRes, !p16Res.freshnessValid);
        let finalSpoken = p12Spoken;
        if (p16Res.finalSignal === 'NO_TRADE' && p16Res.explanation) {
            finalSpoken = p16Res.explanation;
        }
"""

new_logic = """
      if (p16Res.dataValid && bridgeRes) {
        const p12Spoken = sufiaTradingBridge.formatConversationalSummary(bridgeRes, !p16Res.freshnessValid);
        let finalSpoken = p12Spoken;
        
        // Phase 17: Override with structured dual-market explanation if available
        if (p16Res.explanation && p16Res.explanation.includes('Market:')) {
            finalSpoken = p16Res.explanation;
        } else if (p16Res.finalSignal === 'NO_TRADE' && p16Res.explanation) {
            finalSpoken = p16Res.explanation;
        }
"""

content = content.replace(old_logic.strip(), new_logic.strip())

with open('src/lib/conversation/contextOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)

