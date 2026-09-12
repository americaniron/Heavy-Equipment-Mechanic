import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

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
  login: (email: string, password: string) => Promise<{ needsVerification?: boolean } | void>;
  register: (data: RegisterData) => Promise<{ requiresVerification?: boolean } | void>;
  logout: () => void;
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
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setCustomer(null);
    setAuthToken(null);
    localStorage.removeItem("authToken");
  }, []);

  useEffect(() => {
    if (!authToken) {
      setIsLoading(false);
      return;
    }
    fetch("/api/auth/me", { headers: { "x-auth-token": authToken } })
      .then(r => {
        if (!r.ok) throw new Error("Invalid session");
        return r.json();
      })
      .then(data => setCustomer(data))
      .catch(() => clearAuth())
      .finally(() => setIsLoading(false));
  }, [authToken, clearAuth]);

  const applySession = useCallback((data: Record<string, unknown>) => {
    const token = String(data.authToken ?? data.token ?? "");
    if (!token) return;
    localStorage.setItem("authToken", token);
    setAuthToken(token);
    setCustomer((data.user as Customer) ?? (data as unknown as Customer));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.status === 403 && data.needsVerification) {
      throw Object.assign(new Error(data.error || "Email verification required"), {
        needsVerification: true,
      });
    }
    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }
    applySession(data);
  };

  const register = async (regData: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Registration failed");
    }
    if (data.requiresVerification) {
      return { requiresVerification: true };
    }
    applySession(data);
  };

  const logout = () => {
    if (authToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-auth-token": authToken },
      }).catch(() => {});
    }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ customer, authToken, isLoading, login, register, logout, applySession, isAuthenticated: !!customer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
