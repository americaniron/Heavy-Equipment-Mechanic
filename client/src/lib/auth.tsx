import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { queryClient } from "./queryClient";
import {
  AUTH_INVALIDATED_EVENT,
  AUTH_TOKEN_KEY,
  ApiError,
  apiErrorMessage,
  apiFetch,
  clearStoredAuthToken,
  expectJson,
  getStoredAuthToken,
} from "./api";

interface Customer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone: string | null;
  role: string;
  status: string;
}

interface AuthContextType {
  customer: Customer | null;
  authToken: string | null;
  isLoading: boolean;
  sessionError: string | null;
  login: (email: string, password: string) => Promise<{ needsVerification?: boolean } | void>;
  register: (data: RegisterData) => Promise<{ requiresVerification?: boolean } | void>;
  logout: () => void;
  retrySession: () => void;
  applySession: (data: Record<string, unknown>) => void;
  isAuthenticated: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company?: string;
  phone?: string;
  equipmentType?: string;
  equipmentMake?: string;
  equipmentModel?: string;
  equipmentYear?: string;
  equipmentSerial?: string;
  equipmentSmuHours?: string;
  problemSummary?: string;
  faultCodes?: string;
  equipmentLocation?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(getStoredAuthToken);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  const clearAuth = useCallback(() => {
    setCustomer(null);
    setAuthToken(null);
    setIsLoading(false);
    setSessionError(null);
    clearStoredAuthToken(false);
    queryClient.clear();
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_INVALIDATED_EVENT, clearAuth);
    return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, clearAuth);
  }, [clearAuth]);

  useEffect(() => {
    if (!authToken) {
      setIsLoading(false);
      setSessionError(null);
      return;
    }
    setIsLoading(true);
    setSessionError(null);
    apiFetch("/api/auth/me", {}, { authenticated: true, token: authToken })
      .then((response) => expectJson<Customer>(response, "Invalid session"))
      .then((data) => {
        setCustomer(data);
        setSessionError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearAuth();
          return;
        }
        setCustomer(null);
        setSessionError(error instanceof Error ? error.message : "Session verification is temporarily unavailable.");
      })
      .finally(() => setIsLoading(false));
  }, [authToken, clearAuth, sessionAttempt]);

  const applySession = useCallback((data: Record<string, unknown>) => {
    const token = String(data.authToken ?? data.token ?? "");
    if (!token) return;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthToken(token);
    setCustomer((data.user as Customer) ?? (data as unknown as Customer));
    setSessionError(null);
  }, []);

  const retrySession = useCallback(() => {
    setSessionAttempt((attempt) => attempt + 1);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.clone().json().catch(() => ({})) as Record<string, unknown> & {
      error?: string;
      needsVerification?: boolean;
    };
    if (res.status === 403 && data.needsVerification) {
      throw Object.assign(new Error(data.error || "Email verification required"), {
        needsVerification: true,
      });
    }
    if (!res.ok) {
      throw new Error(await apiErrorMessage(res, "Login failed"));
    }
    applySession(data);
  };

  const register = async (regData: RegisterData) => {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
    });
    const data = await res.clone().json().catch(() => ({})) as Record<string, unknown> & {
      error?: string;
      requiresVerification?: boolean;
    };
    if (!res.ok) {
      throw new Error(await apiErrorMessage(res, "Registration failed"));
    }
    if (data.requiresVerification) {
      return { requiresVerification: true };
    }
    applySession(data);
  };

  const logout = () => {
    if (authToken) {
      apiFetch("/api/auth/logout", {
        method: "POST",
      }, { authenticated: true, token: authToken }).catch(() => {});
    }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ customer, authToken, isLoading, sessionError, login, register, logout, retrySession, applySession, isAuthenticated: !!customer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
