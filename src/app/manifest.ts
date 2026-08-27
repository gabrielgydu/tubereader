import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. The app is installed from a Tailscale
 * HTTPS origin (see README), which is what makes it eligible as a PWA at all —
 * "Add to Home Screen" needs a secure context.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tubeReader",
    short_name: "tubeReader",
    description: "Transcript reader and summarizer for YouTube, Instagram and SoundCloud",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches --background in the dark theme (oklch(0.145 0 0)); the app is
    // dark-only, so no light variant.
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Android/Chrome route native shares straight here. iOS ignores
    // share_target entirely — there, /share is reached by a Shortcut that
    // opens the same URL (see README).
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
