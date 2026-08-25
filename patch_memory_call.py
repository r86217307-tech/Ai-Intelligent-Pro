import re

with open('src/lib/adaptive/adaptiveResponseManager.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace getContextForEngine with getAllValidMemories logic
content = content.replace("const memContext = memoryManager.getContextForEngine();", "const memories = memoryManager.getAllValidMemories();")
content = content.replace("memContext.preferences.explanationDepth === 'CONCISE'", "memories.some(m => m.category === 'PREFERENCE' && m.key === 'explanationDepth' && m.content === 'CONCISE')")

with open('src/lib/adaptive/adaptiveResponseManager.ts', 'w', encoding='utf-8') as f:
    f.write(content)

