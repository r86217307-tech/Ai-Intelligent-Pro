/**
 * PHASE 10 — ERROR CLASSIFICATION & RECOVERY MANAGER
 * Categorized error handling and safe, user-friendly message generation.
 * Strictly prevents leaking stack traces, API keys, internal paths, or raw server errors.
 */

export type ErrorCategory =
  | 'NETWORK_ERROR'
  | 'WEBSOCKET_ERROR'
  | 'AUDIO_ERROR'
  | 'MICROPHONE_ERROR'
  | 'VISION_ERROR'
  | 'GEMINI_SESSION_ERROR'
  | 'TIMEOUT'
  | 'PERMISSION_ERROR'
  | 'UNKNOWN_ERROR';

export interface ClassifiedError {
  category: ErrorCategory;
  isRecoverable: boolean;
  userMessageBn: string;
  userMessageEn: string;
  technicalCode: string;
  timestamp: number;
}

export class ErrorRecoveryManager {
  /**
   * Classify any raw error or exception into a safe, bounded structure
   */
  public static classify(err: any, fallbackCategory: ErrorCategory = 'UNKNOWN_ERROR'): ClassifiedError {
    const rawMsg = String(err?.message || err?.error || err || '').toLowerCase();
    const name = String(err?.name || '').toLowerCase();

    const timestamp = Date.now();

    // 1. Permission Errors
    if (
      name.includes('notallowed') ||
      name.includes('permission') ||
      rawMsg.includes('permission denied') ||
      rawMsg.includes('not allowed') ||
      rawMsg.includes('user denied')
    ) {
      return {
        category: 'PERMISSION_ERROR',
        isRecoverable: true,
        userMessageBn: 'Microphone বা screen permission পাওয়া যায়নি। দয়া করে browser settings-এ permission allow করুন।',
        userMessageEn: 'Permission was denied. Please allow microphone or screen access in your browser settings.',
        technicalCode: 'ERR_PERMISSION_DENIED',
        timestamp,
      };
    }

    // 2. Microphone Errors
    if (
      rawMsg.includes('microphone') ||
      rawMsg.includes('audio input') ||
      rawMsg.includes('device not found') ||
      rawMsg.includes('devices not found') ||
      rawMsg.includes('requested device') ||
      name.includes('notfounderror') ||
      name.includes('overconstrainederror')
    ) {
      return {
        category: 'MICROPHONE_ERROR',
        isRecoverable: true,
        userMessageBn: 'Microphone device পাওয়া যায়নি বা অন্য অ্যাপ ব্যবহার করছে।',
        userMessageEn: 'Microphone device not found or already in use by another application.',
        technicalCode: 'ERR_MIC_UNAVAILABLE',
        timestamp,
      };
    }

    // 3. Audio / AudioContext Errors
    if (
      rawMsg.includes('audiocontext') ||
      rawMsg.includes('audioworklet') ||
      rawMsg.includes('decodeaudio') ||
      rawMsg.includes('audio queue')
    ) {
      return {
        category: 'AUDIO_ERROR',
        isRecoverable: true,
        userMessageBn: 'Audio playback-এ সাময়িক বিঘ্ন ঘটেছে। আবার চেষ্টা করা হচ্ছে।',
        userMessageEn: 'Audio playback interrupted. Recovering audio pipeline.',
        technicalCode: 'ERR_AUDIO_PIPELINE',
        timestamp,
      };
    }

    // 4. Vision & Screen Share Errors
    if (
      rawMsg.includes('screen') ||
      rawMsg.includes('displaymedia') ||
      rawMsg.includes('frame') ||
      name.includes('notsupportederror')
    ) {
      return {
        category: 'VISION_ERROR',
        isRecoverable: true,
        userMessageBn: 'Screen sharing বা vision stream বন্ধ হয়ে গেছে। আবার Screen Share চালু করতে পারেন।',
        userMessageEn: 'Screen sharing stream ended. You can restart screen share anytime.',
        technicalCode: 'ERR_VISION_STREAM',
        timestamp,
      };
    }

    // 5. Timeout Errors
    if (
      rawMsg.includes('timeout') ||
      rawMsg.includes('timed out') ||
      rawMsg.includes('deadline exceeded')
    ) {
      return {
        category: 'TIMEOUT',
        isRecoverable: true,
        userMessageBn: 'সার্ভার রেসপন্স দিতে সময় নিচ্ছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
        userMessageEn: 'Response timed out. Please try again.',
        technicalCode: 'ERR_OP_TIMEOUT',
        timestamp,
      };
    }

    // 6. WebSocket Errors
    if (
      rawMsg.includes('websocket') ||
      rawMsg.includes('ws closed') ||
      rawMsg.includes('connection closed') ||
      rawMsg.includes('socket hang up')
    ) {
      return {
        category: 'WEBSOCKET_ERROR',
        isRecoverable: true,
        userMessageBn: 'Voice connection সাময়িকভাবে বিচ্ছিন্ন হয়েছে। Reconnect করা হচ্ছে...',
        userMessageEn: 'Voice connection temporarily lost. Reconnecting...',
        technicalCode: 'ERR_WS_DISCONNECT',
        timestamp,
      };
    }

    // 7. General Network Errors
    if (
      rawMsg.includes('network') ||
      rawMsg.includes('failed to fetch') ||
      rawMsg.includes('offline') ||
      rawMsg.includes('econnreset')
    ) {
      return {
        category: 'NETWORK_ERROR',
        isRecoverable: true,
        userMessageBn: 'ইন্টারনেট বা নেটওয়ার্ক সংযোগে সমস্যা দেখা দিয়েছে।',
        userMessageEn: 'Network connection issue detected. Checking connectivity.',
        technicalCode: 'ERR_NETWORK_UNSTABLE',
        timestamp,
      };
    }

    // 8. Gemini Live Session Errors
    if (
      rawMsg.includes('live api') ||
      rawMsg.includes('gemini') ||
      rawMsg.includes('quota') ||
      rawMsg.includes('session not ready')
    ) {
      return {
        category: 'GEMINI_SESSION_ERROR',
        isRecoverable: true,
        userMessageBn: 'AI Voice session-এ সমস্যা হয়েছে। নতুন session তৈরি করা হচ্ছে...',
        userMessageEn: 'AI voice session encountered an issue. Initializing fresh session...',
        technicalCode: 'ERR_GEMINI_SESSION',
        timestamp,
      };
    }

    // Default fallback
    return {
      category: fallbackCategory,
      isRecoverable: false,
      userMessageBn: 'একটি অপ্রত্যাশিত সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
      userMessageEn: 'An unexpected issue occurred. Please try again.',
      technicalCode: 'ERR_UNKNOWN',
      timestamp,
    };
  }
}
