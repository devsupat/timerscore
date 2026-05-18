import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real-time Competition Scoreboard",
  description: "High-contrast dynamic competition scoreboard powered by Next.js and Supabase Realtime.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased light">
      <body className="min-h-full flex flex-col bg-surface-bg text-on-surface">
        {children}
      </body>
    </html>
  );
}
