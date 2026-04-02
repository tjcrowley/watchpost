"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface UserInfo {
  id: string;
  email: string;
  role: string;
  site_id: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("watchpost_token");
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    localStorage.removeItem("watchpost_token");
    window.location.href = "/login";
  }

  if (loading) {
    return <p className="py-8 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="mt-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium uppercase text-primary">
              {user?.role}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site ID</span>
            <span className="font-mono text-xs">{user?.site_id}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">System</h2>
        <div className="mt-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">API</span>
            <span className="font-mono text-xs">{API_URL}</span>
          </div>
        </div>
      </section>

      <button
        onClick={handleLogout}
        className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
      >
        Sign Out
      </button>
    </div>
  );
}
