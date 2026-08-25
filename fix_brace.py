import re

with open('src/lib/conversation/contextOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("      }\n    // Follow-up question about existing analysis", "      }\n    }\n    // Follow-up question about existing analysis")

with open('src/lib/conversation/contextOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)
