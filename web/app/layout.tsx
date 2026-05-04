import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fixmyiron — AI Mechanic for heavy equipment",
  description:
    "AI-powered diagnostics, troubleshooting, fault codes, and parts for heavy equipment fleets.",
};

export const viewport: Viewport = {
  themeColor: "#0a0d12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-equipment-950 text-zinc-100 font-sans">
        {children}
      </body>
    </html>
  );
}
