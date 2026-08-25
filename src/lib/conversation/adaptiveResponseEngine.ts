/**
 * PHASE 12 — ADAPTIVE RESPONSE ENGINE FOR SUFIA AI
 * 
 * Formats, cleans, and adapts assistant conversational responses:
 * - Replaces robotic phrasing and eliminates repetitive filler phrases ("অবশ্যই", "আর কিছু জানতে চাও?")
 * - Implements Adaptive Response Length Modes (AUTO, CONCISE, NORMAL, DETAILED)
 * - Adapts to user tone (Confusion, Frustration, Urgency, Casual)
 * - Preserves ALL authoritative outputs (CALL, PUT, NO_TRADE, Forex News Data, Vision State)
 * - Formats concise action completions and natural processing cues without progress spam
 */

import { conversationStyleManager, ResponseLengthMode, UserTone } from './conversationStyleManager';
import { OrchestratedDomain, ContextFreshnessMeta } from './contextOrchestrator';

export interface FormattedResponseOptions {
  userQuery: string;
  rawResponse: string;
  domain: OrchestratedDomain;
  authoritativeSignal?: 'CALL' | 'PUT' | 'NO_TRADE';
  freshness?: ContextFreshnessMeta;
  isProcessingCue?: boolean;
  isCompletionMessage?: boolean;
}

export interface FormattedResponseResult {
  spokenText: string;
  lengthModeUsed: ResponseLengthMode;
  appliedTone: UserTone;
  hasFollowUpQuestion: boolean;
  authoritativeSignalPreserved?: 'CALL' | 'PUT' | 'NO_TRADE';
}

export class AdaptiveResponseEngine {
  private static instance: AdaptiveResponseEngine;

  private constructor() {}

  public static getInstance(): AdaptiveResponseEngine {
    if (!AdaptiveResponseEngine.instance) {
      AdaptiveResponseEngine.instance = new AdaptiveResponseEngine();
    }
    return AdaptiveResponseEngine.instance;
  }

  /**
   * Main formatting entry point that applies Phase 12 conversational rules
   */
  public formatResponse(options: FormattedResponseOptions): FormattedResponseResult {
    const { userQuery, rawResponse, domain, authoritativeSignal, isProcessingCue, isCompletionMessage } = options;

    // 1. Update style session parameters and detect user tone/correction
    const styleAnalysis = conversationStyleManager.updateStyleFromUserUtterance(userQuery);
    const sessionState = conversationStyleManager.getSessionState();

    // 2. Handle Processing Cues ("একটু দেখছি...")
    if (isProcessingCue) {
      return {
        spokenText: this.getNaturalProcessingCue(sessionState.languageMode),
        lengthModeUsed: sessionState.lengthMode,
        appliedTone: styleAnalysis.tone,
        hasFollowUpQuestion: false,
        authoritativeSignalPreserved: authoritativeSignal,
      };
    }

    // 3. Handle Completion Messages ("হয়ে গেছে। এখন test করে দেখতে পারো।")
    if (isCompletionMessage) {
      return {
        spokenText: this.getNaturalCompletionMessage(rawResponse, sessionState.languageMode),
        lengthModeUsed: sessionState.lengthMode,
        appliedTone: styleAnalysis.tone,
        hasFollowUpQuestion: false,
        authoritativeSignalPreserved: authoritativeSignal,
      };
    }

    // 4. Handle Casual Short Inputs ("হুম", "ঠিক আছে", "আচ্ছা", "ok")
    if (styleAnalysis.tone === 'CASUAL') {
      const casualReply = this.formatCasualResponse(userQuery, sessionState.languageMode);
      return {
        spokenText: casualReply,
        lengthModeUsed: 'CONCISE',
        appliedTone: 'CASUAL',
        hasFollowUpQuestion: false,
        authoritativeSignalPreserved: authoritativeSignal,
      };
    }

    // 5. Clean robotic filler phrases from raw response
    let cleaned = this.stripRoboticFiller(rawResponse);

    // 6. Handle Confusion / Frustration tone adjustment
    if (styleAnalysis.tone === 'CONFUSED' || sessionState.explanationStyle === 'SIMPLIFIED') {
      cleaned = this.simplifyExplanation(cleaned, sessionState.languageMode);
    } else if (styleAnalysis.tone === 'FRUSTRATED') {
      const ack = conversationStyleManager.getNextAcknowledgement(sessionState.languageMode);
      cleaned = `${ack} সমস্যা নেই—অন্য বিষয়টিতে সাহায্য করছি।\n${cleaned}`;
    }

    // 7. Handle Self-Correction if present
    if (styleAnalysis.isCorrection && styleAnalysis.correctedIntent) {
      cleaned = `বুঝেছি, ${styleAnalysis.correctedIntent} নিয়ে কথা বলছেন।\n${cleaned}`;
    }

    // 8. Apply Response Length Mode (CONCISE, DETAILED, AUTO)
    let finalText = cleaned;
    if (sessionState.lengthMode === 'CONCISE') {
      finalText = this.makeConcise(cleaned);
    } else if (sessionState.lengthMode === 'AUTO') {
      // For short standard questions, keep response naturally bounded
      if (userQuery.length < 25 && !rawResponse.includes('•') && !rawResponse.includes('1.')) {
        finalText = this.makeConcise(cleaned);
      }
    }

    // 9. Guarantee Signal Preservation (Never alter CALL/PUT/NO_TRADE)
    if (authoritativeSignal && !finalText.includes(authoritativeSignal)) {
      finalText = `Analyzer সিদ্ধান্ত: ${authoritativeSignal}। ${finalText}`;
    }

    return {
      spokenText: finalText.trim(),
      lengthModeUsed: sessionState.lengthMode,
      appliedTone: styleAnalysis.tone,
      hasFollowUpQuestion: finalText.includes('?'),
      authoritativeSignalPreserved: authoritativeSignal,
    };
  }

