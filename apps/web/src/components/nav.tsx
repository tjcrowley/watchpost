"use client";

import { useRouter, usePathname } from "next/navigation";
import { clearAuth } from "@/src/lib/api";
import { cn } from "@/src/lib/utils";

const links = [
  { href: "/watchlist", label: "Watchlist", icon: "📋" },
  { href: "/events", label: "Events", icon: "🎯" },
  { href: "/cameras", label: "Cameras", icon: "📷" },
];

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();

  const user =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("watchpost_user") ?? "{}")
      : {};

  function logout() {
    clearAuth();
    router.push("/login");
  }

  return (
    <nav className="border-b border-border bg-card px-6 py-3 flex items-center gap-6">
      <a href="/" className="flex items-center gap-2 font-bold text-lg mr-4">
        <span>👁</span> WatchPost
      </a>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={cn(
            "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors",
            pathname === l.href
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <span>{l.icon}</span> {l.label}
        </a>
      ))}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <button
          onClick={logout}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
