"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import type { Subject, PaginatedResponse, ListType } from "@watchpost/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function WatchlistPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [listType, setListType] = useState<ListType>("watch");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchSubjects();
  }, []);

  async function fetchSubjects() {
    setLoading(true);
    const token = localStorage.getItem("watchpost_token");
    try {
      const res = await fetch(`${API_URL}/api/watchlist?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: PaginatedResponse<Subject> = await res.json();
      setSubjects(data.data);
    } catch {
      console.error("Failed to fetch subjects");
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditSubject(null);
    setDisplayName("");
    setListType("watch");
    setReason("");
    setNotes("");
    setShowModal(true);
  }

  function openEdit(subject: Subject) {
    setEditSubject(subject);
    setDisplayName(subject.display_name);
    setListType(subject.list_type);
    setReason(subject.reason ?? "");
    setNotes(subject.notes ?? "");
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("watchpost_token");
    const body = {
      display_name: displayName,
      list_type: listType,
      reason: reason || undefined,
      notes: notes || undefined,
    };

    if (editSubject) {
      await fetch(`${API_URL}/api/watchlist/${editSubject.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${API_URL}/api/watchlist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    setShowModal(false);
    fetchSubjects();
  }

  async function handleEnroll(subjectId: string) {
    const input = fileInputRef.current;
    if (!input) return;

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const token = localStorage.getItem("watchpost_token");
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`${API_URL}/api/watchlist/${subjectId}/enroll`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          alert(`Face enrolled! Quality score: ${(data.quality * 100).toFixed(1)}%`);
        } else {
          const err = await res.json();
          alert(`Enrollment failed: ${err.error}`);
        }
      } catch {
        alert("Failed to enroll face");
      }

      input.value = "";
    };
    input.click();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this subject from the watchlist?")) return;

    const token = localStorage.getItem("watchpost_token");
    await fetch(`${API_URL}/api/watchlist/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchSubjects();
  }

  function listTypeBadge(type: ListType) {
    const colors: Record<ListType, string> = {
      ban: "bg-red-500/20 text-red-400 border-red-500/30",
      watch: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      vip: "bg-green-500/20 text-green-400 border-green-500/30",
    };
    return (
      <span
        className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${colors[type]}`}
      >
        {type}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <button
          onClick={openAdd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add Subject
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">List</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Added</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : subjects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No subjects in watchlist. Click &quot;Add Subject&quot; to get started.
                </td>
              </tr>
            ) : (
              subjects.map((subject) => (
                <tr key={subject.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{subject.display_name}</td>
                  <td className="px-4 py-3">{listTypeBadge(subject.list_type)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {subject.reason ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        subject.active
                          ? "bg-green-500/20 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {subject.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(subject.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEnroll(subject.id)}
                        className="rounded bg-primary/20 px-2 py-1 text-xs text-primary hover:bg-primary/30"
                      >
                        Enroll Face
                      </button>
                      <button
                        onClick={() => openEdit(subject)}
                        className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(subject.id)}
                        className="rounded bg-destructive/20 px-2 py-1 text-xs text-destructive hover:bg-destructive/30"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">
              {editSubject ? "Edit Subject" : "Add Subject"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium">Display Name</label>
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">List Type</label>
                <select
                  value={listType}
                  onChange={(e) => setListType(e.target.value as ListType)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="ban">Ban</option>
                  <option value="watch">Watch</option>
                  <option value="vip">VIP</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Reason</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {editSubject ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
