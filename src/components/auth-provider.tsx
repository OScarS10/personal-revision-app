"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { SessionUser } from "@/lib/auth";

interface AuthContextType {
  user: SessionUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (updates: { name?: string; avatar_url?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_STORAGE_KEY = "specwise-auth";

function getStoredAuth(): { user: SessionUser; accessToken: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function setStoredAuth(user: SessionUser, accessToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, accessToken }));
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setUser(stored.user);
      setAccessToken(stored.accessToken);
    }
    setIsLoading(false);
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const refreshToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("refreshToken="))
        ?.split("=")[1];

      if (!refreshToken) throw new Error("No refresh token");

      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Refresh failed");

      const data = await response.json();
      setUser(data.user);
      setAccessToken(data.accessToken);
      setStoredAuth(data.user, data.accessToken);
    } catch (error) {
      console.error("Token refresh failed:", error);
      await logout();
    }
  }, []);

  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      headers.set("Content-Type", "application/json");

      const response = await fetch(url, { ...options, headers, credentials: "include" });

      if (response.status === 401 && accessToken) {
        // Try to refresh token
        await refreshToken();
        const newToken = getStoredAuth()?.accessToken;
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
          return fetch(url, { ...options, headers, credentials: "include" });
        }
      }

      return response;
    },
    [accessToken, refreshToken]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error ?? "Login failed" };
      }

      setUser(data.user);
      setAccessToken(data.accessToken);
      setStoredAuth(data.user, data.accessToken);
      return {};
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error ?? "Registration failed" };
      }

      setUser(data.user);
      setAccessToken(data.accessToken);
      setStoredAuth(data.user, data.accessToken);
      return {};
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
    } catch {
      // Ignore errors
    } finally {
      setUser(null);
      setAccessToken(null);
      clearStoredAuth();
    }
  }, [accessToken]);

  const updateProfile = useCallback(
    async (updates: { name?: string; avatar_url?: string }) => {
      const response = await apiCall("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to update profile");
      }

      const data = await response.json();
      setUser(data.user);
      setStoredAuth(data.user, accessToken!);
    },
    [apiCall, accessToken]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const response = await apiCall("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error ?? "Failed to change password" };
      }

      return { success: true };
    },
    [apiCall]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshToken,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}