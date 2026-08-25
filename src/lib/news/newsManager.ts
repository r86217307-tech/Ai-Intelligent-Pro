import { ForexNewsItem, ForexNewsAnalysisResult } from '../../types';
import { sufiaTradingBridge, NormalizedTradingResult } from '../trading/sufiaTradingBridge';
import { getApiUrl } from '../api';

export interface NewsCalendarResponse {
  success: boolean;
  provider: string;
  count: number;
  events: ForexNewsItem[];
  marketStatus?: {
    isOpen: boolean;
    status: 'OPEN' | 'CLOSED' | 'LIMITED';
    reason: string;
    session: string;
  };
  timestamp: string;
}

export interface NewsPairAnalysisResponse {
  success: boolean;
  result?: ForexNewsAnalysisResult;
  error?: string;
  message?: string;
}

export interface NewsSynthesisResult {
  technical: NormalizedTradingResult | null;
  fundamental: ForexNewsAnalysisResult | null;
  alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'CONFLICTED' | 'NEUTRAL_OR_CAUTION';
  finalDecision: 'CALL' | 'PUT' | 'NO_TRADE';
  spokenSummary: string;
  reasoning: string;
  hasConflict: boolean;
  timestamp: number;
}

export type NewsQueryType = 
  | 'TODAY_HIGH_IMPACT'
  | 'SPECIFIC_EVENT'
  | 'CPI_INQUIRY'
  | 'NFP_INQUIRY'
  | 'CENTRAL_BANK_POLICY'
  | 'CURRENCY_IMPACT'
  | 'PAIR_FUNDAMENTAL'
  | 'NEWS_AND_CHART_SYNTHESIS'
  | 'EVENT_TIMING'
  | 'GENERAL_NEWS';

export class NewsManager {
  private static instance: NewsManager;
  private calendarCache: { events: ForexNewsItem[]; timestamp: number } | null = null;
  private pairAnalysisCache: Map<string, { result: ForexNewsAnalysisResult; timestamp: number }> = new Map();
  private inFlightCalendarPromise: Promise<ForexNewsItem[]> | null = null;
  private inFlightPairPromises: Map<string, Promise<ForexNewsAnalysisResult | null>> = new Map();

  // Freshness TTLs
  private static readonly CALENDAR_CACHE_TTL_MS = 60 * 1000; // 1 minute
  private static readonly PAIR_ANALYSIS_CACHE_TTL_MS = 90 * 1000; // 1.5 minutes

  // High-Impact Event Keywords
  public static readonly HIGH_IMPACT_KEYWORDS = [
    'nfp', 'non-farm', 'employment change', 'cpi', 'consumer price index',
    'core cpi', 'fomc', 'federal funds rate', 'fed interest rate',
    'ecb', 'main refinancing rate', 'monetary policy statement',
    'boe', 'official bank rate', 'boj', 'policy rate',
    'gdp', 'gross domestic product', 'retail sales', 'core retail sales',
    'unemployment rate', 'jobless claims', 'pmi', 'ism services',
    'ism manufacturing', 'ppi', 'interest rate decision'
  ];

  private lastQueriedEvent: ForexNewsItem | null = null;
  private lastQueriedCurrency: string | null = null;
  private lastQueriedPair: string = 'EUR/USD';

  private constructor() {}

  public static getInstance(): NewsManager {
    if (!NewsManager.instance) {
      NewsManager.instance = new NewsManager();
    }
    return NewsManager.instance;
  }

  /**
   * Fetch live economic calendar events with caching and deduplication
   */
  public async getCalendarEvents(forceRefresh = false): Promise<ForexNewsItem[]> {
    const now = Date.now();
    if (!forceRefresh && this.calendarCache && (now - this.calendarCache.timestamp < NewsManager.CALENDAR_CACHE_TTL_MS)) {
      return this.calendarCache.events;
    }

    if (this.inFlightCalendarPromise) {
      return this.inFlightCalendarPromise;
    }

    this.inFlightCalendarPromise = (async () => {
      try {
        const res = await fetch(getApiUrl('/api/forex-news/calendar'));
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: NewsCalendarResponse = await res.json();
        if (data && Array.isArray(data.events)) {
          this.calendarCache = {
            events: data.events,
            timestamp: Date.now(),
          };
          return data.events;
        }
        return this.calendarCache?.events || [];
      } catch (err) {
        console.warn('[NewsManager] Failed to fetch calendar, using cached or fallback:', err);
        return this.calendarCache?.events || [];
      } finally {
        this.inFlightCalendarPromise = null;
      }
    })();

    return this.inFlightCalendarPromise;
  }

