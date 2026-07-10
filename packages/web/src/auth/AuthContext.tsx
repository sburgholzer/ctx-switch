import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "ctx-switch-api-key";
const LAST_ACTIVITY_KEY = "ctx-switch-last-activity";
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextValue {
  isAuthenticated: boolean;
  apiKey: string | null;
  login: (apiKey: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > INACTIVITY_TIMEOUT_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(LAST_ACTIVITY_KEY);
        return null;
      }
    }
    return stored;
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setApiKey(null);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!apiKey) return;

    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      logout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [apiKey, logout]);

  const login = useCallback((key: string) => {
    setApiKey(key);
    sessionStorage.setItem(STORAGE_KEY, key);
    sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  // Set up activity listeners when authenticated
  useEffect(() => {
    if (!apiKey) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"] as const;

    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Start the inactivity timer
    resetInactivityTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [apiKey, resetInactivityTimer]);

  const value: AuthContextValue = {
    isAuthenticated: apiKey !== null,
    apiKey,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
