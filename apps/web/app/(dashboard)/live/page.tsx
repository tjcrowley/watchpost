"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { format } from "date-fns";
import { Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WsMessage, DetectionEvent } from "@watchpost/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

interface LiveEvent extends DetectionEvent {
  match_display_name?: string;
  match_list_type?: string;
  camera_name?: string;
}

function matchBadgeVariant(type?: string) {
  switch (type) {
    case "ban": return "ban" as const;
    case "watch": return "watch" as const;
    case "vip": return "vip" as const;
    default: return "secondary" as const;
  }
}

export default function LivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const eventCount = events.length;

  const addFlash = useCallback((id: string) => {
    setFlashIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("watchpost_token");
    fetch(`${API_URL}/api/events?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setEvents(data.data ?? []))
      .catch(console.error);

    const ws = new WebSocket(`${WS_URL}/ws/events`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const parsed: WsMessage = JSON.parse(msg.data);
        if (parsed.type === "detection") {
          const event = parsed.payload as unknown as LiveEvent;
          setEvents((prev) => [event, ...prev].slice(0, 50));
          if (event.match_list_type === "ban") {
            addFlash(event.id);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [addFlash]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Live Feed</h1>
          {eventCount > 0 && (
            <Badge variant="default" className="text-xs">
              {eventCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-green-500 animate-pulse" : "bg-red-500"
            )}
          />
          <span className="text-sm text-muted-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">
            No events yet — watching cameras...
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Detection events will appear here in real-time
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card
              key={event.id}
              className={cn(
                "transition-all duration-300",
                event.match_list_type === "ban" && flashIds.has(event.id) &&
                  "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]",
                event.match_list_type === "ban" && !flashIds.has(event.id) &&
                  "border-red-500/30"
              )}
            >
              <CardContent className="flex items-start gap-4 p-4">
                {/* Snapshot thumbnail */}
                {event.snapshot_path ? (
                  <img
                    src={`${API_URL}${event.snapshot_path}`}
                    alt="Snapshot"
                    className="h-16 w-24 rounded-md object-cover bg-muted"
                  />
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded-md bg-muted">
                    <Radio className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}

                {/* Event details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{event.event_type}</span>
                      {event.camera_name && (
                        <span className="text-xs text-muted-foreground">
                          {event.camera_name}
                        </span>
                      )}
                    </div>
                    <Badge variant={matchBadgeVariant(event.match_list_type)}>
                      {event.match_list_type?.toUpperCase() ?? "NO MATCH"}
                    </Badge>
                  </div>

                  {event.match_display_name && (
                    <p className="mt-1 text-sm font-semibold">
                      {event.match_display_name}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{format(new Date(event.detected_at), "HH:mm:ss")}</span>
                    {event.match_confidence != null && (
                      <span>
                        {(event.match_confidence * 100).toFixed(1)}% confidence
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
