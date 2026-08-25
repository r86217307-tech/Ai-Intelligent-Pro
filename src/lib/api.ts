/**
 * Central API Endpoint Resolution Utility for Sufia AI Trader
 * 
 * Ensures robust connectivity across standard web browsers, exported production builds,
 * standalone static hosts, and Android Capacitor webviews.
 */

// 1. Central API Base URL Configuration
export const getApiBaseUrl = (): string => {
  // Check VITE_API_BASE_URL first as requested
  const baseFromEnv = 
    import.meta.env.VITE_API_BASE_URL || 
    import.meta.env.VITE_API_URL || 
    import.meta.env.VITE_APP_URL || 
    import.meta.env.APP_URL;

  if (baseFromEnv) {
    return baseFromEnv.endsWith("/") ? baseFromEnv.slice(0, -1) : baseFromEnv;
  }

  // Determine current window location properties
  if (typeof window !== "undefined") {
    const loc = window.location;
    const protocol = loc.protocol;
    const hostname = loc.hostname;
    const port = loc.port;

    // Detect Android Capacitor WebView environments accurately:
    // - Protocol can be 'capacitor:' (iOS/Android custom) or 'http:/https:' under custom schemes
    // - Hostname can be 'localhost' or '127.0.0.1' with empty port in real Capacitor app
    const isCapacitor = 
      protocol === "capacitor:" || 
      Boolean((window as any).AndroidBridge) || 
      Boolean((window as any).Capacitor) ||
      (hostname === "localhost" && port === "") ||
      (hostname === "127.0.0.1" && port === "");

    // Deployed same-origin Cloud Run URL
    const isCloudRun = hostname.endsWith(".run.app");

    // Localhost development web server with custom port (e.g., 3000)
    const isLocalDevelopment = (hostname === "localhost" || hostname === "127.0.0.1") && port !== "";

    // Static hosting environments (e.g., Vercel, Netlify, GitHub Pages) with no running backend
    const isStaticHosting = !isLocalDevelopment && !isCloudRun && !isCapacitor;

    if (isCapacitor || isStaticHosting) {
      // Safe, high-availability production Cloud Run fallback URL
      return "https://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app";
    }
  }

  // Default to relative/same-origin URL
  return "";
};

export const getApiUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl) {
    return cleanPath; // Safe relative resolution
  }
  return `${baseUrl}${cleanPath}`;
};

export const getWebSocketUrl = (path: string): string => {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  if (baseUrl) {
    // Correctly convert HTTPS/HTTP to WSS/WS
    const wsBaseUrl = baseUrl.replace(/^http/, "ws");
    return `${wsBaseUrl}${cleanPath}`;
  }

  // Browser fallback relative resolution
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    return `${protocol}${window.location.host}${cleanPath}`;
  }

  return `wss://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app${cleanPath}`;
};
