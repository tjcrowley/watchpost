import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchPost — Venue Security Intelligence",
  description: "Intelligent venue security for UniFi Protect deployments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
