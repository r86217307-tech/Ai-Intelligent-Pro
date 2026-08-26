/**
 * Central API Endpoint Client for Sufia AI Trader
 * 
 * Enforces production URL usage to completely avoid any localhost calls in Android / Capacitor builds,
 * while allowing user-configured custom API endpoints via in-app Settings.
 */

// Forced production fallback URL
export const PRODUCTION_URL = "https://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app";

export const getCustomApiBaseUrl = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("coco_settings_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.customApiUrl && typeof parsed.customApiUrl === "string" && parsed.customApiUrl.trim() !== "") {
        return parsed.customApiUrl.trim().replace(/\/$/, "");
      }
    }
  } catch (e) {
    console.warn("Failed to retrieve custom API URL from settings:", e);
  }
  return "";
};

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
    (ua.includes("android") && (protocol === "file:" || protocol === "capacitor:"));

  const isCustomProtocol = protocol === "capacitor:" || protocol === "file:";

  const isAndroidLocalhost = 
    (hostname === "localhost" || hostname === "127.0.0.1") && 
    (port === "" || port === "80" || port === "443" || !port);

  return hasCapacitor || isCustomProtocol || isAndroidLocalhost;
};

export const getApiBaseUrl = (): string => {
  // 0. User-configured Custom API URL from Settings takes top priority
  const customUrl = getCustomApiBaseUrl();
  if (customUrl) {
    return customUrl;
  }

  // 1. If running in Android/Capacitor build, use environment variable or production URL
  if (isAndroidCapacitor()) {
    const envUrl = 
      import.meta.env.VITE_API_BASE_URL || 
      import.meta.env.VITE_DEFAULT_API_BASE_URL || 
      import.meta.env.VITE_API_URL;
    if (envUrl) {
      return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
    }
    return PRODUCTION_URL;
  }

  // 2. If we are running in a web browser, default to same-origin relative path to ensure cookies/sessions match perfectly.
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

  // 3. Fallback to explicit environment variable (e.g. for static hosting exports)
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
    const wsBaseUrl = baseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
    return `${wsBaseUrl}${cleanPath}`;
  }

  // Same-origin fallback
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    return `${protocol}${window.location.host}${cleanPath}`;
  }

  return `wss://ais-pre-xx57rykxlx4qvpsbs45okj-627265381449.asia-southeast1.run.app${cleanPath}`;
};

export interface HealthCheckResult {
  ok: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "CHECKING";
  latency?: number;
  uptime?: number;
  aiConfigured?: boolean;
  error?: string;
  endpointUrl: string;
}

export const testApiConnection = async (targetBaseUrl?: string): Promise<HealthCheckResult> => {
  let endpoint = "";
  if (targetBaseUrl && targetBaseUrl.trim() !== "") {
    endpoint = targetBaseUrl.trim().replace(/\/$/, "");
  } else {
    endpoint = getApiBaseUrl();
  }

  const pingUrl = endpoint ? `${endpoint}/api/health` : "/api/health";
  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(pingUrl, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const endTime = performance.now();
      return {
        ok: true,
        status: "CONNECTED",
        latency: Math.round(endTime - startTime),
        uptime: data.uptime,
        aiConfigured: !!data.aiConfigured,
        endpointUrl: endpoint || window.location.origin
      };
    } else {
      return {
        ok: false,
        status: "DISCONNECTED",
        error: `Server responded with HTTP status ${res.status}`,
        endpointUrl: endpoint || window.location.origin
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      status: "DISCONNECTED",
      error: err?.name === "AbortError" ? "Connection timed out after 8s" : (err?.message || "Network request failed"),
      endpointUrl: endpoint || (typeof window !== "undefined" ? window.location.origin : "")
    };
  }
};

