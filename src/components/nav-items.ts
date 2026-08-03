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
