"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import { cn } from "@/src/lib/utils";

interface Camera {
  id: string;
  protect_id: string;
  name: string;
  enabled: boolean;
  created_at: string;
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const data = await apiFetch<Camera[]>("/api/cameras");
      setCameras(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(c: Camera) {
    await apiFetch(`/api/cameras/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    load();
  }

  async function syncCameras() {
    setSyncing(true);
    setMsg("");
    try {
      await apiFetch("/api/cameras/sync", { method: "POST" });
      setMsg("Sync initiated. Cameras will update shortly.");
      setTimeout(load, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Cameras</h1>
          <button
            onClick={syncCameras}
            disabled={syncing}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "↻ Sync from Protect"}
          </button>
        </div>

        {error && <div className="text-destructive text-sm mb-4">{error}</div>}
        {msg && <div className="text-green-400 text-sm mb-4">{msg}</div>}

        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">📷</p>
            <p>No cameras yet. Sync from Protect to import cameras.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{c.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.protect_id}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded", c.enabled ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground")}>
                    {c.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => toggleEnabled(c)}
                    className="flex-1 text-sm border border-border rounded-md py-1.5 hover:bg-accent transition-colors"
                  >
                    {c.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
