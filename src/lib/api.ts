/**
 * API Endpoint Resolution Utility for Sufia AI Trader
 * 
 * Ensures robust connectivity across standard web browsers, exported production builds,
 * standalone static hosts, and Android Capacitor webviews.
 */

export const getApiUrl = (path: string): string => {
  // 1. Explicit environment variable configuration
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_URL;
  if (envUrl) {
    const cleanEnvUrl = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanEnvUrl}${cleanPath}`;
  }

  // 2. Fallback for mobile wrappers (Capacitor/Cordova) or standalone static environments
  const isCapacitorOrLocalhost = 
    typeof window !== "undefined" && (
      window.location.protocol === "capacitor:" || 
      (window.location.protocol === "http:" && window.location.hostname === "localhost") ||
      (window as any).AndroidBridge ||
      (window as any).Capacitor
    );

  if (isCapacitorOrLocalhost && typeof window !== "undefined") {
    // Fallback to the production Cloud Run URL as a self-healing default.
    const defaultHost = "https://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${defaultHost}${cleanPath}`;
  }

  // 3. Fallback to standard relative URL
  return path;
};

export const getWebSocketUrl = (path: string): string => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_URL;
  if (envUrl) {
    const cleanEnvUrl = envUrl.replace(/^http/, "ws");
    const cleanEnvUrlNoSlash = cleanEnvUrl.endsWith("/") ? cleanEnvUrl.slice(0, -1) : cleanEnvUrl;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanEnvUrlNoSlash}${cleanPath}`;
  }

  const isCapacitorOrLocalhost = 
    typeof window !== "undefined" && (
      window.location.protocol === "capacitor:" || 
      (window.location.protocol === "http:" && window.location.hostname === "localhost") ||
      (window as any).AndroidBridge ||
      (window as any).Capacitor
    );

  if (isCapacitorOrLocalhost && typeof window !== "undefined") {
    const defaultHost = "wss://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app";
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${defaultHost}${cleanPath}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}${window.location.host}${cleanPath}`;
};
