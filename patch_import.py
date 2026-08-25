import sys

with open('src/lib/conversation/contextOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

if 'tradingOrchestrator' not in content:
    content = content.replace("import { toolRouter } from '../tools/toolRouter';", "import { toolRouter } from '../tools/toolRouter';\nimport { tradingOrchestrator } from '../trading/tradingOrchestrator';")

with open('src/lib/conversation/contextOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)
