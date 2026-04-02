"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, AlertTriangle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken() {
  return localStorage.getItem("watchpost_token");
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
  site_id: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Alert config
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Match threshold
  const [threshold, setThreshold] = useState(0.4);

  useEffect(() => {
    const token = getToken();
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function testWebhook() {
    setTestingWebhook(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/alerts/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });
      if (res.ok) {
        setTestResult({ ok: true, message: "Test alert sent successfully!" });
      } else {
        const err = await res.json();
        setTestResult({ ok: false, message: err.error ?? "Failed to send test alert" });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error — could not reach API" });
    } finally {
      setTestingWebhook(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("watchpost_token");
    window.location.href = "/login";
  }

  if (loading) {
    return <p className="py-8 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* ─── Site Info ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Site Info</CardTitle>
          <CardDescription>Your site configuration details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site Name</span>
            <span className="font-mono text-sm">WatchPost</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Site ID</span>
            <span className="font-mono text-xs">{user?.site_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-medium uppercase text-primary">
              {user?.role}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Alert Config ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Configuration</CardTitle>
          <CardDescription>Configure webhook notifications for detection events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook">Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhook"
                type="url"
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="https://hooks.slack.com/services/..."
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={testWebhook}
                disabled={!webhookUrl || testingWebhook}
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                {testingWebhook ? "Sending..." : "Test"}
              </Button>
            </div>
            {testResult && (
              <p
                className={`text-sm ${
                  testResult.ok ? "text-green-400" : "text-destructive"
                }`}
              >
                {testResult.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Match Threshold ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Match Threshold</CardTitle>
          <CardDescription>
            Minimum confidence score to consider a face match. Lower values are more sensitive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.3}
              max={0.8}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-14 rounded border border-border bg-background px-2 py-1 text-center font-mono text-sm">
              {threshold.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Recommended: 0.40. Range: 0.30 (sensitive) — 0.80 (strict).
          </p>
        </CardContent>
      </Card>

      {/* ─── Danger Zone ───────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions. Site management features coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="destructive" onClick={handleLogout}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
