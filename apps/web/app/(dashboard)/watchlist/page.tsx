"use client";

import { useEffect, useState, useRef, useCallback, type FormEvent, type DragEvent } from "react";
import type { Subject, PaginatedResponse, ListType } from "@watchpost/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Upload, Pencil, ShieldOff, ImageIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken() {
  return localStorage.getItem("watchpost_token");
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

export default function WatchlistPage() {
  const [tab, setTab] = useState<ListType>("ban");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Enroll dialog
  const [enrollSubject, setEnrollSubject] = useState<Subject | null>(null);
  const [enrollFile, setEnrollFile] = useState<File | null>(null);
  const [enrollPreview, setEnrollPreview] = useState<string | null>(null);
  const [enrollResult, setEnrollResult] = useState<{ quality: number; crop?: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deactivate confirmation
  const [deactivateSubject, setDeactivateSubject] = useState<Subject | null>(null);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/watchlist?list_type=${tab}&limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data: PaginatedResponse<Subject> = await res.json();
      setSubjects(data.data ?? []);
    } catch {
      console.error("Failed to fetch subjects");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // ─── Add / Edit ─────────────────────────────
  function openAdd() {
    setEditSubject(null);
    setDisplayName("");
    setReason("");
    setNotes("");
    setExpiresAt("");
    setShowAddDialog(true);
  }

  function openEdit(subject: Subject) {
    setEditSubject(subject);
    setDisplayName(subject.display_name);
    setReason(subject.reason ?? "");
    setNotes(subject.notes ?? "");
    setExpiresAt(subject.expires_at?.slice(0, 10) ?? "");
    setShowAddDialog(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      display_name: displayName,
      list_type: editSubject ? undefined : tab,
      reason: reason || undefined,
      notes: notes || undefined,
      expires_at: expiresAt || undefined,
    };

    if (editSubject) {
      await fetch(`${API_URL}/api/watchlist/${editSubject.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
    } else {
      await fetch(`${API_URL}/api/watchlist`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
    }

    setShowAddDialog(false);
    fetchSubjects();
  }

  // ─── Enroll Photo ──────────────────────────
  function openEnroll(subject: Subject) {
    setEnrollSubject(subject);
    setEnrollFile(null);
    setEnrollPreview(null);
    setEnrollResult(null);
    setEnrolling(false);
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setEnrollFile(file);
      setEnrollPreview(URL.createObjectURL(file));
      setEnrollResult(null);
    }
  }

  function handleFileSelect(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      setEnrollFile(file);
      setEnrollPreview(URL.createObjectURL(file));
      setEnrollResult(null);
    }
  }

  async function submitEnroll() {
    if (!enrollSubject || !enrollFile) return;
    setEnrolling(true);
    try {
      const formData = new FormData();
      formData.append("file", enrollFile);
      const res = await fetch(`${API_URL}/api/watchlist/${enrollSubject.id}/enroll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setEnrollResult({ quality: data.quality, crop: data.crop_path });
      } else {
        const err = await res.json();
        alert(`Enrollment failed: ${err.error}`);
      }
    } catch {
      alert("Failed to enroll face");
    } finally {
      setEnrolling(false);
    }
  }

  // ─── Deactivate ─────────────────────────────
  async function confirmDeactivate() {
    if (!deactivateSubject) return;
    await fetch(`${API_URL}/api/watchlist/${deactivateSubject.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ active: false }),
    });
    setDeactivateSubject(null);
    fetchSubjects();
  }

  // ─── Table ──────────────────────────────────
  function renderTable(items: Subject[]) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Added</th>
              <th className="px-4 py-3 text-left font-medium">Expires</th>
              <th className="px-4 py-3 text-left font-medium">Active</th>
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
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No subjects in this list. Click &quot;Add Person&quot; to get started.
                </td>
              </tr>
            ) : (
              items.map((subject) => (
                <tr key={subject.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{subject.display_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{subject.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(subject.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {subject.expires_at
                      ? new Date(subject.expires_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {subject.active ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-primary"
                        onClick={() => openEnroll(subject)}
                      >
                        <Upload className="h-3.5 w-3.5" /> Enroll Photo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1"
                        onClick={() => openEdit(subject)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      {subject.active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-destructive hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => setDeactivateSubject(subject)}
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const tabLabel: Record<ListType, string> = {
    ban: "Ban List",
    watch: "Watch List",
    vip: "VIP List",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add Person
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ListType)}>
        <TabsList>
          <TabsTrigger value="ban">Ban List</TabsTrigger>
          <TabsTrigger value="watch">Watch List</TabsTrigger>
          <TabsTrigger value="vip">VIP List</TabsTrigger>
        </TabsList>
        {(["ban", "watch", "vip"] as ListType[]).map((lt) => (
          <TabsContent key={lt} value={lt}>
            {renderTable(subjects)}
          </TabsContent>
        ))}
      </Tabs>

      {/* ─── Add / Edit Dialog ──────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSubject ? "Edit Person" : "Add Person"}</DialogTitle>
            <DialogDescription>
              {editSubject
                ? "Update the subject details."
                : `Add a new person to the ${tabLabel[tab]}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional"
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires">Expires At</Label>
              <Input
                id="expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">{editSubject ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Enroll Photo Dialog ────────────────── */}
      <Dialog open={!!enrollSubject} onOpenChange={(open) => !open && setEnrollSubject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll Photo</DialogTitle>
            <DialogDescription>
              Upload a photo of {enrollSubject?.display_name} for face recognition.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {!enrollResult ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              {enrollPreview ? (
                <img
                  src={enrollPreview}
                  alt="Preview"
                  className="mb-3 h-48 rounded border border-border object-cover"
                />
              ) : (
                <>
                  <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop an image here, or click to browse
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-center">
              {enrollResult.crop && (
                <img
                  src={`${API_URL}${enrollResult.crop}`}
                  alt="Face crop"
                  className="mx-auto h-40 rounded border border-border"
                />
              )}
              <p className="text-sm">
                Quality Score:{" "}
                <span className="font-semibold text-green-400">
                  {(enrollResult.quality * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollSubject(null)}>
              {enrollResult ? "Done" : "Cancel"}
            </Button>
            {!enrollResult && (
              <Button onClick={submitEnroll} disabled={!enrollFile || enrolling}>
                {enrolling ? "Enrolling..." : "Enroll"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Deactivate Confirmation ────────────── */}
      <Dialog open={!!deactivateSubject} onOpenChange={(open) => !open && setDeactivateSubject(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Subject</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <strong>{deactivateSubject?.display_name}</strong>? They will no longer
              trigger alerts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateSubject(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
