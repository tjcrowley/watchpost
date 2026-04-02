"use client";

import { useEffect, useState } from "react";
import type { Camera } from "@watchpost/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken() {
  return localStorage.getItem("watchpost_token");
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [zoneEdits, setZoneEdits] = useState<Record<string, string>>({});
  const [savingZone, setSavingZone] = useState<string | null>(null);

  useEffect(() => {
    fetchCameras();
  }, []);

  async function fetchCameras() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/cameras`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      const list: Camera[] = Array.isArray(data) ? data : [];
      setCameras(list);
      // Initialize zone edits with current config
      const edits: Record<string, string> = {};
      for (const c of list) {
        edits[c.id] = JSON.stringify(c.zone_config ?? {}, null, 2);
      }
      setZoneEdits(edits);
    } catch {
      console.error("Failed to fetch cameras");
    } finally {
      setLoading(false);
    }
  }

  async function toggleCamera(id: string, enabled: boolean) {
    await fetch(`${API_URL}/api/cameras/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });
    fetchCameras();
  }

  async function syncCameras() {
    setSyncing(true);
    try {
      await fetch(`${API_URL}/api/cameras/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await fetchCameras();
    } finally {
      setSyncing(false);
    }
  }

  async function saveZoneConfig(id: string) {
    const raw = zoneEdits[id] ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      alert("Invalid JSON — please fix the zone config before saving.");
      return;
    }

    setSavingZone(id);
    try {
      await fetch(`${API_URL}/api/cameras/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ zone_config: parsed }),
      });
      await fetchCameras();
    } finally {
      setSavingZone(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <Button onClick={syncCameras} disabled={syncing}>
          <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from Protect"}
        </Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Loading...</p>
      ) : cameras.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No cameras found. Click &quot;Sync from Protect&quot; to import cameras.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cameras.map((camera) => (
            <Card key={camera.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{camera.name}</CardTitle>
                  <button
                    onClick={() => toggleCamera(camera.id, !camera.enabled)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      camera.enabled
                        ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {camera.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {camera.protect_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last seen: {new Date(camera.created_at).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label className="text-xs text-muted-foreground">Zone Config (JSON)</Label>
                <textarea
                  value={zoneEdits[camera.id] ?? "{}"}
                  onChange={(e) =>
                    setZoneEdits((prev) => ({ ...prev, [camera.id]: e.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => saveZoneConfig(camera.id)}
                  disabled={savingZone === camera.id}
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {savingZone === camera.id ? "Saving..." : "Save Zone"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
