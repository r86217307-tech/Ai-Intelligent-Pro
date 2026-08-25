/**
 * PHASE 12 — CONVERSATION STYLE MANAGER
 * 
 * Manages adaptive conversational parameters:
 * - Session-scoped response length modes: AUTO (default), CONCISE, NORMAL, DETAILED
 * - Session-scoped explanation styles: DEFAULT, SIMPLIFIED, TECHNICAL
 * - Primary language adaptation: Bengali, English, Banglish
 * - Non-repetitive acknowledgement pool management
 * - Emotional & tone awareness (Frustration, Confusion, Casual, Urgency)
 * - User correction handling ("আগামীকাল... না আজকেই")
 */

export type ResponseLengthMode = 'AUTO' | 'CONCISE' | 'NORMAL' | 'DETAILED';
export type ExplanationStyle = 'DEFAULT' | 'SIMPLIFIED' | 'TECHNICAL';
export type LanguageMode = 'bengali' | 'english' | 'banglish';
export type UserTone = 'CASUAL' | 'CONFUSED' | 'FRUSTRATED' | 'URGENT' | 'NEUTRAL';

export interface StyleSessionState {
  lengthMode: ResponseLengthMode;
  explanationStyle: ExplanationStyle;
  languageMode: LanguageMode;
  lastAcknowledgementIndex: number;
  recentAcknowledgements: string[];
}

export class ConversationStyleManager {
  private static instance: ConversationStyleManager;

  private sessionState: StyleSessionState = {
    lengthMode: 'AUTO',
    explanationStyle: 'DEFAULT',
    languageMode: 'banglish',
    lastAcknowledgementIndex: -1,
    recentAcknowledgements: [],
  };

  private static readonly MAX_RECENT_ACKS = 5;

  private static readonly BEN_ACKS = [
    'হ্যাঁ, বুঝেছি।',
    'আচ্ছা।',
    'হুম, ঠিক আছে।',
    'বুঝতে পারছি।',
    'ঠিক আছে, দেখছি।',
    'আচ্ছা, এবার পরিষ্কার।',
  ];

  private static readonly ENG_ACKS = [
    'Got it.',
    'Sure.',
    'Right.',
    'Understood.',
    'Let me check.',
    'All right.',
  ];

  private static readonly BANG_ACKS = [
    'Acha, bujhechi.',
    'Hmm, thik ache.',
    'Bujhte parchi.',
    'Thik ache, dekhchi.',
    'Acha, thik ache.',
  ];

  private constructor() {}

  public static getInstance(): ConversationStyleManager {
    if (!ConversationStyleManager.instance) {
      ConversationStyleManager.instance = new ConversationStyleManager();
    }
    return ConversationStyleManager.instance;
  }

  /**
   * Get a varied, non-repetitive acknowledgement based on user language
   */
  public getNextAcknowledgement(lang: LanguageMode): string {
    let pool: string[];
    if (lang === 'bengali') pool = ConversationStyleManager.BEN_ACKS;
    else if (lang === 'english') pool = ConversationStyleManager.ENG_ACKS;
    else pool = ConversationStyleManager.BANG_ACKS;

    // Filter out recently used acknowledgements to avoid repetition
    const available = pool.filter(ack => !this.sessionState.recentAcknowledgements.includes(ack));
    const candidates = available.length > 0 ? available : pool;

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[randomIndex];

    // Maintain bounded history
    this.sessionState.recentAcknowledgements.push(chosen);
    if (this.sessionState.recentAcknowledgements.length > ConversationStyleManager.MAX_RECENT_ACKS) {
      this.sessionState.recentAcknowledgements.shift();
    }

    return chosen;
  }

