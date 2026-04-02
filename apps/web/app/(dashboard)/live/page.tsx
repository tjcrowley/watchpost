"use client";

import { useEffect, useRef, useState } from "react";
import type { WsMessage, DetectionEvent } from "@watchpost/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

interface LiveEvent extends DetectionEvent {
  match_display_name?: string;
  match_list_type?: string;
}

export default function LivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Fetch recent events
    const token = localStorage.getItem("watchpost_token");
    fetch(`${API_URL}/api/events?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setEvents(data.data ?? []))
      .catch(console.error);

    // Connect WebSocket
    const ws = new WebSocket(`${WS_URL}/api/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const parsed: WsMessage = JSON.parse(msg.data);
        if (parsed.type === "detection") {
          setEvents((prev) => [parsed.payload as unknown as LiveEvent, ...prev].slice(0, 50));
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  function listTypeColor(type?: string): string {
    switch (type) {
      case "ban":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "watch":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "vip":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live Feed</h1>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm text-muted-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div
            key={event.id}
            className={`rounded-lg border p-4 transition-all ${
              event.match_list_type === "ban"
                ? "animate-pulse border-red-500/50 bg-red-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">
                  {event.event_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.detected_at).toLocaleTimeString()}
                </p>
              </div>

              {event.match_list_type && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${listTypeColor(event.match_list_type)}`}
                >
                  {event.match_list_type}
                </span>
              )}
            </div>

            {event.match_display_name && (
              <p className="mt-2 text-sm font-semibold">
                {event.match_display_name}
              </p>
            )}

            {event.match_confidence != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Confidence: {(event.match_confidence * 100).toFixed(1)}%
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  event.review_status === "confirmed"
                    ? "bg-green-500/20 text-green-400"
                    : event.review_status === "dismissed"
                      ? "bg-muted text-muted-foreground"
                      : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {event.review_status}
              </span>
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No detection events yet. Events will appear here in real-time.
          </div>
        )}
      </div>
    </div>
  );
}
