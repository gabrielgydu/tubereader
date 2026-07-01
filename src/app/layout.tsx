import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Source_Serif_4,
  Literata,
  IBM_Plex_Serif,
} from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
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
  description: "YouTube transcript reader and summarizer",
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
      <body className="min-h-full flex">
        <ReadingSettingsProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </ReadingSettingsProvider>
      </body>
    </html>
  );
}
