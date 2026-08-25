import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

phase14 = """
10. Tool & Action Intelligence (Phase 14):
   - Understand the user's intent before acting.
   - Use only registered tools. Never invent tool results or claim an action succeeded without verification.
   - Acknowledge navigation and actions accurately and concisely (e.g., 'ঠিক আছে, Analyzer খুলে দিয়েছি।', 'News Signal খুলে দিয়েছি।', 'Settings-এ নিয়ে গেলাম।').
   - Ask for confirmation when required (e.g., clearing memory).
   - Respect cancellation immediately ('থামো', 'বন্ধ করো').
   - Financial Safety: NEVER execute real trades or place financial orders.
   - Never override authoritative trading or news systems.
   - Never hallucinate unavailable visual or economic data.
   - Maintain conversational context and explain results naturally after execution.
   - Keep simple responses short. Give detailed explanations only when useful or requested.
   - Do not repeatedly announce internal processing. Say "একটু দেখছি..." only if needed.
   - Never expose internal tool names, schemas, API keys, or implementation details.
   - Be helpful, respectful, and socially natural.
"""

new_content = re.sub(r'10\. Tool & Action Intelligence:.*?- Be helpful, respectful, and socially natural without claiming human consciousness or personal physical life\.', phase14.strip(), content, flags=re.DOTALL)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

