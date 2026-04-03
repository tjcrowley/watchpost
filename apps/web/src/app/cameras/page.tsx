"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, getToken } from "@/src/lib/api";
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
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [snapshotErrors, setSnapshotErrors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const blobUrls = useRef<string[]>([]);

  async function loadCameras() {
    try {
      const data = await apiFetch<Camera[]>("/api/cameras");
      setCameras(data);
      return data;
    } catch (e) {
      setError((e as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }

  const loadSnapshots = useCallback(async (cameraList: Camera[]) => {
    const token = getToken();
    const enabled = cameraList.filter((c) => c.enabled);
    const errors = new Set<string>();

    const results = await Promise.allSettled(
      enabled.map(async (c) => {
        const res = await fetch(`/api/cameras/${c.id}/snapshot`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          errors.add(c.id);
          return { id: c.id, url: null };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        return { id: c.id, url };
      })
    );

    // Revoke old blob URLs
    blobUrls.current.forEach(URL.revokeObjectURL);
    const newUrls: string[] = [];

    const newSnapshots: Record<string, string> = {};
    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value.url) {
        newSnapshots[r.value.id] = r.value.url;
        newUrls.push(r.value.url);
      }
    });

    blobUrls.current = newUrls;
    setSnapshots(newSnapshots);
    setSnapshotErrors(errors);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cams = await loadCameras();
      if (mounted && cams.length > 0) {
        loadSnapshots(cams);
        intervalRef.current = setInterval(async () => {
          const fresh = await apiFetch<Camera[]>("/api/cameras").catch(() => cams);
          if (mounted) {
            setCameras(fresh);
            loadSnapshots(fresh);
          }
        }, 30000);
      }
    })();
    return () => {
      mounted = false;
      clearInterval(intervalRef.current);
      blobUrls.current.forEach(URL.revokeObjectURL);
    };
  }, [loadSnapshots]);

  async function toggleEnabled(c: Camera) {
    await apiFetch(`/api/cameras/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    const cams = await loadCameras();
    loadSnapshots(cams);
  }

  async function syncCameras() {
    setSyncing(true);
    setMsg("");
    try {
      await apiFetch("/api/cameras/sync", { method: "POST" });
      setMsg("Sync initiated. Cameras will update shortly.");
      setTimeout(async () => {
        const cams = await loadCameras();
        loadSnapshots(cams);
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const onlineCount = cameras.filter((c) => c.enabled && !snapshotErrors.has(c.id)).length;
  const offlineCount = cameras.filter((c) => !c.enabled || snapshotErrors.has(c.id)).length;

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Cameras</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cameras.length} camera{cameras.length !== 1 ? "s" : ""}
              {cameras.length > 0 && (
                <> &middot; <span className="text-green-400">{onlineCount} online</span>
                {offlineCount > 0 && <>, <span className="text-red-400">{offlineCount} offline</span></>}
                </>
              )}
            </p>
          </div>
          <button
            onClick={syncCameras}
            disabled={syncing}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Cameras"}
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
            {cameras.map((c) => {
              const isOnline = c.enabled && snapshots[c.id] && !snapshotErrors.has(c.id);
              const isOffline = !c.enabled || snapshotErrors.has(c.id);

              return (
                <div key={c.id} className="bg-card border border-border rounded-lg overflow-hidden">
                  {/* Snapshot area */}
                  <div className="relative aspect-video bg-gray-800">
                    {isOnline && snapshots[c.id] ? (
                      <img
                        src={snapshots[c.id]}
                        alt={`${c.name} snapshot`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-3xl mb-1 opacity-30">📷</p>
                          <p className="text-xs text-muted-foreground">
                            {!c.enabled ? "Disabled" : "No feed"}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Status badge overlay */}
                    <div className="absolute top-2 right-2">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-medium backdrop-blur-sm",
                        isOnline
                          ? "bg-green-500/30 text-green-400 border border-green-500/30"
                          : "bg-gray-700/80 text-gray-400 border border-gray-600/50"
                      )}>
                        {isOnline ? "Online" : isOffline ? "Offline" : "Loading..."}
                      </span>
                    </div>
                  </div>

                  {/* Info area */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{c.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.protect_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleEnabled(c)}
                        className={cn(
                          "flex-1 text-sm border rounded-md py-1.5 transition-colors",
                          c.enabled
                            ? "border-border hover:bg-accent"
                            : "border-green-500/30 text-green-400 hover:bg-green-500/10"
                        )}
                      >
                        {c.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
