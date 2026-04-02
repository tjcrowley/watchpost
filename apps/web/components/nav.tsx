"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/events", label: "Events" },
  { href: "/cameras", label: "Cameras" },
];

export function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-primary">
          <span>&#x1f441;</span>
          <span>WatchPost</span>
        </Link>
        <div className="ml-8 flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4">
          {user && (
            <span className="text-sm text-muted-foreground">{user.email}</span>
          )}
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
