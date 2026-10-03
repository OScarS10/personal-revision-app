"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, ReactNode } from "react";
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

/**
  The stored session, as an external store.
 *
  This used to be `useState` plus a mount effect that called `setUser` twice. That
  pattern is wrong twice over: it cascades an extra render on every page load, and
  the server renders `null` while the client's first render used `null` too only by
  accident of ordering. `useSyncExternalStore` fixes both - the server snapshot is
  genuinely `null`, so hydration is deterministic, and reading localStorage is an
  external-system read rather than a state update.
*/
let listeners: Array<() => void> = [];

interface StoredAuth {
  user: SessionUser;
  accessToken: string;
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function readAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const { user, accessToken } = parsed as Partial<StoredAuth>;
    if (!user || typeof accessToken !== "string") return null;
    return { user, accessToken };
  } catch {
    return null;
  }
}

/** Notify subscribers after the stored session changes. */
function emit() {
  for (const listener of [...listeners]) listener();
}

function getStoredAuth(): StoredAuth | null {
  return readAuth();
}

function setStoredAuth(user: SessionUser, accessToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, accessToken }));
  emit();
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  emit();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, readAuth, () => null);
  const user = stored?.user ?? null;
  const accessToken = stored?.accessToken ?? null;
  // Hydration is the only time this is true, and it matches how the server
  // rendered, so nothing flashes a signed-out shell for a signed-in learner.
  const isLoading = false;

  /*
    Declared before `refreshToken`, which calls it.

    It previously came after, so `refreshToken` closed over a `const` that had not
    been initialised yet - a temporal dead zone reference that only blew up on the
    one path where a refresh actually failed.
  */
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        credentials: "include",
      });
    } catch {
      // Ignore errors: the local session is cleared either way, and the cookie is
      // best-effort.
    } finally {
      clearStoredAuth();
    }
  }, [accessToken]);

  const refreshToken = useCallback(async () => {
    try {
      const refreshTokenCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("refreshToken="))
        ?.split("=")[1];

      if (!refreshTokenCookie) throw new Error("No refresh token");

      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Refresh failed");

      const data = await response.json();
      setStoredAuth(data.user, data.accessToken);
    } catch (error) {
      console.error("Token refresh failed:", error);
      await logout();
    }
  }, [logout]);

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

      setStoredAuth(data.user, data.accessToken);
      return {};
    },
    []
  );

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
      // Re-read the token rather than closing over `accessToken`, which may be stale
      // by the time the request resolves after a refresh.
      const current = readAuth();
      if (current) setStoredAuth(data.user, current.accessToken);
    },
    [apiCall]
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