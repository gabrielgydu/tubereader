"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, isNavActive } from "./nav";
import { ReadingControls } from "./reading-controls";

/** Desktop chrome. Below `md` the mobile header + bottom tab bar take over. */
export function Sidebar() {
  const pathname = usePathname();

  // Sticky, not overflow-scrolled: the document itself scrolls now (the mobile
  // header needs that for `position: sticky`), so the sidebar pins to the
  // viewport instead of riding the page down.
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:sticky md:top-0 md:flex md:h-screen">
      <div className="border-b border-border p-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          tubeReader
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isNavActive(item, pathname) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isNavActive(item, pathname)
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <item.Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <ReadingControls />
      </div>
    </aside>
  );
}
