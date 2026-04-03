"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import React from "react";
import { cn } from "@/src/lib/utils";

interface Camera {
  id: string;
  name: string;
}

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

interface EventDetail {
  id: string;
  camera_id: string;
  event_type: string;
  detected_at: string;
  match_name: string | null;
  match_list_type: string | null;
  match_confidence: number | null;
  review_status: string;
  snapshot_url?: string;
  best_face_crop_url?: string;
}

interface EventsResponse {
  data: DetectionEvent[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_FILTERS = ["all", "pending", "confirmed", "dismissed"] as const;
const LIST_TYPE_FILTERS = ["all", "ban", "watch", "vip", "no match"] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-green-500/20 text-green-400",
  dismissed: "bg-muted text-muted-foreground",
};

const LIST_COLORS: Record<string, string> = {
  ban: "bg-red-500/20 text-red-400",
  watch: "bg-yellow-500/20 text-yellow-400",
  vip: "bg-blue-500/20 text-blue-400",
};

function confidenceBadge(c: number | null): { color: string; label: string } | null {
  if (c == null) return null;
  const pct = `${(c * 100).toFixed(0)}%`;
  if (c >= 0.85) return { color: "bg-red-500/20 text-red-400", label: pct };
  if (c >= 0.75) return { color: "bg-orange-500/20 text-orange-400", label: pct };
  if (c >= 0.5) return { color: "bg-yellow-500/20 text-yellow-400", label: pct };
  return { color: "bg-muted text-muted-foreground", label: pct };
}

export default function EventsPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [cameraFilter, setCameraFilter] = useState("");
  const [listTypeFilter, setListTypeFilter] = useState<(typeof LIST_TYPE_FILTERS)[number]>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<EventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraNames, setCameraNames] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const LIMIT = 25;

  // Load cameras and subjects for lookups
  useEffect(() => {
    (async () => {
      try {
        const [cams, subs] = await Promise.all([
          apiFetch<Camera[]>("/api/cameras"),
          apiFetch<{ id: string; display_name: string; list_type: string }[]>("/api/watchlist"),
        ]);
        setCameras(cams);
        const nameMap: Record<string, string> = {};
        cams.forEach((c) => { nameMap[c.id] = c.name; });
        setCameraNames(nameMap);
        const subMap: Record<string, string> = {};
        subs.forEach((s) => { subMap[s.display_name] = s.list_type; });
        setSubjects(subMap);
      } catch { /* handled by apiFetch */ }
    })();
  }, []);

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (cameraFilter) params.set("camera_id", cameraFilter);
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("to", new Date(dateTo + "T23:59:59").toISOString());
      const data = await apiFetch<EventsResponse>(`/api/events?${params}`);
      setEvents(data.data);
      setTotal(data.total);
      setOffset(off);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, cameraFilter, dateFrom, dateTo]);

  useEffect(() => { load(0); }, [load]);

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setExpandedDetail(null);
      return;
    }
    setExpanded(id);
    setLoadingDetail(true);
    try {
      const detail = await apiFetch<EventDetail>(`/api/events/${id}`);
      setExpandedDetail(detail);
    } catch {
      setExpandedDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function review(id: string, status: "confirmed" | "dismissed") {
    await apiFetch(`/api/events/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ review_status: status }),
    });
    load(offset);
  }

  // Client-side list type filtering
  const displayEvents = listTypeFilter === "all"
    ? events
    : events.filter((ev) => {
        if (listTypeFilter === "no match") return !ev.match_name;
        return ev.match_name && subjects[ev.match_name] === listTypeFilter;
      });

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Detection Events</h1>
          <span className="text-sm text-muted-foreground">{total} total</span>
        </div>

        {error && <div className="text-destructive text-sm mb-4">{error}</div>}

        {/* Filter Bar */}
        <div className="bg-card border border-border rounded-lg p-4 mb-4 space-y-3">
          {/* Row 1: Status tabs */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
            <div className="flex gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm capitalize transition-colors",
                    statusFilter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Other filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Camera</span>
              <select
                value={cameraFilter}
                onChange={(e) => setCameraFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All cameras</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Type</span>
              <div className="flex gap-1">
                {LIST_TYPE_FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setListTypeFilter(f)}
                    className={cn(
                      "px-2 py-1 rounded text-xs capitalize transition-colors",
                      listTypeFilter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {(cameraFilter || listTypeFilter !== "all" || dateFrom || dateTo) && (
              <button
                onClick={() => { setCameraFilter(""); setListTypeFilter("all"); setDateFrom(""); setDateTo(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Time", "Camera", "Type", "Match", "Confidence", "Status", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayEvents.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No events</td></tr>
                  )}
                  {displayEvents.map((ev) => {
                    const badge = confidenceBadge(ev.match_confidence);
                    const listType = ev.match_name ? subjects[ev.match_name] : null;

                    return (
                      <React.Fragment key={ev.id}>
                        <tr
                          className="border-t border-border hover:bg-accent/30 cursor-pointer"
                          onClick={() => toggleExpand(ev.id)}
                        >
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {new Date(ev.detected_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {cameraNames[ev.camera_id] ?? ev.camera_id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                              {ev.event_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {ev.match_name ?? <span className="text-muted-foreground">—</span>}
                              </span>
                              {listType && (
                                <span className={cn("px-1.5 py-0.5 rounded text-xs capitalize", LIST_COLORS[listType] ?? "bg-muted text-muted-foreground")}>
                                  {listType}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {badge ? (
                              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", badge.color)}>
                                {badge.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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

                        {/* Expanded Detail Row */}
                        {expanded === ev.id && (
                          <tr className="border-t border-border bg-muted/10">
                            <td colSpan={7} className="px-4 py-4">
                              {loadingDetail ? (
                                <p className="text-muted-foreground text-sm">Loading details...</p>
                              ) : expandedDetail ? (
                                <div className="flex gap-6 flex-wrap">
                                  {/* Snapshot */}
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Snapshot</p>
                                    {expandedDetail.snapshot_url ? (
                                      <img
                                        src={expandedDetail.snapshot_url}
                                        alt="Snapshot"
                                        className="max-h-56 rounded-md border border-border"
                                      />
                                    ) : (
                                      <div className="h-32 w-48 bg-gray-800 rounded-md flex items-center justify-center">
                                        <span className="text-xs text-muted-foreground">No snapshot</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Face crop */}
                                  {expandedDetail.best_face_crop_url && (
                                    <div className="space-y-2">
                                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Face Crop</p>
                                      <img
                                        src={expandedDetail.best_face_crop_url}
                                        alt="Face crop"
                                        className="max-h-56 rounded-md border border-border"
                                      />
                                    </div>
                                  )}

                                  {/* Match details */}
                                  <div className="space-y-2 min-w-48">
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Details</p>
                                    <div className="space-y-1.5 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Camera: </span>
                                        {cameraNames[expandedDetail.camera_id] ?? expandedDetail.camera_id}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Type: </span>
                                        <span className="capitalize">{expandedDetail.event_type}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Time: </span>
                                        {new Date(expandedDetail.detected_at).toLocaleString()}
                                      </div>
                                      {expandedDetail.match_name && (
                                        <>
                                          <div>
                                            <span className="text-muted-foreground">Match: </span>
                                            <span className="font-medium">{expandedDetail.match_name}</span>
                                            {expandedDetail.match_list_type && (
                                              <span className={cn("ml-2 px-1.5 py-0.5 rounded text-xs capitalize", LIST_COLORS[expandedDetail.match_list_type] ?? "bg-muted text-muted-foreground")}>
                                                {expandedDetail.match_list_type}
                                              </span>
                                            )}
                                          </div>
                                          {expandedDetail.match_confidence != null && (
                                            <div>
                                              <span className="text-muted-foreground">Confidence: </span>
                                              {(() => {
                                                const b = confidenceBadge(expandedDetail.match_confidence);
                                                return b ? (
                                                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium", b.color)}>{b.label}</span>
                                                ) : null;
                                              })()}
                                            </div>
                                          )}
                                        </>
                                      )}
                                      <div>
                                        <span className="text-muted-foreground">Status: </span>
                                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium capitalize", STATUS_COLORS[expandedDetail.review_status])}>
                                          {expandedDetail.review_status}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Review actions in expanded view */}
                                    {expandedDetail.review_status === "pending" && (
                                      <div className="flex gap-2 pt-2">
                                        <button
                                          onClick={() => review(expandedDetail.id, "confirmed")}
                                          className="text-sm px-3 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 font-medium"
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => review(expandedDetail.id, "dismissed")}
                                          className="text-sm px-3 py-1.5 rounded bg-muted text-muted-foreground hover:bg-accent font-medium"
                                        >
                                          Dismiss
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-sm">No details available</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center gap-3 mt-4 justify-end">
                <button
                  disabled={offset === 0}
                  onClick={() => load(offset - LIMIT)}
                  className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-accent"
                >
                  Prev
                </button>
                <span className="text-sm text-muted-foreground">
                  {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                </span>
                <button
                  disabled={offset + LIMIT >= total}
                  onClick={() => load(offset + LIMIT)}
                  className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-40 hover:bg-accent"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
