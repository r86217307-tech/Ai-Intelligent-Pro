import re

with open('src/lib/trading/tradingOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix news logic
old_news = """
    // 13. Evaluate Fundamental/News context for Real Forex only
    if (result.marketType === 'REAL_FOREX') {
       const newsResult = await newsManager.synthesizeNewsContext(result.symbol || '');
       if (newsResult.bias !== 'NEUTRAL') {
         result.newsContext = newsResult.bias;
         result.confluence.factors.push(`Fundamental Bias: ${newsResult.bias}`);
       }
    } else if (result.marketType === 'OTC') {
"""

new_news = """
    // 13. Evaluate Fundamental/News context for Real Forex only
    if (result.marketType === 'REAL_FOREX') {
       const newsResult = await newsManager.analyzePairFundamentals(result.symbol || '');
       if (newsResult && newsResult.newsSignal !== 'NO_TRADE') {
         result.newsContext = newsResult.newsSignal;
         result.confluence.factors.push(`Fundamental Bias: ${newsResult.newsSignal}`);
       }
    } else if (result.marketType === 'OTC') {
"""

content = content.replace(old_news.strip(), new_news.strip())
with open('src/lib/trading/tradingOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)

with open('src/lib/trading/phase16TestSuite.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("synthesizeNewsContext = async () => ({ bias: 'NEUTRAL' });", "analyzePairFundamentals = async () => ({ newsSignal: 'NO_TRADE' });")
content = content.replace("synthesizeNewsContext = async () => ({ bias: 'BEARISH' });", "analyzePairFundamentals = async () => ({ newsSignal: 'PUT' });")
content = content.replace("synthesizeNewsContext = async () => ({ bias: 'BULLISH' });", "analyzePairFundamentals = async () => ({ newsSignal: 'CALL' });")
content = content.replace("newsContext === 'BULLISH'", "newsContext === 'CALL'")
content = content.replace("Fundamental News Bias", "Fundamental News Bias")

with open('src/lib/trading/phase16TestSuite.ts', 'w', encoding='utf-8') as f:
    f.write(content)

with open('src/lib/conversation/contextOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_ctx = """
        return {
          domain: 'chart_analysis',
          spokenResponse: finalSpoken,
          authoritativeSignal: p16Res.finalSignal,
          freshness: this.getFreshnessMeta('chart_analysis', bridgeRes.timestamp, 'tradingOrchestrator', p16Res.freshnessValid ? 'FRESH' : 'STALE'),
        };
"""

new_ctx = """
        return {
          domain: 'chart_analysis',
          spokenResponse: finalSpoken,
          authoritativeSignal: (p16Res.finalSignal === 'INSUFFICIENT_DATA' ? 'NO_TRADE' : p16Res.finalSignal) as any,
          freshness: this.getFreshnessMeta('chart_analysis', bridgeRes.timestamp, 'tradingOrchestrator', p16Res.freshnessValid ? 'FRESH' : 'STALE'),
        };
"""
content = content.replace(old_ctx.strip(), new_ctx.strip())

with open('src/lib/conversation/contextOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)
