"use client";

import { usePathname } from "next/navigation";
import { QueryProvider } from "@/lib/query";
import { AuthProvider } from "@/lib/auth";
import { Nav } from "@/components/nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <QueryProvider>
      <AuthProvider>
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </AuthProvider>
    </QueryProvider>
  );
}
