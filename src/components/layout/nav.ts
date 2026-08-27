import { Newspaper, CheckCheck, Tv, Search, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/** Shared by the desktop sidebar and the mobile bottom tab bar. */
export const NAV: NavItem[] = [
  { href: "/", label: "Feed", Icon: Newspaper },
  { href: "/read", label: "Read", Icon: CheckCheck },
  { href: "/channels", label: "Channels", Icon: Tv },
  { href: "/search", label: "Search", Icon: Search },
];

/**
 * Which nav entry a pathname belongs to. Detail routes nest under their
 * section (/channels/12 → Channels) so the tab bar keeps a selection while
 * you're reading, but "/" only ever matches itself.
 */
export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
