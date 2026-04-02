"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, List, Users, Camera, Settings, LogOut, Shield } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/live", label: "Live Feed", icon: Radio },
  { href: "/events", label: "Events", icon: List },
  { href: "/watchlist", label: "Watchlist", icon: Users },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/settings", label: "Settings", icon: Settings },
];

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">WatchPost</h1>
              <p className="text-xs text-muted-foreground">Security Intelligence</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            {navItems.find((n) => n.href === pathname)?.label ?? "Dashboard"}
          </h2>
          <Button variant="ghost" size="sm" onClick={logout} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
