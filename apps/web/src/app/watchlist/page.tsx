"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/src/lib/api";
import { Nav } from "@/src/components/nav";
import { cn } from "@/src/lib/utils";

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

const LIST_COLORS: Record<string, string> = {
  ban: "bg-destructive/20 text-destructive",
  watch: "bg-yellow-500/20 text-yellow-400",
  vip: "bg-green-500/20 text-green-400",
};

const FILTERS = ["all", "ban", "watch", "vip"] as const;

export default function WatchlistPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ display_name: "", list_type: "ban", reason: "", notes: "", expires_at: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await apiFetch<Subject[]>("/api/watchlist");
      setSubjects(data);
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
      setShowModal(false);
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

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Watchlist</h1>
          <button
            onClick={() => setShowModal(true)}
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
                  {["Name", "Type", "Reason", "Added", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No subjects</td></tr>
                )}
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{s.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium capitalize", LIST_COLORS[s.list_type])}>
                        {s.list_type}
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
                      <button
                        onClick={() => toggleActive(s)}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        {s.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Subject Modal */}
      {showModal && (
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
                onClick={() => setShowModal(false)}
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
    </div>
  );
}
