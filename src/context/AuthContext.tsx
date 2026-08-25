import React, { createContext, useContext, useEffect, useState } from "react";

export interface KeyUser {
  uid: string;
  key: string;
  keyType: string;
  displayName: string;
  email: string;
  photoURL: string;
  activatedAt: string;
}

interface AuthContextType {
  user: KeyUser | null;
  loading: boolean;
  loginWithKey: (inputKey: string) => { success: boolean; error?: string };
  logout: () => void;
}

const STORAGE_KEY = "sufia_access_key_session";

const AuthContext = createContext<AuthContextType | null>(null);

export function generateUserFromKey(rawKey: string): KeyUser {
  const cleanKey = rawKey.trim().toUpperCase();
  const keyHash = cleanKey.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  let keyType = "VIP Access Key";
  if (cleanKey.includes("MASTER") || cleanKey.includes("ADMIN")) {
    keyType = "Master License Key";
  } else if (cleanKey.includes("PRO") || cleanKey.includes("ULTRA")) {
    keyType = "Pro Trader Key";
  }

  const shortId = cleanKey.replace(/[^A-Z0-9]/g, "").slice(-6) || String(keyHash).slice(0, 6);
  const displayName = `Trader_${shortId}`;
  
  return {
    uid: `key_user_${shortId}_${keyHash}`,
    key: cleanKey,
    keyType,
    displayName,
    email: `${displayName.toLowerCase()}@sufia.ai`,
    photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanKey}`,
    activatedAt: new Date().toISOString(),
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<KeyUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(STORAGE_KEY);
      if (storedSession) {
        const parsed = JSON.parse(storedSession) as KeyUser;
        if (parsed && parsed.key) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load access key session", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithKey = (inputKey: string): { success: boolean; error?: string } => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      return { success: false, error: "অনুগ্রহ করে একটি Access Key লিখুন" };
    }

    if (trimmed.length < 4) {
      return { success: false, error: "Access Key কমপক্ষে ৪ অক্ষরের হতে হবে" };
    }

    const keyUser = generateUserFromKey(trimmed);
    setUser(keyUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keyUser));
    } catch (e) {
      console.warn("Failed to persist session to localStorage", e);
    }
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to remove session", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithKey, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

