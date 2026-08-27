import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Source_Serif_4,
  Literata,
  IBM_Plex_Serif,
} from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ReadingSettingsProvider } from "@/components/layout/reading-settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "tubeReader",
  description:
    "Transcript reader and summarizer for YouTube, Instagram and SoundCloud",
  applicationName: "tubeReader",
  appleWebApp: {
    capable: true,
    title: "tubeReader",
    // "default" keeps the iOS status bar opaque and tinted with themeColor.
    // "black-translucent" is legacy and leaves a black band on iOS 18+.
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Stop iOS turning durations and view counts into tel: links.
  formatDetection: { telephone: false },
  other: {
    // `appleWebApp.capable` only emits the standardized
    // `mobile-web-app-capable`. iOS before 16.4 reads the manifest's
    // `display` not at all and this legacy name instead, so set it too —
    // without it, older iPhones open the installed icon in Safari chrome.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Standalone PWAs have no browser chrome to escape a stuck zoom, and the
  // in-app font-size control covers the real need.
  maximumScale: 1,
  userScalable: false,
  // Lets the layout paint into the notch/home-indicator areas; the header and
  // tab bar re-add the insets as padding.
  viewportFit: "cover",
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${sourceSerif.variable} ${literata.variable} ${ibmPlexSerif.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full">
        <ReadingSettingsProvider>
          <Sidebar />
          {/* min-w-0 so long transcript lines shrink the column instead of
              widening the page into a horizontal scroll on a phone. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader />
            {/* Bottom padding clears the fixed tab bar (h-[57px] + inset). */}
            <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
          </div>
          <BottomNav />
        </ReadingSettingsProvider>
      </body>
    </html>
  );
}
