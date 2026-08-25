import { adaptiveResponseManager } from './adaptiveResponseManager';
import { conversationStyleManager } from '../conversation/conversationStyleManager';

export interface Phase15TestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  category: string;
  errorMessage?: string;
}

export class Phase15TestSuite {
  private static instance: Phase15TestSuite;

  private constructor() {}

  public static getInstance(): Phase15TestSuite {
    if (!Phase15TestSuite.instance) {
      Phase15TestSuite.instance = new Phase15TestSuite();
    }
    return Phase15TestSuite.instance;
  }

  public async runAllTests(): Promise<{ total: number; passed: number; failed: number; results: Phase15TestCaseResult[] }> {
    const results: Phase15TestCaseResult[] = [];

    const tests = [
      this.testShortResponseAdaptation,
      this.testDetailedResponseAdaptation,
      this.testExplicitConciseMode,
      this.testExplicitDetailedMode,
      this.testNaturalAcknowledgement,
      this.testShortFollowUp,
      this.testSelfCorrection,
      this.testConfusionAdaptation,
      this.testCasualResponses,
      this.testRoboticFillerStripping
    ];

    for (const test of tests) {
      try {
        const result = await test.bind(this)();
        results.push(result);
      } catch (e: any) {
        results.push({
          id: 'UNKNOWN',
          name: 'Unknown Test',
          passed: false,
          category: 'ERROR',
          errorMessage: e.message
        });
      }
    }

    const passed = results.filter(r => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };
  }

  private async testShortResponseAdaptation(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'কেমন আছো?',
      rawResponse: 'আমি ভালো আছি। আপনি কেমন আছেন?',
      domain: 'general'
    });
    const passed = result.lengthModeUsed === 'CONCISE' || result.lengthModeUsed === 'AUTO';
    return { id: 'P15-01', name: 'Short response adaptation', passed, category: 'ADAPTIVE' };
  }

  private async testDetailedResponseAdaptation(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const raw = '1. First point. 2. Second point. 3. Third point.';
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'বিস্তারিত বলো',
      rawResponse: raw,
      domain: 'general'
    });
    const passed = result.lengthModeUsed === 'DETAILED';
    return { id: 'P15-02', name: 'Detailed response adaptation', passed, category: 'ADAPTIVE' };
  }

  private async testExplicitConciseMode(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'ছোট করে বলো',
      rawResponse: 'This is a very long response that should be cut down. Because the user asked for it to be short.',
      domain: 'general'
    });
    const passed = result.lengthModeUsed === 'CONCISE';
    return { id: 'P15-03', name: 'Explicit concise mode', passed, category: 'ADAPTIVE' };
  }

  private async testExplicitDetailedMode(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'বিস্তারিত বলো',
      rawResponse: 'This is short.',
      domain: 'general'
    });
    const passed = result.lengthModeUsed === 'DETAILED';
    return { id: 'P15-04', name: 'Explicit detailed mode', passed, category: 'ADAPTIVE' };
  }

  private async testNaturalAcknowledgement(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const ack1 = conversationStyleManager.getNextAcknowledgement('bengali');
    const ack2 = conversationStyleManager.getNextAcknowledgement('bengali');
    const passed = ack1 && ack2 && ack1 !== ack2; // Ensure variation
    return { id: 'P15-05', name: 'Natural acknowledgement variation', passed, category: 'ADAPTIVE' };
  }

  private async testShortFollowUp(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'হুম',
      rawResponse: 'Are you listening?',
      domain: 'general'
    });
    const passed = result.spokenText.includes('বলো') || result.spokenText.includes('go ahead');
    return { id: 'P15-06', name: 'Short follow-up (হুম)', passed, category: 'ADAPTIVE' };
  }

  private async testSelfCorrection(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'কাল করব... না, আজকেই করব',
      rawResponse: 'Ok',
      domain: 'general'
    });
    const passed = result.spokenText.includes('আজকেই করব');
    return { id: 'P15-07', name: 'Self-correction handling', passed, category: 'ADAPTIVE' };
  }

  private async testConfusionAdaptation(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'বুঝি নাই',
      rawResponse: 'This is very technical.',
      domain: 'general'
    });
    const passed = result.spokenText.includes('সহজ করে বললে');
    return { id: 'P15-08', name: 'Confusion adaptation', passed, category: 'ADAPTIVE' };
  }
  
  private async testCasualResponses(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'ঠিক আছে',
      rawResponse: 'Great',
      domain: 'general'
    });
    const passed = result.spokenText === 'হুম।' || result.spokenText === 'Got it.';
    return { id: 'P15-09', name: 'Casual responses', passed, category: 'ADAPTIVE' };
  }

  private async testRoboticFillerStripping(): Promise<Phase15TestCaseResult> {
    conversationStyleManager.reset();
    const result = adaptiveResponseManager.formatResponse({
      userQuery: 'help',
      rawResponse: 'অবশ্যই! আমি আপনাকে সাহায্য করতে প্রস্তুত। আর কিছু জানতে চাও?',
      domain: 'general'
    });
    const passed = !result.spokenText.includes('অবশ্যই!') && !result.spokenText.includes('আর কিছু জানতে চাও?');
    return { id: 'P15-10', name: 'Robotic filler stripping', passed, category: 'ADAPTIVE' };
  }
}

export const phase15TestSuite = Phase15TestSuite.getInstance();
