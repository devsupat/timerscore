import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real-time Competition Scoreboard",
  description: "High-contrast dynamic competition scoreboard powered by Next.js and Supabase Realtime.",
  icons: {
    icon: "https://i.ibb.co.com/8m5k2px/Logo-Kota-Tangerang.png",
    shortcut: "https://i.ibb.co.com/8m5k2px/Logo-Kota-Tangerang.png",
    apple: "https://i.ibb.co.com/8m5k2px/Logo-Kota-Tangerang.png",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased light" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-surface-bg text-on-surface">
        {children}
      </body>
    </html>
  );
}
