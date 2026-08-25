import re

with open('src/lib/trading/tradingOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's verify the type definition
new_def = "finalSignal: 'CALL' | 'PUT' | 'NO_TRADE' | 'INSUFFICIENT_DATA';"
content = content.replace("finalSignal: 'CALL' | 'PUT' | 'NO_TRADE';", new_def)

# Also let's fix the if statement
content = content.replace("result.finalSignal === 'INSUFFICIENT_DATA'", "(result.finalSignal as any) === 'INSUFFICIENT_DATA'")

with open('src/lib/trading/tradingOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)