  /**
   * Strips repetitive robotic filler phrases from response text
   */
  public stripRoboticFiller(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // Leading filler patterns
    const leadingPatterns = [
      /^(অবশ্যই!|অবশ্যই|ঠিক আছে|আমি বুঝেছি|আমি আপনার প্রশ্নের উত্তর দিতে প্রস্তুত।|I can help you with that|Sure!|Of course!)\s*/gi,
      /^(আমি একটি AI সহকারী|As an AI assistant)\s*,?\s*/gi,
    ];

    leadingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    // Trailing robotic follow-up prompts
    const trailingPatterns = [
      /\n*(আর কিছু জানতে চাও\?|আমি আর কীভাবে সাহায্য করতে পারি\?|Is there anything else I can help you with\?|আর কোনো প্রশ্ন আছে\?|আর কিছু লাগবে\?)\s*$/gi,
      /\n*(আপনার আর কোনো সাহায্য লাগবে কি\?|How else can I assist you\?)\s*$/gi,
    ];

    trailingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim();
  }

  /**
   * Formats a short natural reply for casual inputs ("হুম", "ঠিক আছে") without spamming questions
   */
  private formatCasualResponse(query: string, lang: 'bengali' | 'english' | 'banglish'): string {
    const lower = query.toLowerCase().trim();

    if (lower === 'হুম' || lower === 'hmm') {
      return lang === 'bengali' ? 'হুম, বলো।' : (lang === 'english' ? 'Mm-hmm, go ahead.' : 'Hmm, bolo.');
    }

    if (lower === 'ঠিক আছে' || lower === 'ok' || lower === 'okay') {
      return lang === 'bengali' ? 'ঠিক আছে।' : (lang === 'english' ? 'All right.' : 'Thik ache.');
    }

    if (lower === 'মানে?' || lower === 'মানে') {
      return lang === 'bengali' ? 'মানে, সহজ করে বললে—' : (lang === 'english' ? 'In simple terms—' : 'Mane, shohoj kore bolle—');
    }

    return conversationStyleManager.getNextAcknowledgement(lang);
  }

  /**
   * Natural processing status cue
   */
  private getNaturalProcessingCue(lang: 'bengali' | 'english' | 'banglish'): string {
    if (lang === 'bengali') return 'একটু দেখছি...';
    if (lang === 'english') return 'Let me check that...';
    return 'Ektu dekhchi...';
  }

  /**
   * Natural completion message
   */
  private getNaturalCompletionMessage(customSummary: string, lang: 'bengali' | 'english' | 'banglish'): string {
    if (customSummary) return customSummary;
    if (lang === 'bengali') return 'হয়ে গেছে। এখন দেখতে পারো।';
    if (lang === 'english') return 'Done. You can check now.';
    return 'Hoye geche. Ekhon dekhte paro.';
  }

  /**
   * Truncate/summarize text to 1-2 core sentences for CONCISE mode
   */
  private makeConcise(text: string): string {
    const sentences = text.split(/(?<=[.!?।])\s+/);
    if (sentences.length <= 2) return text;

    // Retain first 2 meaningful sentences
    return sentences.slice(0, 2).join(' ');
  }

  /**
   * Simplify complex wording for confused user tone
   */
  private simplifyExplanation(text: string, lang: 'bengali' | 'english' | 'banglish'): string {
    const prefix = lang === 'bengali' 
      ? 'সহজ করে বললে: ' 
      : (lang === 'english' ? 'Simply put: ' : 'Shohoj kore bolle: ');

    // If text contains technical bullet points, extract summary
    let simplified = text;
    if (text.includes('•')) {
      const lines = text.split('\n').filter(l => l.trim().startsWith('•') || l.trim().includes(':'));
      if (lines.length > 0) {
        simplified = lines.slice(0, 2).join(' ');
      }
    }

    return `${prefix}${simplified}`;
  }
}

export const adaptiveResponseEngine = AdaptiveResponseEngine.getInstance();
