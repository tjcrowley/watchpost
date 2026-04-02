"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({ token: null, user: null, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("watchpost_token");
    if (!stored) {
      router.push("/login");
      return;
    }
    setToken(stored);
    const storedUser = localStorage.getItem("watchpost_user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {}
    }
    setChecked(true);
  }, [router]);

  function logout() {
    localStorage.removeItem("watchpost_token");
    localStorage.removeItem("watchpost_user");
    router.push("/login");
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ token, user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
