"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import { cn } from "@/src/lib/utils";

interface Camera {
  id: string;
  name: string;
  enabled: boolean;
}

interface DetectionEvent {
  id: string;
  camera_id: string;
  event_type: string;
  detected_at: string;
  match_name: string | null;
  match_confidence: number | null;
  review_status: "pending" | "confirmed" | "dismissed";
}

interface EventsResponse {
  data: DetectionEvent[];
  total: number;
  limit: number;
  offset: number;
}

interface Alert {
  id: string;
  status: "queued" | "sent" | "failed";
}

interface AlertsResponse {
  data: Alert[];
  total: number;
}

function confidenceColor(c: number): string {
  if (c >= 0.85) return "bg-red-500/20 text-red-400";
  if (c >= 0.75) return "bg-orange-500/20 text-orange-400";
  if (c >= 0.5) return "bg-yellow-500/20 text-yellow-400";
  return "bg-muted text-muted-foreground";
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<DetectionEvent[]>([]);
  const [recentMatches, setRecentMatches] = useState<DetectionEvent[]>([]);
  const [alertCounts, setAlertCounts] = useState({ sent: 0, queued: 0, failed: 0 });
  const [cameraNames, setCameraNames] = useState<Record<string, string>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekDay = now.getDay();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekDay).toISOString();

      const [camerasData, todayData, weekData, feedData, alertsData] = await Promise.all([
        apiFetch<Camera[]>("/api/cameras"),
        apiFetch<EventsResponse>(`/api/events?limit=1&from=${todayStart}`),
        apiFetch<EventsResponse>(`/api/events?limit=1&from=${weekStart}`),
        apiFetch<EventsResponse>("/api/events?limit=10"),
        apiFetch<AlertsResponse>("/api/alerts?limit=100"),
      ]);

      setCameras(camerasData);
      const nameMap: Record<string, string> = {};
      camerasData.forEach((c) => { nameMap[c.id] = c.name; });
      setCameraNames(nameMap);

      setTodayCount(todayData.total);
      setWeekCount(weekData.total);
      setRecentEvents(feedData.data);
      setRecentMatches(feedData.data.filter((e) => e.match_name).slice(0, 5));

      const counts = { sent: 0, queued: 0, failed: 0 };
      alertsData.data.forEach((a) => {
        if (a.status in counts) counts[a.status as keyof typeof counts]++;
      });
      setAlertCounts(counts);
    } catch {
      // If unauthorized, apiFetch redirects to login
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("watchpost_token");
    if (!token) { router.replace("/login"); return; }
    loadData();
    intervalRef.current = setInterval(loadData, 15000);
    return () => clearInterval(intervalRef.current);
  }, [router, loadData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const onlineCount = cameras.filter((c) => c.enabled).length;
  const offlineCount = cameras.length - onlineCount;

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground mb-1">Detections Today</p>
            <p className="text-3xl font-bold">{todayCount}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground mb-1">This Week</p>
            <p className="text-3xl font-bold">{weekCount}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground mb-1">Cameras</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">{onlineCount}</p>
              <span className="text-sm text-green-400">online</span>
              {offlineCount > 0 && (
                <span className="text-sm text-muted-foreground">/ {offlineCount} offline</span>
              )}
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground mb-1">Alerts</p>
            <div className="flex items-baseline gap-3">
              <span className="text-sm"><span className="text-green-400 font-semibold">{alertCounts.sent}</span> sent</span>
              <span className="text-sm"><span className="text-yellow-400 font-semibold">{alertCounts.queued}</span> pending</span>
              <span className="text-sm"><span className="text-red-400 font-semibold">{alertCounts.failed}</span> failed</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Detections Feed */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">Recent Detections</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {recentEvents.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground">No recent detections</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentEvents.map((ev) => (
                    <div key={ev.id} className="px-4 py-3 flex items-center gap-4 hover:bg-accent/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {cameraNames[ev.camera_id] ?? ev.camera_id.slice(0, 8)}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                            {ev.event_type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(ev.detected_at).toLocaleString()}
                        </p>
                      </div>
                      {ev.match_name && (
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">{ev.match_name}</p>
                          {ev.match_confidence != null && (
                            <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", confidenceColor(ev.match_confidence))}>
                              {(ev.match_confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded capitalize shrink-0",
                        ev.review_status === "confirmed" ? "bg-green-500/20 text-green-400" :
                        ev.review_status === "dismissed" ? "bg-muted text-muted-foreground" :
                        "bg-yellow-500/20 text-yellow-400"
                      )}>
                        {ev.review_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Matches */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Recent Matches</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {recentMatches.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground">No recent matches</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentMatches.map((ev) => (
                    <div key={ev.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{ev.match_name}</span>
                        {ev.match_confidence != null && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", confidenceColor(ev.match_confidence))}>
                            {(ev.match_confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {cameraNames[ev.camera_id] ?? ev.camera_id.slice(0, 8)} &middot; {new Date(ev.detected_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
