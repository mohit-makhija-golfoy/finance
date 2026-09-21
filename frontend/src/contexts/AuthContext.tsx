import React, { createContext, useContext, useEffect, useState } from "react";
import { api, TOKEN_KEY, CURRENT_USER_KEY, apiGetMe } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { initializeDatabase } from "@/src/database/db";

type User = { id: string; email: string; full_name?: string | null };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string) => Promise<void>;
  register: (email: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (!token) {
      setUser(null);
      return;
    }

    const userJson = await storage.secureGet<string>(CURRENT_USER_KEY, "");
    if (!userJson) {
      setUser(null);
      return;
    }

    const parsed = JSON.parse(userJson);
    if (parsed?.id && token !== parsed.id) {
      await storage.secureSet(TOKEN_KEY, parsed.id);
    }
    setUser(parsed);
  };

  useEffect(() => {
    (async () => {
      try {
        // Initialize database first
        await initializeDatabase();
      } catch (e) {
        // Database initialization failed (common on web)
        // App will still work with in-memory fallback
        console.warn("Database initialization skipped:", e);
      }

      try {
        // Check if user is already logged in
        await refreshSession();
      } catch (e) {
        console.error("Auth restoration error:", e);
        await storage.secureRemove(TOKEN_KEY);
        await storage.secureRemove(CURRENT_USER_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string) => {
    const res = await api.post("/auth/login", { email });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await storage.secureSet(CURRENT_USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  };

  const register = async (email: string, fullName?: string) => {
    const res = await api.post("/auth/register", { email, full_name: fullName });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await storage.secureSet(CURRENT_USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.secureRemove(CURRENT_USER_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout, refreshSession }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
};
