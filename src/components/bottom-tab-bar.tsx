"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItem } from "./nav-items";
import { NavIcon } from "./nav-icon";
import { cn } from "@/lib/utils";

// Mobile-only bottom tab bar, hidden on desktop (md breakpoint) in favor of the sidebar.
export function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const active = isNavItemActive(pathname, items, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <NavIcon icon={item.icon} className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
