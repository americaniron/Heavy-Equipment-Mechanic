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
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
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

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("authToken", data.authToken);
    setAuthToken(data.authToken);
    setCustomer(data);
  };

  const register = async (regData: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }
    const data = await res.json();
    localStorage.setItem("authToken", data.authToken);
    setAuthToken(data.authToken);
    setCustomer(data);
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
    <AuthContext.Provider value={{ customer, authToken, isLoading, login, register, logout, isAuthenticated: !!customer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
