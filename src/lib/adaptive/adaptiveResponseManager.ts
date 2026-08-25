import { OrchestratedDomain, ContextFreshnessMeta } from '../conversation/contextOrchestrator';
import { memoryManager } from '../memory/memoryManager';
import { actionPlanner } from '../tools/actionPlanner';
import { conversationStyleManager, ResponseLengthMode, UserTone, LanguageMode } from '../conversation/conversationStyleManager';

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

export class AdaptiveResponseManager {
  private static instance: AdaptiveResponseManager;

  private constructor() {}

  public static getInstance(): AdaptiveResponseManager {
    if (!AdaptiveResponseManager.instance) {
      AdaptiveResponseManager.instance = new AdaptiveResponseManager();
    }
    return AdaptiveResponseManager.instance;
  }

  public formatResponse(options: FormattedResponseOptions): FormattedResponseResult {
    const { userQuery, rawResponse, domain, authoritativeSignal, isProcessingCue, isCompletionMessage } = options;

    // 1. Analyze and extract style parameters
    const styleAnalysis = conversationStyleManager.updateStyleFromUserUtterance(userQuery);
    const sessionState = conversationStyleManager.getSessionState();

    // Context from memory/tools
    const memories = memoryManager.getAllValidMemories();
    const actionState = actionPlanner.getState();

    // 2. Handle Action Planning / Execution state
    if (actionState === 'EXECUTING' || isProcessingCue) {
      return {
        spokenText: this.getNaturalProcessingCue(sessionState.languageMode, styleAnalysis.tone),
        lengthModeUsed: sessionState.lengthMode,
        appliedTone: styleAnalysis.tone,
        hasFollowUpQuestion: false,
        authoritativeSignalPreserved: authoritativeSignal,
      };
    }

    if (isCompletionMessage) {
      return {
        spokenText: this.getNaturalCompletionMessage(rawResponse, sessionState.languageMode),
        lengthModeUsed: sessionState.lengthMode,
        appliedTone: styleAnalysis.tone,
        hasFollowUpQuestion: false,
        authoritativeSignalPreserved: authoritativeSignal,
      };
    }

    // 3. Handle Casual / Short Inputs
    if (styleAnalysis.tone === 'CASUAL') {
      const casualReply = this.formatCasualResponse(userQuery, sessionState.languageMode);
      if (casualReply) {
        return {
          spokenText: casualReply,
          lengthModeUsed: 'CONCISE',
          appliedTone: 'CASUAL',
          hasFollowUpQuestion: false,
          authoritativeSignalPreserved: authoritativeSignal,
        };
      }
    }

    // 4. Strip robotic fillers
    let cleaned = this.stripRoboticFiller(rawResponse);

    // 5. Handle Emotional Tone (Confusion, Frustration, Sadness, Joy)
    if (styleAnalysis.tone === 'CONFUSED' || sessionState.explanationStyle === 'SIMPLIFIED') {
      cleaned = this.simplifyExplanation(cleaned, sessionState.languageMode);
    } else if (styleAnalysis.tone === 'FRUSTRATED') {
      const ack = conversationStyleManager.getNextAcknowledgement(sessionState.languageMode);
      cleaned = `${ack} সমস্যা নেই—অন্য বিষয়টিতে সাহায্য করছি।\n${cleaned}`;
    }

    // 6. Handle Self-Correction
    if (styleAnalysis.isCorrection && styleAnalysis.correctedIntent) {
      cleaned = `বুঝেছি, ${styleAnalysis.correctedIntent} নিয়ে কথা বলছেন।\n${cleaned}`;
    }

    // 7. Language and Memory Preference Override
    let finalText = cleaned;
    let actualLengthMode = sessionState.lengthMode;

    if (actualLengthMode === 'AUTO') {
      // Memory preference can influence AUTO mode
      if (memories.some(m => m.category === 'PREFERENCE' && m.key === 'explanationDepth' && m.content === 'CONCISE')) {
        actualLengthMode = 'CONCISE';
      }
      if (userQuery.length < 25 && !rawResponse.includes('•') && !rawResponse.includes('1.')) {
        actualLengthMode = 'CONCISE';
      }
    }

    if (actualLengthMode === 'CONCISE') {
      finalText = this.makeConcise(cleaned);
    }

    // 8. Tool execution completion
    if (actionState === 'COMPLETED') {
        const ack = conversationStyleManager.getNextAcknowledgement(sessionState.languageMode);
        finalText = `${ack} ${finalText}`;
    }

    // 9. Guarantee Signal Preservation
    if (authoritativeSignal && !finalText.includes(authoritativeSignal)) {
      finalText = `Analyzer সিদ্ধান্ত: ${authoritativeSignal}। ${finalText}`;
    }

    return {
      spokenText: finalText.trim(),
      lengthModeUsed: actualLengthMode,
      appliedTone: styleAnalysis.tone,
      hasFollowUpQuestion: finalText.includes('?'),
      authoritativeSignalPreserved: authoritativeSignal,
    };
  }

