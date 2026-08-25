with open('src/lib/trading/tradingOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_conflict = """
      if ((result.structure === 'BULLISH' && result.newsContext.includes('BEARISH')) || 
          (result.structure === 'BEARISH' && result.newsContext.includes('BULLISH'))) {
"""

new_conflict = """
      if ((result.structure === 'BULLISH' && result.newsContext === 'PUT') || 
          (result.structure === 'BEARISH' && result.newsContext === 'CALL')) {
"""

content = content.replace(old_conflict.strip(), new_conflict.strip())

with open('src/lib/trading/tradingOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)
