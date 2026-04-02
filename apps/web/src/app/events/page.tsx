"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import React from "react";
import { cn } from "@/src/lib/utils";

interface DetectionEvent {
  id: string;
  camera_id: string;
  event_type: string;
  detected_at: string;
  match_name: string | null;
  match_confidence: number | null;
  review_status: "pending" | "confirmed" | "dismissed";
  snapshot_url?: string;
}

interface EventsResponse {
  data: DetectionEvent[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-green-500/20 text-green-400",
  dismissed: "bg-muted text-muted-foreground",
};

const FILTERS = ["all", "pending", "confirmed", "dismissed"] as const;

export default function EventsPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const LIMIT = 25;

  async function load(off = 0, f = filter) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (f !== "all") params.set("status", f);
      const data = await apiFetch<EventsResponse>(`/api/events?${params}`);
      setEvents(data.data);
      setTotal(data.total);
      setOffset(off);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0, filter); }, [filter]);

  async function review(id: string, status: "confirmed" | "dismissed") {
    await apiFetch(`/api/events/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ review_status: status }),
    });
    load(offset, filter);
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Detection Events</h1>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>

        {error && <div className="text-destructive text-sm mb-4">{error}</div>}

        <div className="flex gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Time", "Camera", "Match", "Confidence", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No events</td></tr>
                  )}
                  {events.map((ev) => (
                    <React.Fragment key={ev.id}>
                      <tr
                        className="border-t border-border hover:bg-accent/30 cursor-pointer"
                        onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(ev.detected_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {ev.camera_id.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {ev.match_name ?? <span className="text-muted-foreground">Unknown</span>}
                        </td>
                        <td className="px-4 py-3">
                          {ev.match_confidence != null
                            ? `${(ev.match_confidence * 100).toFixed(0)}%`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium capitalize", STATUS_COLORS[ev.review_status])}>
                            {ev.review_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {ev.review_status === "pending" && (
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => review(ev.id, "confirmed")}
                                className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => review(ev.id, "dismissed")}
                                className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-accent"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expanded === ev.id && (
                        <tr key={`${ev.id}-expand`} className="border-t border-border bg-muted/10">
                          <td colSpan={6} className="px-4 py-4">
                            {ev.snapshot_url ? (
                              <img src={ev.snapshot_url} alt="Snapshot" className="max-h-64 rounded-md border border-border" />
                            ) : (
                              <p className="text-muted-foreground text-sm">No snapshot available</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center gap-3 mt-4 justify-end">
                <button
                  disabled={offset === 0}
                  onClick={() => load(offset - LIMIT, filter)}
                  className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-accent"
                >
                  ← Prev
                </button>
                <span className="text-sm text-muted-foreground">
                  {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                </span>
                <button
                  disabled={offset + LIMIT >= total}
                  onClick={() => load(offset + LIMIT, filter)}
                  className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-accent"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