  public stripRoboticFiller(text: string): string {
    if (!text) return '';
    let cleaned = text;

    const leadingPatterns = [
      /^(অবশ্যই!|অবশ্যই|ঠিক আছে|আমি বুঝেছি|আমি আপনার প্রশ্নের উত্তর দিতে প্রস্তুত।|I can help you with that|Sure!|Of course!)\s*/gi,
      /^(আমি একটি AI সহকারী|As an AI assistant)\s*,?\s*/gi,
    ];
    leadingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    const trailingPatterns = [
      /\n*(আর কিছু জানতে চাও\?|আমি আর কীভাবে সাহায্য করতে পারি\?|Is there anything else I can help you with\?|আর কোনো প্রশ্ন আছে\?|আর কিছু লাগবে\?)\s*$/gi,
      /\n*(আপনার আর কোনো সাহায্য লাগবে কি\?|How else can I assist you\?)\s*$/gi,
    ];
    trailingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim();
  }

  private formatCasualResponse(query: string, lang: LanguageMode): string | null {
    const lower = query.toLowerCase().trim();
    if (lower === 'হুম' || lower === 'hmm' || lower === 'হ্যাঁ' || lower === 'yes') {
      return lang === 'bengali' ? 'হ্যাঁ, বলো।' : (lang === 'english' ? 'Yes, go ahead.' : 'Ha, bolo.');
    }
    if (lower === 'ঠিক আছে' || lower === 'ok' || lower === 'okay' || lower === 'আচ্ছা') {
      return lang === 'bengali' ? 'হুম।' : (lang === 'english' ? 'Got it.' : 'Hmm.');
    }
    if (lower === 'না' || lower === 'no') {
      return lang === 'bengali' ? 'আচ্ছা।' : (lang === 'english' ? 'Okay.' : 'Acha.');
    }
    if (lower === 'মানে?' || lower === 'মানে' || lower === 'why' || lower === 'কেন?') {
      return lang === 'bengali' ? 'সহজ করে বললে—' : (lang === 'english' ? 'In simple terms—' : 'Shohoj kore bolle—');
    }
    return null;
  }

  private getNaturalProcessingCue(lang: LanguageMode, tone: UserTone): string {
    if (tone === 'URGENT') {
      return lang === 'bengali' ? 'তাড়াতাড়ি দেখছি...' : (lang === 'english' ? 'Checking quickly...' : 'Taratari dekhchi...');
    }
    if (lang === 'bengali') return 'একটু দেখছি...';
    if (lang === 'english') return 'Let me check...';
    return 'Ektu dekhchi...';
  }

  private getNaturalCompletionMessage(customSummary: string, lang: LanguageMode): string {
    if (customSummary) return customSummary;
    if (lang === 'bengali') return 'হয়ে গেছে।';
    if (lang === 'english') return 'Done.';
    return 'Hoye geche.';
  }

  private makeConcise(text: string): string {
    const sentences = text.split(/(?<=[.!?।])\s+/);
    if (sentences.length <= 2) return text;
    return sentences.slice(0, 2).join(' ');
  }

  private simplifyExplanation(text: string, lang: LanguageMode): string {
    const prefix = lang === 'bengali' 
      ? 'সহজ করে বললে: ' 
      : (lang === 'english' ? 'Simply put: ' : 'Shohoj kore bolle: ');

    let simplified = text;
    if (text.includes('•')) {
      const lines = text.split('\n').filter(l => l.trim().startsWith('•') || l.trim().includes(':'));
      if (lines.length > 0) {
        simplified = lines.slice(0, 2).join(' ');
      }
    } else {
        const sentences = text.split(/(?<=[.!?।])\s+/);
        if (sentences.length > 3) {
            simplified = sentences.slice(0, 3).join(' ');
        }
    }
    return `${prefix}${simplified}`;
  }
}

export const adaptiveResponseManager = AdaptiveResponseManager.getInstance();