  /**
   * Get filtered high impact events
   */
  public async getHighImpactEvents(currencyFilter?: string): Promise<ForexNewsItem[]> {
    const events = await this.getCalendarEvents();
    return events.filter(e => {
      const isHigh = e.impact === 'HIGH' || this.isKnownHighImpactEvent(e.event);
      if (!isHigh) return false;
      if (currencyFilter && currencyFilter !== 'ALL') {
        return e.currency.toUpperCase() === currencyFilter.toUpperCase();
      }
      return true;
    });
  }

  /**
   * Check if event title matches known high-impact macroeconomic reports
   */
  public isKnownHighImpactEvent(eventTitle: string): boolean {
    if (!eventTitle) return false;
    const lower = eventTitle.toLowerCase();
    return NewsManager.HIGH_IMPACT_KEYWORDS.some(k => lower.includes(k));
  }

  /**
   * Analyze Forex pair fundamentals using the authoritative backend engine
   */
  public async analyzePairFundamentals(pair = 'EUR/USD', forceRefresh = false): Promise<ForexNewsAnalysisResult | null> {
    const normPair = pair.toUpperCase().trim();
    this.lastQueriedPair = normPair;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this.pairAnalysisCache.get(normPair);
      if (cached && (now - cached.timestamp < NewsManager.PAIR_ANALYSIS_CACHE_TTL_MS)) {
        return cached.result;
      }
    }

