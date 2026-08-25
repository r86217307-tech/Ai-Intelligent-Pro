/**
 * Mobile Capability Detection Layer for Sufia AI (Phase 19)
 * Detects device archetype, runtime container, media interfaces, and hardware capabilities.
 */

import { nativeBridge, RuntimeEnvironment } from './nativeBridge';

export interface MobileCapabilities {
  environment: RuntimeEnvironment;
  isAndroid: boolean;
  isIOS: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isAndroidWebView: boolean;
  isSecureContext: boolean;
  hasMicrophone: boolean;
  hasAudioWorklet: boolean;
  hasWebSocket: boolean;
  hasCamera: boolean;
  hasScreenCapture: boolean;
  browser: string;
  os: string;
  screenResolution: { width: number; height: number; dpr: number };
}

export class MobileCapabilityManager {
  private static instance: MobileCapabilityManager;
  private cachedCapabilities: MobileCapabilities | null = null;

  private constructor() {}

  public static getInstance(): MobileCapabilityManager {
    if (!MobileCapabilityManager.instance) {
      MobileCapabilityManager.instance = new MobileCapabilityManager();
    }
    return MobileCapabilityManager.instance;
  }

  /**
   * Evaluates the client platform and hardware media interfaces
   */
  public detectCapabilities(): MobileCapabilities {
    if (this.cachedCapabilities && typeof window !== 'undefined') {
      return this.cachedCapabilities;
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        environment: 'WEB',
        isAndroid: false,
        isIOS: false,
        isMobile: false,
        isDesktop: true,
        isAndroidWebView: false,
        isSecureContext: false,
        hasMicrophone: false,
        hasAudioWorklet: false,
        hasWebSocket: false,
        hasCamera: false,
        hasScreenCapture: false,
        browser: 'SSR/Node',
        os: 'Server',
        screenResolution: { width: 0, height: 0, dpr: 1 }
      };
    }

    const env = nativeBridge.detectEnvironment();

    const ua = navigator.userAgent || '';
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

    // OS Detection
    const isAndroid = /Android/i.test(ua) || /Android/i.test(platform);
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isMobile = isAndroid || isIOS || /Mobile|Silk|Kindle|BlackBerry|Opera Mini/i.test(ua);
    const isDesktop = !isMobile;

    // Android WebView Detection
    // Typical patterns: 'wv' substring in UA or Version/4.0 on Android Chrome
    const isAndroidWebView = isAndroid && (/wv/.test(ua) || /Version\/[\d.]+.*Chrome/.test(ua));

    // Browser Family
    let browser = 'Unknown';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';

    const os = isAndroid ? 'Android' : isIOS ? 'iOS' : isDesktop ? (platform || 'Desktop') : 'Mobile';

    // Context & Media APIs
    const isSecureContext = window.isSecureContext === true;
    const hasWebSocket = typeof window.WebSocket !== 'undefined';
    const hasMediaDevices = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    const hasMicrophone = hasMediaDevices;
    const hasCamera = hasMediaDevices;

    const hasAudioWorklet = !!(
      typeof window.AudioContext !== 'undefined' && 
      'audioWorklet' in AudioContext.prototype &&
      typeof window.AudioWorkletNode !== 'undefined'
    );

    const hasScreenCapture = !!(
      isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
      !isAndroid && // Android mobile browsers do not support getDisplayMedia in practical WebView/Chrome
      !isIOS
    );

    const screenResolution = {
      width: window.innerWidth || (window.screen ? window.screen.width : 0),
      height: window.innerHeight || (window.screen ? window.screen.height : 0),
      dpr: window.devicePixelRatio || 1
    };

    this.cachedCapabilities = {
      environment: env,
      isAndroid,
      isIOS,
      isMobile,
      isDesktop,
      isAndroidWebView,
      isSecureContext,
      hasMicrophone,
      hasAudioWorklet,
      hasWebSocket,
      hasCamera,
      hasScreenCapture,
      browser,
      os,
      screenResolution
    };

    return this.cachedCapabilities;
  }

  /**
   * Helper to verify if screen sharing is executable or needs upload fallback
   */
  public getScreenShareStatus(): {
    supported: boolean;
    reasonBn: string;
    reasonEn: string;
    fallbackRecommendation: string;
  } {
    const caps = this.detectCapabilities();
    
    if (caps.isMobile || caps.isAndroid || caps.isIOS) {
      return {
        supported: false,
        reasonBn: 'মোবাইল ব্রাউজার বা অ্যাপে লাইভ স্ক্রিন শেয়ারিং সাপোর্ট নেই।',
        reasonEn: 'Screen sharing is not supported on mobile devices or WebViews.',
        fallbackRecommendation: 'Please upload a chart screenshot directly using the Analyzer.'
      };
    }

    if (!caps.isSecureContext) {
      return {
        supported: false,
        reasonBn: 'স্ক্রিন শেয়ারিংয়ের জন্য নিরাপদ HTTPS কানেকশন প্রয়োজন।',
        reasonEn: 'Screen capture requires a secure context (HTTPS).',
        fallbackRecommendation: 'Switch to a secure HTTPS connection.'
      };
    }

    if (!caps.hasScreenCapture) {
      return {
        supported: false,
        reasonBn: 'আপনার ব্রাউজার getDisplayMedia API সাপোর্ট করে না।',
        reasonEn: 'Your browser does not support the getDisplayMedia API.',
        fallbackRecommendation: 'Use a supported desktop browser or upload a screenshot.'
      };
    }

    return {
      supported: true,
      reasonBn: 'স্ক্রিন শেয়ারিং সক্রিয়।',
      reasonEn: 'Screen sharing is supported on this device.',
      fallbackRecommendation: ''
    };
  }

  /**
   * Clear cache (useful during testing or orientation changes)
   */
  public resetCache(): void {
    this.cachedCapabilities = null;
  }
}

export const mobileCapabilityManager = MobileCapabilityManager.getInstance();
