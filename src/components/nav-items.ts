import type { UserRole } from "@/lib/supabase/types";

export interface NavItem {
  href: string;
  label: string;
  icon: "home" | "search" | "plus-circle" | "bar-chart" | "user" | "settings";
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/leave-requests", label: "ค้นหา", icon: "search" },
  { href: "/leave-requests/new", label: "บันทึกลา", icon: "plus-circle" },
  { href: "/reports", label: "รายงาน", icon: "bar-chart" },
  { href: "/profile", label: "โปรไฟล์", icon: "user" },
];

export function getSidebarNavItems(role: UserRole): NavItem[] {
  const items = [...PRIMARY_NAV_ITEMS];
  if (role === "admin") {
    items.splice(4, 0, { href: "/settings", label: "ตั้งค่า", icon: "settings" });
  }
  return items;
}

/**
 * Two nav items can both be valid prefix matches for the same path (e.g.
 * "/leave-requests" and "/leave-requests/new" both match "/leave-requests/new"),
 * which used to highlight both at once. Only the item with the longest
 * matching href — the most specific one — should ever be considered active.
 */
export function isNavItemActive(pathname: string, items: NavItem[], item: NavItem): boolean {
  const matches = items.filter((i) =>
    i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)
  );
  if (matches.length === 0) return false;

  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
  return best.href === item.href;
}
