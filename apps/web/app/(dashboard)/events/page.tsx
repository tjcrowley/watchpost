"use client";

import { useEffect, useState } from "react";
import type { DetectionEvent, PaginatedResponse } from "@watchpost/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function EventsPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    fetchEvents();
  }, [page, filter]);

  async function fetchEvents() {
    setLoading(true);
    const token = localStorage.getItem("watchpost_token");
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (filter) params.set("review_status", filter);

    try {
      const res = await fetch(`${API_URL}/api/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: PaginatedResponse<DetectionEvent> = await res.json();
      setEvents(data.data);
      setTotalPages(data.total_pages);
    } catch {
      console.error("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }

  async function reviewEvent(id: string, status: "confirmed" | "dismissed") {
    const token = localStorage.getItem("watchpost_token");
    await fetch(`${API_URL}/api/events/${id}/review`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ review_status: status }),
    });
    fetchEvents();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Detection Events</h1>

        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Camera</th>
              <th className="px-4 py-3 text-left font-medium">Match</th>
              <th className="px-4 py-3 text-left font-medium">Confidence</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No events found.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(event.detected_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{event.event_type}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {event.camera_id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3">
                    {event.match_subject_id ? event.match_subject_id.slice(0, 8) + "..." : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {event.match_confidence != null
                      ? `${(event.match_confidence * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    {event.review_status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => reviewEvent(event.id, "confirmed")}
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => reviewEvent(event.id, "dismissed")}
                          className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
