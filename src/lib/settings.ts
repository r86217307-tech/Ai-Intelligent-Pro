import { AppSettings } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  broker: "Quotex",
  defaultAsset: "EUR/USD",
  defaultTimeframe: "1M",
  defaultMode: "OTC",
  riskPerTrade: 1,
  maxDailyLoss: 5,
  autoAnalysis: true,
  premiumAnimation: true,
  soundEnabled: false,
  saveHistory: true,
  resultDisplay: "STANDARD",
  testModeDefaultBroker: "Quotex",
  testModeAutoEvaluate: true,
};

const SETTINGS_KEY = "coco_settings_v1";

export function getStoredSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.warn("Failed to read settings from localStorage", e);
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings to localStorage", e);
  }
}
