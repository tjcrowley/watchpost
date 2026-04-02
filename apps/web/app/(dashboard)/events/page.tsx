"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import type {
  DetectionEvent,
  PaginatedResponse,
  Camera,
} from "@watchpost/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken() {
  return localStorage.getItem("watchpost_token");
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getToken()}` };
}

function statusBadge(status: string) {
  if (status === "confirmed")
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">confirmed</Badge>;
  if (status === "dismissed")
    return <Badge variant="secondary">dismissed</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">pending</Badge>;
}

export default function EventsPage() {
  const [tab, setTab] = useState("all");
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Fetch cameras for the dropdown
  useEffect(() => {
    fetch(`${API_URL}/api/cameras`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setCameras(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: "20",
      offset: String((page - 1) * 20),
    });
    if (tab === "review") params.set("review_status", "pending");
    else if (statusFilter) params.set("review_status", statusFilter);
    if (cameraId) params.set("camera_id", cameraId);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    try {
      const res = await fetch(`${API_URL}/api/events?${params}`, {
        headers: authHeaders(),
      });
      const data: PaginatedResponse<DetectionEvent> = await res.json();
      setEvents(data.data ?? []);
      setTotalPages(data.total_pages ?? 1);
    } catch {
      console.error("Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }, [page, tab, statusFilter, cameraId, dateFrom, dateTo]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, cameraId, dateFrom, dateTo]);

  async function reviewEvent(id: string, review_status: "confirmed" | "dismissed") {
    await fetch(`${API_URL}/api/events/${id}/review`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ review_status }),
    });
    fetchEvents();
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function cameraName(id: string) {
    return cameras.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "...";
  }

  const filterBar = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 w-36"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Camera</Label>
        <select
          value={cameraId}
          onChange={(e) => setCameraId(e.target.value)}
          className="flex h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">All cameras</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {tab !== "review" && (
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-8 w-32 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      )}
    </div>
  );

  const table = (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Camera</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Match Name</th>
              <th className="px-4 py-3 text-left font-medium">Confidence %</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No events found.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <>
                  <tr
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => toggleExpand(event.id)}
                  >
                    <td className="px-2 py-3 text-muted-foreground">
                      {expandedId === event.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(event.detected_at), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3">{cameraName(event.camera_id)}</td>
                    <td className="px-4 py-3">{event.event_type}</td>
                    <td className="px-4 py-3">
                      {event.match_subject_id ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {event.match_confidence != null
                        ? `${(event.match_confidence * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(event.review_status)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {event.review_status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-green-400 hover:bg-green-500/20 hover:text-green-400"
                            onClick={() => reviewEvent(event.id, "confirmed")}
                          >
                            <Check className="h-3.5 w-3.5" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-muted-foreground hover:bg-muted"
                            onClick={() => reviewEvent(event.id, "dismissed")}
                          >
                            <X className="h-3.5 w-3.5" /> Dismiss
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail panel */}
                  {expandedId === event.id && (
                    <tr key={`${event.id}-detail`}>
                      <td colSpan={8} className="bg-muted/20 px-6 py-4">
                        <div className="flex gap-6">
                          {event.snapshot_path && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Snapshot
                              </p>
                              <img
                                src={`${API_URL}${event.snapshot_path}`}
                                alt="Snapshot"
                                className="h-40 rounded border border-border object-cover"
                              />
                            </div>
                          )}
                          {event.best_face_crop && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Face Crop
                              </p>
                              <img
                                src={`${API_URL}${event.best_face_crop}`}
                                alt="Face crop"
                                className="h-40 rounded border border-border object-cover"
                              />
                            </div>
                          )}
                          <div className="space-y-2 text-sm">
                            <p>
                              <span className="text-muted-foreground">Event ID:</span>{" "}
                              <span className="font-mono text-xs">{event.id}</span>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Camera:</span>{" "}
                              {cameraName(event.camera_id)}
                            </p>
                            {event.match_distance != null && (
                              <p>
                                <span className="text-muted-foreground">Distance:</span>{" "}
                                {event.match_distance.toFixed(4)}
                              </p>
                            )}
                            {event.reviewed_at && (
                              <p>
                                <span className="text-muted-foreground">Reviewed:</span>{" "}
                                {format(new Date(event.reviewed_at), "yyyy-MM-dd HH:mm")}
                              </p>
                            )}
                            {event.review_status === "pending" && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => reviewEvent(event.id, "confirmed")}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" /> Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => reviewEvent(event.id, "dismissed")}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" /> Dismiss
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          Next
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Detection Events</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="all">All Events</TabsTrigger>
          <TabsTrigger value="review">Review Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filterBar}
          {table}
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          {filterBar}
          {table}
        </TabsContent>
      </Tabs>
    </div>
  );
}
