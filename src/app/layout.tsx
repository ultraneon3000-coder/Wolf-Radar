import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { FavoritesProvider } from "@/lib/favorites-context";
import { SeenProvider } from "@/lib/seen-context";
import { DEMO_MODE } from "@/lib/demo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wolf Radar — Content-Radar für Ernährungs-Fehlinformationen",
  description:
    "Durchsucht YouTube nach einem Suchbegriff, prüft Videos auf Ernährungs-Fehlinformationen und liefert Urteil + Begründung als Ideenquelle für Reaktionsvideos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <FavoritesProvider>
          <SeenProvider>
            <AppShell demoMode={DEMO_MODE}>{children}</AppShell>
          </SeenProvider>
        </FavoritesProvider>
      </body>
    </html>
  );
}