    const inFlight = this.inFlightPairPromises.get(normPair);
    if (inFlight) {
      return inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const res = await fetch(getApiUrl('/api/forex-news/analyze'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forexPair: normPair }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: NewsPairAnalysisResponse = await res.json();
        if (data && data.success && data.result) {
          this.pairAnalysisCache.set(normPair, {
            result: data.result,
            timestamp: Date.now(),
          });
          if (data.result.primaryEvent) {
            this.lastQueriedEvent = data.result.primaryEvent;
            this.lastQueriedCurrency = data.result.primaryEvent.currency;
          }
          return data.result;
        }
        return null;
      } catch (err) {
        console.error(`[NewsManager] Error analyzing pair ${normPair}:`, err);
        return null;
      } finally {
        this.inFlightPairPromises.delete(normPair);
      }
    })();

    this.inFlightPairPromises.set(normPair, fetchPromise);
    return fetchPromise;
  }

  /**
   * Determine query type from natural language utterance
   */
  public detectNewsQueryType(text: string): NewsQueryType {
    if (!text) return 'GENERAL_NEWS';
    const lower = text.toLowerCase().trim();

    // Chart & News synthesis
    if (
      (lower.includes('chart') || lower.includes('চার্ট')) && 
      (lower.includes('news') || lower.includes('নিউজ') || lower.includes('fundamental'))
    ) {
      return 'NEWS_AND_CHART_SYNTHESIS';
    }

    // NFP
    if (lower.includes('nfp') || lower.includes('non-farm') || lower.includes('non farm') || lower.includes('কর্মসংস্থান')) {
      return 'NFP_INQUIRY';
    }

    // CPI / Inflation
    if (lower.includes('cpi') || lower.includes('core cpi') || lower.includes('inflation') || lower.includes('মুদ্রাস্ফীতি')) {
      return 'CPI_INQUIRY';
    }

    // Central Bank / FOMC / ECB / BOE / BOJ
    if (
      lower.includes('fomc') || lower.includes('fed') || lower.includes('ecb') || 
      lower.includes('boe') || lower.includes('boj') || lower.includes('interest rate') ||
      lower.includes('সুদের হার') || lower.includes('hawkish') || lower.includes('dovish')
    ) {
      return 'CENTRAL_BANK_POLICY';
    }

    // Today's high impact list
    if (
      lower.includes('আজকের high impact') || lower.includes('আজকে কি news') || 
      lower.includes('high impact news') || lower.includes('আজকের নিউজ') || 
      lower.includes('today news') || lower.includes('news list') ||
      lower.includes('কী কী news আছে') || lower.includes('আজকে কি কি নিউজ')
    ) {
      return 'TODAY_HIGH_IMPACT';
    }

    // Currency Impact
    if (lower.includes('affect') || lower.includes('effect') || lower.includes('কোন currency') || lower.includes('কারেন্সিতে প্রভাব')) {
      return 'CURRENCY_IMPACT';
    }

    // Pair specific (e.g. EUR/USD, GBP/USD, USD/JPY)
    if (
      lower.includes('eur/usd') || lower.includes('gbp/usd') || lower.includes('usd/jpy') ||
      lower.includes('aud/usd') || lower.includes('usd/cad') || lower.includes('usd/chf') ||
      lower.includes('nzd/usd') || lower.includes('eurusd') || lower.includes('gbpusd')
    ) {
      return 'PAIR_FUNDAMENTAL';
    }

    // Timing
    if (lower.includes('কবে') || lower.includes('কখন') || lower.includes('সময়') || lower.includes('time') || lower.includes('when')) {
      return 'EVENT_TIMING';
    }

    return 'GENERAL_NEWS';
  }

  /**
   * Find specific high-impact event by keyword or currency
   */
  public async findEventByKeyword(keyword: string): Promise<ForexNewsItem | null> {
    const events = await this.getCalendarEvents();
    const lower = keyword.toLowerCase().trim();

    // 1. Direct title search
    const matched = events.find(e => e.event.toLowerCase().includes(lower) || e.id.toLowerCase().includes(lower));
    if (matched) return matched;

    // 2. Currency search
    const currMatch = events.find(e => e.currency.toLowerCase() === lower && e.impact === 'HIGH');
    if (currMatch) return currMatch;

    return null;
  }

  /**
   * Answer natural voice/text questions about Forex Fundamentals and News
   */
  public async answerNewsQuery(query: string): Promise<string> {
    const lower = query.toLowerCase().trim();
    const queryType = this.detectNewsQueryType(query);

    // 1. Chart + News Synthesis
    if (queryType === 'NEWS_AND_CHART_SYNTHESIS') {
      return this.synthesizeChartAndNews(this.extractPairFromText(query) || this.lastQueriedPair);
    }

    // 2. NFP Query
    if (queryType === 'NFP_INQUIRY') {
      const nfpEvent = await this.findEventByKeyword('nfp') || await this.findEventByKeyword('non-farm');
      if (!nfpEvent) {
        return 'এই মুহূর্তে ক্যালেন্ডারে কোনো NFP (Non-Farm Payrolls) ইভেন্ট পাওয়া যায়নি।';
      }
      this.lastQueriedEvent = nfpEvent;
      this.lastQueriedCurrency = 'USD';

      return this.formatEventExplanation(nfpEvent, query);
    }

    // 3. CPI Query
    if (queryType === 'CPI_INQUIRY') {
      const cpiEvent = (lower.includes('core') ? await this.findEventByKeyword('core cpi') : null) || 
                       await this.findEventByKeyword('cpi');
      if (!cpiEvent) {
        return 'এই মুহূর্তে ক্যালেন্ডারে কোনো CPI (Consumer Price Index) ইভেন্ট পাওয়া যায়নি।';
      }
      this.lastQueriedEvent = cpiEvent;
      this.lastQueriedCurrency = cpiEvent.currency || 'USD';

      return this.formatEventExplanation(cpiEvent, query);
    }

    // 4. Central Bank Policy (FOMC, ECB, BOE, BOJ)
    if (queryType === 'CENTRAL_BANK_POLICY') {
      let targetKeyword = 'fomc';
      if (lower.includes('ecb') || lower.includes('euro')) targetKeyword = 'ecb';
      else if (lower.includes('boe') || lower.includes('pound')) targetKeyword = 'boe';
      else if (lower.includes('boj') || lower.includes('yen')) targetKeyword = 'boj';

      const cbEvent = await this.findEventByKeyword(targetKeyword) || await this.findEventByKeyword('rate');
      if (!cbEvent) {
        return `এই মুহূর্তে ${targetKeyword.toUpperCase()} সংক্রান্ত কোনো হাই-ইমপ্যাক্ট সুদের হার বা স্টেটমেন্ট ইভেন্ট পাওয়া যায়নি।`;
      }
      this.lastQueriedEvent = cbEvent;
      this.lastQueriedCurrency = cbEvent.currency;

      return this.formatEventExplanation(cbEvent, query);
    }

    // 5. Today's High-Impact Summary
    if (queryType === 'TODAY_HIGH_IMPACT') {
      const highImpacts = await this.getHighImpactEvents();
      if (highImpacts.length === 0) {
        return 'আজকের ক্যালেন্ডারে কোনো হাই-ইমপ্যাক্ট (HIGH IMPACT) নিউজ রিলিজ নেই। মার্কেট মূলত স্বাভাবিক টেকনিক্যাল প্রবাহে চলছে।';
      }

      const formattedList = highImpacts.slice(0, 4).map(e => {
        const timeStr = this.formatShortTime(e.time);
        const statusStr = e.actual ? `[Actual: ${e.actual}]` : `[Forecast: ${e.forecast || 'N/A'}]`;
        return `${e.currency} ${e.event} (${timeStr}) ${statusStr}`;
      }).join('; ');

      return `আজকের গুরুত্বপূর্ণ হাই-ইমপ্যাক্ট নিউজসমূহ: ${formattedList}। কোনো নিউজ রিলিজের আগে বা রিলিজ মুহূর্তে সতর্ক থাকুন।`;
    }

    // 6. Currency Impact (e.g. "USD-তে কী effect?", "কোন currency-কে affect করবে?")
    if (queryType === 'CURRENCY_IMPACT') {
      const curr = this.extractCurrencyFromText(query) || this.lastQueriedCurrency || 'USD';
      const events = await this.getHighImpactEvents(curr);
      if (events.length === 0) {
        return `এই মুহূর্তে ${curr} কারেন্সির জন্য কোনো সক্রিয় হাই-ইমপ্যাক্ট নিউজ নেই।`;
      }
      const primary = events[0];
      this.lastQueriedEvent = primary;
      this.lastQueriedCurrency = curr;

      return this.formatCurrencyImpactExplanation(curr, primary);
    }

    // 7. Pair Specific Fundamental Query
    if (queryType === 'PAIR_FUNDAMENTAL') {
      const pair = this.extractPairFromText(query) || 'EUR/USD';
      return this.formatPairFundamentalExplanation(pair);
    }

    // 8. General Follow-up (e.g. "কেন?", "forecast কত ছিল?", "result কেমন?")
    if (lower === 'কেন?' || lower === 'কেন' || lower === 'why?' || lower.includes('কারণ কি')) {
      if (this.lastQueriedEvent) {
        return this.formatEventExplanation(this.lastQueriedEvent, 'detailed');
      }
      return 'নির্দিষ্ট কোনো নিউজের রেজাল্ট সম্পর্কে জানতে চাইলে ইভেন্টের নাম (যেমন NFP বা CPI) উল্লেখ করুন।';
    }

    // 9. Fallback general news query
    const defaultPair = this.lastQueriedPair || 'EUR/USD';
    return this.formatPairFundamentalExplanation(defaultPair);
  }

  /**
   * Format explanation for a single economic event
   */
  private formatEventExplanation(event: ForexNewsItem, userQuery: string): string {
    const isUpcoming = !event.actual || event.actual === 'N/A' || event.actual === '' || event.status === 'UPCOMING';
    const timeFormatted = this.formatShortTime(event.time);

    // If simple query asking if event exists ("আজ NFP আছে?", "NFP কবে?")
    const lower = userQuery.toLowerCase();
    if (lower.includes('কবে') || lower.includes('আছে?') || lower.includes('is today')) {
      if (isUpcoming) {
        return `হ্যাঁ, ${event.currency}-এর ${event.event} শিডিউল করা আছে (${timeFormatted})। Forecast হচ্ছে ${event.forecast || 'N/A'}, Previous ছিল ${event.previous || 'N/A'}। রিলিজের আগ পর্যন্ত নিশ্চিত মার্কেট ডিরেকশন বলা নিরাপদ নয়।`;
      }
      return `হ্যাঁ, ${event.currency}-এর ${event.event} ইতিমধ্যে রিলিজ হয়েছে। Actual এসেছে ${event.actual} (Forecast ছিল ${event.forecast || 'N/A'})।`;
    }

    // If PRE_NEWS state
    if (isUpcoming) {
      return `${event.currency}-এর ${event.event} এখনো রিলিজ হয়নি (সময়: ${timeFormatted})। Forecast: ${event.forecast || 'N/A'}, Previous: ${event.previous || 'N/A'}। Actual ভ্যালু না আসা পর্যন্ত নিশ্চিত post-news direction বলা যাবে না।`;
    }

    // POST_NEWS state with Actual data
    const surprise = this.calculateSurprise(event.event, event.actual, event.forecast, event.previous);
    let surpriseText = '';
    if (surprise === 'POSITIVE') {
      surpriseText = `Actual (${event.actual}) forecast (${event.forecast || event.previous})-এর চেয়ে ভালো এসেছে, যা ${event.currency}-এর জন্য ফান্ডামেন্টালি স্ট্রং (Bullish)।`;
    } else if (surprise === 'NEGATIVE') {
      surpriseText = `Actual (${event.actual}) forecast (${event.forecast || event.previous})-এর চেয়ে দুর্বল এসেছে, যা ${event.currency}-এর জন্য ফান্ডামেন্টালি নেগেটিভ (Bearish)।`;
    } else {
      surpriseText = `Actual (${event.actual}) প্রত্যাশা অনুযায়ী এসেছে, ফলে তাৎক্ষণিক ফান্ডামেন্টাল প্রভাব সীমিত বা Neutral।`;
    }

    return `${event.event} রিলিজ হয়েছে। Actual: ${event.actual}, Forecast: ${event.forecast || 'N/A'}, Previous: ${event.previous || 'N/A'}। ${surpriseText} তবে ১০০% নিশ্চিত মুভমেন্ট বলা সম্ভব নয়, টেকনিক্যাল স্ট্রাকচার মেনে চলা জরুরি।`;
  }

  /**
   * Format currency impact explanation
   */
  private formatCurrencyImpactExplanation(currency: string, primaryEvent: ForexNewsItem): string {
    const isUpcoming = !primaryEvent.actual || primaryEvent.actual === 'N/A';
    if (isUpcoming) {
      return `এই ${primaryEvent.event} রিলিজ মূলত ${currency} কারেন্সিকে সরাসরি প্রভাবিত করবে। Forecast ${primaryEvent.forecast || 'N/A'}। রিলিজের পূর্বে ভোলাটিলিটি বাড়তে পারে।`;
    }

    const surprise = this.calculateSurprise(primaryEvent.event, primaryEvent.actual, primaryEvent.forecast, primaryEvent.previous);
    const biasWord = surprise === 'POSITIVE' ? 'শক্তিশালী (Bullish)' : surprise === 'NEGATIVE' ? 'দুর্বল (Bearish)' : 'নিরপেক্ষ (Neutral)';
    return `সাম্প্রতিক ${primaryEvent.event} রিলিজের কারণে ${currency} কারেন্সির ফান্ডামেন্টাল বায়াস বর্তমানে ${biasWord}। Actual ছিল ${primaryEvent.actual} এবং Forecast ছিল ${primaryEvent.forecast || 'N/A'}।`;
  }

  /**
   * Format pair fundamental explanation (EUR/USD, GBP/USD, etc.)
   */
  public async formatPairFundamentalExplanation(pair: string): Promise<string> {
    const analysis = await this.analyzePairFundamentals(pair);
    if (!analysis) {
      return `এই মুহূর্তে ${pair}-এর জন্য নির্ভরযোগ্য current data পাওয়া যাচ্ছে না।`;
    }

    if (analysis.marketStatus && !analysis.marketStatus.isOpen) {
      return `রিয়েল ফরেক্স মার্কেট বর্তমানে বন্ধ রয়েছে (${analysis.marketStatus.session})। তাই লাইভ নিউজ ডিরেকশনাল সিগন্যাল সক্রিয় নয়।`;
    }

    if (analysis.eventStatus === 'UPCOMING' || !analysis.primaryEvent?.actual) {
      const ev = analysis.primaryEvent;
      return `${pair}-এর জন্য সামনে হাই-ইমপ্যাক্ট নিউজ (${ev?.event || 'Economic Event'}) শিডিউল করা আছে। প্রি-নিউজ অবস্থায় Actual রিলিজের আগ পর্যন্ত NO_TRADE নিয়ম সক্রিয় রাখা হয়েছে।`;
    }

    const signalText = analysis.newsSignal === 'CALL' ? 'CALL (Buy Bias)' : 
                       analysis.newsSignal === 'PUT' ? 'PUT (Sell Bias)' : 'NO_TRADE (Conflicted/Neutral)';
    
    let toneText = '';
    if (analysis.aiPolicyTone && analysis.aiPolicyTone !== 'UNKNOWN') {
      toneText = `সেন্ট্রাল ব্যাংক পলিসি টোন: ${analysis.aiPolicyTone}। `;
    }

    return `ফান্ডামেন্টাল ইঞ্জিন অনুযায়ী ${pair}-এর সিদ্ধান্ত: ${signalText}। বেস কারেন্সি (${analysis.baseCurrency}) বায়াস ${analysis.baseCurrencyBias}, কোট কারেন্সি (${analysis.quoteCurrency}) বায়াস ${analysis.quoteCurrencyBias}। ${toneText}${analysis.reason} তবে এটি ১০০% নিশ্চিত নয়, সঠিক মানি ম্যানেজমেন্ট ব্যবহার করুন।`;
  }

  /**
   * Synthesize Technical Chart Analysis + Authoritative Fundamental News Analysis
   */
  public async synthesizeChartAndNews(pair = 'EUR/USD'): Promise<string> {
    const fundamentalResult = await this.analyzePairFundamentals(pair);
    const technicalResult = sufiaTradingBridge.getLatestAnalysis();

    // Case 1: No Technical Chart Analysis Available
    if (!technicalResult) {
      if (fundamentalResult) {
        return `চার্ট এখনো analyze করা হয়নি। তবে ফান্ডামেন্টালি ${pair}-এর অবস্থা: ${fundamentalResult.newsSignal === 'NO_TRADE' ? 'NO_TRADE' : fundamentalResult.newsSignal} (${fundamentalResult.fundamentalBias} bias)। চার্টটা স্ক্রিনে দেখালে আমি টেকনিক্যাল ও ফান্ডামেন্টাল দুইটা মিলিয়ে পূর্ণাঙ্গ ব্যাখ্যা দিতে পারব।`;
      }
      return 'এই মুহূর্তে চার্ট বা নিউজ বিশ্লেষণ সম্পন্ন করা সম্ভব হয়নি। অনুগ্রহ করে চার্টটি প্রদর্শন করুন।';
    }

    // Case 2: No Fundamental Data
    if (!fundamentalResult) {
      return `টেকনিক্যাল অ্যানালাইজার বলছে ${technicalResult.signal} (${technicalResult.marketStructure || 'Structure'})। তবে এই মুহূর্তে লাইভ ফান্ডামেন্টাল ডেটা পাওয়া যায়নি, তাই কেবল টেকনিক্যাল কনফার্মেশনের ওপর নির্ভর করা হচ্ছে।`;
    }

    // Case 3: Both Technical & Fundamental are Available -> Execute Structured Synthesis
    const techSignal = technicalResult.signal; // CALL | PUT | NO_TRADE
    const fundSignal = fundamentalResult.newsSignal; // CALL | PUT | NO_TRADE
    const fundBias = fundamentalResult.fundamentalBias; // BULLISH | BEARISH | NEUTRAL | CONFLICTED

    // Evaluate Alignment / Conflict
    let alignment: 'ALIGNED_BULLISH' | 'ALIGNED_BEARISH' | 'CONFLICTED' | 'NEUTRAL_OR_CAUTION' = 'NEUTRAL_OR_CAUTION';
    let finalDecision: 'CALL' | 'PUT' | 'NO_TRADE' = 'NO_TRADE';
    let explanation = '';

    if (techSignal === 'CALL' && (fundSignal === 'CALL' || fundBias === 'BULLISH')) {
      alignment = 'ALIGNED_BULLISH';
      finalDecision = 'CALL';
      explanation = `টেকনিক্যাল চার্ট সেটআপ (CALL) এবং ফান্ডামেন্টাল ম্যাক্রো বায়াস (BULLISH) উভয়ই ঊর্ধ্বমুখী। কনফ্লুয়েন্স ভালো।`;
    } else if (techSignal === 'PUT' && (fundSignal === 'PUT' || fundBias === 'BEARISH')) {
      alignment = 'ALIGNED_BEARISH';
      finalDecision = 'PUT';
      explanation = `টেকনিক্যাল চার্ট সেটআপ (PUT) এবং ফান্ডামেন্টাল ম্যাক্রো বায়াস (BEARISH) উভয়ই নিম্নমুখী। ডিরেকশন সামঞ্জস্যপূর্ণ।`;
    } else if ((techSignal === 'CALL' && fundBias === 'BEARISH') || (techSignal === 'PUT' && fundBias === 'BULLISH')) {
      alignment = 'CONFLICTED';
      finalDecision = 'NO_TRADE';
      explanation = `টেকনিক্যাল সেটআপ (${techSignal}) এবং ফান্ডামেন্টাল ম্যাক্রো বায়াস (${fundBias}) পরস্পরের বিপরীতমুখী। এই ধরনের মতবিরোধে হাই-রিস্ক তৈরি হয়, তাই নিশ্চিত সিদ্ধান্ত NO_TRADE।`;
    } else if (techSignal === 'NO_TRADE' || fundSignal === 'NO_TRADE') {
      alignment = 'NEUTRAL_OR_CAUTION';
      finalDecision = 'NO_TRADE';
      const reason = techSignal === 'NO_TRADE' ? 'চার্টে টেকনিক্যাল কনফার্মেশন অপূর্ণ' : 'ফান্ডামেন্টালে কোনো স্পষ্ট অনুঘটক বা দিক নেই';
      explanation = `${reason}। উভয় সিস্টেমের কনফ্লুয়েন্স ছাড়া ট্রেড নেওয়া অনিরাপদ, তাই চূড়ান্ত সিদ্ধান্ত NO_TRADE।`;
    }

    return `টেকনিক্যাল ও ফান্ডামেন্টাল যৌথ সিন্থেসিস:\n` +
           `• টেকনিক্যাল: ${techSignal} (${technicalResult.marketStructure || 'Price Action'})\n` +
           `• ফান্ডামেন্টাল: ${fundSignal} (${fundBias} Bias, Catalyst: ${fundamentalResult.primaryEvent?.event || 'Macro'})\n` +
           `• অবস্থা: ${alignment}\n` +
           `• চূড়ান্ত রেজাল্ট: ${finalDecision}। ${explanation}`;
  }

  private calculateSurprise(event: string, actualStr: string | null, forecastStr: string | null, previousStr: string | null): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'N/A' {
    if (!actualStr || actualStr === 'N/A' || actualStr === '') return 'N/A';
    const actual = this.parseNum(actualStr);
    const forecast = this.parseNum(forecastStr) ?? this.parseNum(previousStr);
    if (actual === null || forecast === null) return 'N/A';

    const diff = actual - forecast;
    const isUnemployment = event.toLowerCase().includes('unemployment') || event.toLowerCase().includes('jobless');
    if (Math.abs(diff) < 0.0001) return 'NEUTRAL';

    if (isUnemployment) {
      return diff > 0 ? 'NEGATIVE' : 'POSITIVE';
    }
    return diff > 0 ? 'POSITIVE' : 'NEGATIVE';
  }

  private parseNum(val: string | null | undefined): number | null {
    if (!val || val === 'N/A' || val === '-' || val === '') return null;
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  private formatShortTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Scheduled';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Scheduled';
    }
  }

  private extractPairFromText(text: string): string | null {
    const matches = text.match(/(EUR\/USD|GBP\/USD|USD\/JPY|USD\/CHF|AUD\/USD|NZD\/USD|USD\/CAD|EUR\/GBP|EUR\/JPY|GBP\/JPY)/i);
    if (matches && matches[0]) return matches[0].toUpperCase();

    const clean = text.toLowerCase();
    if (clean.includes('eurusd') || clean.includes('eur/usd')) return 'EUR/USD';
    if (clean.includes('gbpusd') || clean.includes('gbp/usd')) return 'GBP/USD';
    if (clean.includes('usdjpy') || clean.includes('usd/jpy')) return 'USD/JPY';
    if (clean.includes('audusd') || clean.includes('aud/usd')) return 'AUD/USD';
    if (clean.includes('usdcad') || clean.includes('usd/cad')) return 'USD/CAD';
    if (clean.includes('usdchf') || clean.includes('usd/chf')) return 'USD/CHF';
    if (clean.includes('nzdusd') || clean.includes('nzd/usd')) return 'NZD/USD';
    return null;
  }

  private extractCurrencyFromText(text: string): string | null {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
    const upper = text.toUpperCase();
    for (const c of currencies) {
      if (upper.includes(c)) return c;
    }
    return null;
  }
}

export const newsManager = NewsManager.getInstance();
