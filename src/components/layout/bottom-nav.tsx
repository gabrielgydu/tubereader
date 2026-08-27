"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, isNavActive } from "./nav";

/**
 * Mobile tab bar. Fixed to the bottom so it stays in thumb reach, and padded
 * by the home-indicator inset — the layout reserves matching space via the
 * `--bottom-nav-h` custom property so content can scroll clear of it.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-card/80 md:hidden">
      <div className="flex">
        {NAV.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <item.Icon
                className="size-5 shrink-0"
                strokeWidth={active ? 2.4 : 1.8}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
