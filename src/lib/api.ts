/**
 * Central API Endpoint Client for Sufia AI Trader
 * 
 * Enforces production URL usage to completely avoid any localhost calls in Android / Capacitor builds.
 */

// Forced production fallback URL
export const PRODUCTION_URL = "https://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app";

export const isAndroidCapacitor = (): boolean => {
  if (typeof window === "undefined") return false;
  
  const loc = window.location;
  const protocol = loc.protocol;
  const hostname = loc.hostname;
  const port = loc.port;
  const ua = navigator.userAgent.toLowerCase();

  const hasCapacitor = 
    Boolean((window as any).Capacitor) || 
    Boolean((window as any).AndroidBridge) ||
    ua.includes("capacitor") ||
    ua.includes("android") && (protocol === "file:" || protocol === "capacitor:");

  const isCustomProtocol = protocol === "capacitor:" || protocol === "file:";

  const isAndroidLocalhost = 
    (hostname === "localhost" || hostname === "127.0.0.1") && 
    (port === "" || port === "80" || port === "443" || !port);

  return hasCapacitor || isCustomProtocol || isAndroidLocalhost;
};

export const getApiBaseUrl = (): string => {
  // If running in Android/Capacitor build, strictly bypass any localhost detection and use production URL
  if (isAndroidCapacitor()) {
    return import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_DEFAULT_API_BASE_URL || PRODUCTION_URL;
  }

  // 1. If we are running in a web browser, default to same-origin relative path to ensure cookies/sessions match perfectly.
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Localhost development web server with custom port (e.g. 5173/3001) where backend runs on 3000
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port !== "" && port !== "3000") {
      return `http://${hostname}:3000`;
    }
    
    // Direct backend access on port 3000
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
      return `http://${hostname}:3000`;
    }

    // Standard web browser environment: use relative paths
    return "";
  }

  // 2. Fallback to explicit environment variable (e.g. for static hosting exports)
  const baseFromEnv = 
    import.meta.env.VITE_API_BASE_URL || 
    import.meta.env.VITE_API_URL || 
    import.meta.env.VITE_DEFAULT_API_BASE_URL;

  if (baseFromEnv) {
    return baseFromEnv.endsWith("/") ? baseFromEnv.slice(0, -1) : baseFromEnv;
  }

  // Absolute fallback to secure production endpoint for all other contexts
  return PRODUCTION_URL;
};

export const getApiUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl) {
    return cleanPath; // Relative fallback
  }
  return `${baseUrl}${cleanPath}`;
};

export const getWebSocketUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  if (baseUrl) {
    // Correctly convert HTTP/HTTPS base URL to WS/WSS
    const wsBaseUrl = baseUrl.replace(/^http/, "ws");
    return `${wsBaseUrl}${cleanPath}`;
  }

  // Same-origin fallback
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    return `${protocol}${window.location.host}${cleanPath}`;
  }

  return `wss://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app${cleanPath}`;
};