  /**
   * Inspect user text and update session preferences (Length Mode, Style, Language)
   */
  public updateStyleFromUserUtterance(text: string): {
    tone: UserTone;
    isCorrection: boolean;
    correctedIntent?: string;
  } {
    const lower = (text || '').toLowerCase().trim();

    // 1. Detect explicit Length Preferences
    if (
      lower.includes('ছোট করে') || 
      lower.includes('সংক্ষেপে') || 
      lower.includes('shortly') || 
      lower.includes('in short') ||
      lower.includes('brief')
    ) {
      this.sessionState.lengthMode = 'CONCISE';
    } else if (
      lower.includes('বিস্তারিত') || 
      lower.includes('ডিটেইল') || 
      lower.includes('in detail') || 
      lower.includes('elaborate') ||
      lower.includes('explain more')
    ) {
      this.sessionState.lengthMode = 'DETAILED';
    } else if (lower.includes('normal') || lower.includes('স্বাভাবিক')) {
      this.sessionState.lengthMode = 'NORMAL';
    }

    // 2. Detect explicit Explanation Style
    if (
      lower.includes('সহজ করে') || 
      lower.includes('সহজ ভাষায়') || 
      lower.includes('simply') || 
      lower.includes('easy way')
    ) {
      this.sessionState.explanationStyle = 'SIMPLIFIED';
    } else if (
      lower.includes('technical') || 
      lower.includes('টেকনিক্যাল') || 
      lower.includes('ডিটেইলস')
    ) {
      this.sessionState.explanationStyle = 'TECHNICAL';
    }

    // 3. Language Mode Detection
    if (/[\u0980-\u09FF]/.test(text)) {
      this.sessionState.languageMode = 'bengali';
    } else if (/^[a-zA-Z0-9\s.,?!'-]+$/.test(text) && (lower.includes('the') || lower.includes('what') || lower.includes('is') || lower.includes('check'))) {
      this.sessionState.languageMode = 'english';
    } else {
      this.sessionState.languageMode = 'banglish';
    }

    // 4. Tone Detection
    let tone: UserTone = 'NEUTRAL';
    if (
      lower.includes('বুঝি নাই') || 
      lower.includes('বুঝতে পারছি না') || 
      lower.includes('মানে?') || 
      lower.includes('মানে') || 
      lower.includes('কিভাবে?') ||
      lower.includes("don't understand")
    ) {
      tone = 'CONFUSED';
    } else if (
      lower.includes('আরে না') || 
      lower.includes('ভুল') || 
      lower.includes('not this') || 
      lower.includes('wrong') || 
      lower.includes('আরে না না')
    ) {
      tone = 'FRUSTRATED';
    } else if (
      lower.includes('তাড়াতাড়ি') || 
      lower.includes('এখনই') || 
      lower.includes('urgent') || 
      lower.includes('quick')
    ) {
      tone = 'URGENT';
    } else if (
      lower === 'হুম' || 
      lower === 'ঠিক আছে' || 
      lower === 'আচ্ছা' || 
      lower === 'ok' || 
      lower === 'okay' || 
      lower === 'hmm'
    ) {
      tone = 'CASUAL';
    }

    // 5. User Self-Correction Detection ("আগামীকাল... না আজকেই দেখব")
    const correctionMatch = text.match(/(?:না|no|wait)\s*,?\s*(.+)$/i);
    let isCorrection = false;
    let correctedIntent: string | undefined;

    if (correctionMatch && correctionMatch[1]) {
      isCorrection = true;
      correctedIntent = correctionMatch[1].trim();
    }

    return { tone, isCorrection, correctedIntent };
  }

  public getSessionState(): StyleSessionState {
    return { ...this.sessionState };
  }

  public setLengthMode(mode: ResponseLengthMode): void {
    this.sessionState.lengthMode = mode;
  }

  public setExplanationStyle(style: ExplanationStyle): void {
    this.sessionState.explanationStyle = style;
  }

  public reset(): void {
    this.sessionState = {
      lengthMode: 'AUTO',
      explanationStyle: 'DEFAULT',
      languageMode: 'banglish',
      lastAcknowledgementIndex: -1,
      recentAcknowledgements: [],
    };
  }
}

export const conversationStyleManager = ConversationStyleManager.getInstance();
