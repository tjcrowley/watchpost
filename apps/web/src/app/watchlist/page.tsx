"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch, getToken } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import { cn } from "@/src/lib/utils";

interface FaceEnrollment {
  id: string;
  source_path: string;
  quality: number;
  created_at: string;
}

interface Subject {
  id: string;
  display_name: string;
  list_type: "ban" | "watch" | "vip";
  reason: string | null;
  notes: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface SubjectDetail extends Subject {
  face_enrollments: FaceEnrollment[];
}

const LIST_COLORS: Record<string, string> = {
  ban: "bg-destructive/20 text-destructive",
  watch: "bg-yellow-500/20 text-yellow-400",
  vip: "bg-green-500/20 text-green-400",
};

const FILTERS = ["all", "ban", "watch", "vip"] as const;

export default function WatchlistPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ display_name: "", list_type: "ban", reason: "", notes: "", expires_at: "" });
  const [saving, setSaving] = useState(false);

  // Enrollment modal state
  const [enrollSubject, setEnrollSubject] = useState<Subject | null>(null);
  const [enrollFile, setEnrollFile] = useState<File | null>(null);
  const [enrollPreview, setEnrollPreview] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [enrollCount, setEnrollCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEnrollmentCounts = useCallback(async (subs: Subject[]) => {
    const counts: Record<string, number> = {};
    const results = await Promise.allSettled(
      subs.map((s) => apiFetch<SubjectDetail>(`/api/watchlist/${s.id}`))
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        counts[subs[i].id] = r.value.face_enrollments?.length ?? 0;
      }
    });
    setEnrollmentCounts(counts);
  }, []);

  async function load() {
    try {
      const data = await apiFetch<Subject[]>("/api/watchlist");
      setSubjects(data);
      loadEnrollmentCounts(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? subjects : subjects.filter((s) => s.list_type === filter);

  async function createSubject() {
    setSaving(true);
    try {
      await apiFetch("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({
          display_name: form.display_name,
          list_type: form.list_type,
          reason: form.reason || undefined,
          notes: form.notes || undefined,
          expires_at: form.expires_at || undefined,
        }),
      });
      setShowAddModal(false);
      setForm({ display_name: "", list_type: "ban", reason: "", notes: "", expires_at: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Subject) {
    await apiFetch(`/api/watchlist/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  }

  function openEnrollModal(s: Subject) {
    setEnrollSubject(s);
    setEnrollFile(null);
    setEnrollPreview(null);
    setEnrolling(false);
    setEnrollMsg(null);
    setEnrollCount(enrollmentCounts[s.id] ?? 0);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEnrollMsg({ type: "error", text: "Please select an image file" });
      return;
    }
    setEnrollFile(file);
    setEnrollMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => setEnrollPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  async function submitEnrollment() {
    if (!enrollSubject || !enrollFile) return;
    setEnrolling(true);
    setEnrollMsg(null);

    try {
      const formData = new FormData();
      formData.append("photo", enrollFile);
      const token = getToken();

      const res = await fetch(`/api/watchlist/${enrollSubject.id}/enroll`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setEnrollMsg({ type: "success", text: `Face enrolled successfully (quality: ${(data.quality * 100).toFixed(0)}%)` });
      setEnrollFile(null);
      setEnrollPreview(null);
      setEnrollCount((c) => c + 1);
      setEnrollmentCounts((prev) => ({
        ...prev,
        [enrollSubject.id]: (prev[enrollSubject.id] ?? 0) + 1,
      }));
    } catch (e) {
      setEnrollMsg({ type: "error", text: (e as Error).message });
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Watchlist</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            + Add Subject
          </button>
        </div>

        {error && <div className="text-destructive text-sm mb-4">{error}</div>}

        {/* Filter tabs */}
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
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {["Name", "Type", "Faces", "Reason", "Added", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No subjects</td></tr>
                )}
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{s.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium capitalize", LIST_COLORS[s.list_type])}>
                        {s.list_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-mono",
                        (enrollmentCounts[s.id] ?? 0) > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {enrollmentCounts[s.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-xs", s.active ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground")}>
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEnrollModal(s)}
                          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          Enroll Face
                        </button>
                        <button
                          onClick={() => toggleActive(s)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          {s.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Subject Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Subject</h2>
            <div className="flex flex-col gap-3">
              {[
                { label: "Name *", key: "display_name", type: "text" },
                { label: "Reason", key: "reason", type: "text" },
                { label: "Notes", key: "notes", type: "text" },
                { label: "Expires At", key: "expires_at", type: "datetime-local" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="text-sm text-muted-foreground block mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
              <div>
                <label className="text-sm text-muted-foreground block mb-1">List Type *</label>
                <select
                  value={form.list_type}
                  onChange={(e) => setForm({ ...form, list_type: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ban">Ban</option>
                  <option value="watch">Watch</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 border border-border rounded-md py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={createSubject}
                disabled={saving || !form.display_name}
                className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Face Modal */}
      {enrollSubject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Enroll Face</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {enrollSubject.display_name}
                  <span className={cn("ml-2 px-2 py-0.5 rounded text-xs font-medium capitalize", LIST_COLORS[enrollSubject.list_type])}>
                    {enrollSubject.list_type}
                  </span>
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                {enrollCount} face{enrollCount !== 1 ? "s" : ""} enrolled
              </span>
            </div>

            {/* Drag and drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              {enrollPreview ? (
                <div className="space-y-3">
                  <img
                    src={enrollPreview}
                    alt="Preview"
                    className="max-h-48 mx-auto rounded-md border border-border"
                  />
                  <p className="text-xs text-muted-foreground">{enrollFile?.name}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEnrollFile(null);
                      setEnrollPreview(null);
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-3xl mb-2 opacity-40">📸</p>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop a photo here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG supported</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Feedback */}
            {enrollMsg && (
              <div className={cn(
                "text-sm mt-3 px-3 py-2 rounded",
                enrollMsg.type === "success"
                  ? "bg-green-500/10 text-green-400"
                  : "bg-destructive/10 text-destructive"
              )}>
                {enrollMsg.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEnrollSubject(null)}
                className="flex-1 border border-border rounded-md py-2 text-sm hover:bg-accent"
              >
                Close
              </button>
              <button
                onClick={submitEnrollment}
                disabled={enrolling || !enrollFile}
                className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {enrolling ? "Enrolling..." : "Enroll"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
