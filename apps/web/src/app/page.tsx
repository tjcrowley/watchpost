export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-2xl text-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-xl">👁</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">WatchPost</h1>
        </div>

        <p className="text-muted-foreground text-lg">
          Intelligent venue security platform for UniFi Protect deployments.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-4">
          {[
            { label: "Watchlist", href: "/watchlist", icon: "📋", desc: "Manage ban, watch & VIP lists" },
            { label: "Events", href: "/events", icon: "🎯", desc: "Review detection events" },
            { label: "Cameras", href: "/cameras", icon: "📷", desc: "Camera status & config" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5 hover:bg-accent transition-colors"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="font-semibold">{item.label}</span>
              <span className="text-sm text-muted-foreground">{item.desc}</span>
            </a>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          API running at{" "}
          <code className="text-primary">
            {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
          </code>
        </p>
      </div>
    </main>
  );
}
