"use client";

import { useEffect, useState } from "react";
import type { Camera } from "@watchpost/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCameras();
  }, []);

  async function fetchCameras() {
    setLoading(true);
    const token = localStorage.getItem("watchpost_token");
    try {
      const res = await fetch(`${API_URL}/api/cameras`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCameras(Array.isArray(data) ? data : []);
    } catch {
      console.error("Failed to fetch cameras");
    } finally {
      setLoading(false);
    }
  }

  async function toggleCamera(id: string, enabled: boolean) {
    const token = localStorage.getItem("watchpost_token");
    await fetch(`${API_URL}/api/cameras/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });
    fetchCameras();
  }

  async function syncCameras() {
    const token = localStorage.getItem("watchpost_token");
    await fetch(`${API_URL}/api/cameras/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchCameras();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <button
          onClick={syncCameras}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sync from Protect
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">Loading...</p>
        ) : cameras.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">
            No cameras found. Click &quot;Sync from Protect&quot; to import cameras.
          </p>
        ) : (
          cameras.map((camera) => (
            <div
              key={camera.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{camera.name}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {camera.protect_id}
                  </p>
                </div>
                <button
                  onClick={() => toggleCamera(camera.id, !camera.enabled)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    camera.enabled
                      ? "bg-green-500/20 text-green-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {camera.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
