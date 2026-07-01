"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  useReadingSettings,
  FONTS,
  FONT_SIZES,
  type FontId,
  type FontSize,
} from "./reading-settings";

const nav = [
  { href: "/", label: "Feed", icon: "📰" },
  { href: "/read", label: "Read", icon: "✓" },
  { href: "/channels", label: "Channels", icon: "📺" },
  { href: "/search", label: "Search", icon: "🔍" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { font, fontSize, setFont, setFontSize } = useReadingSettings();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <Link href="/" className="text-lg font-bold tracking-tight">
          tubeReader
        </Link>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Font
          </label>
          <select
            value={font}
            onChange={(e) => setFont(e.target.value as FontId)}
            className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1 text-xs"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Size
          </label>
          <div className="flex gap-1 mt-1">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s as FontSize)}
                className={cn(
                  "flex-1 rounded px-1 py-0.5 text-xs transition-colors",
                  fontSize === s
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
