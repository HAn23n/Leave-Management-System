"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItem } from "./nav-items";
import { NavIcon } from "./nav-icon";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

// Desktop-only sidebar, hidden on mobile in favor of the bottom tab bar.
export function SidebarNav({ items, userLabel }: { items: NavItem[]; userLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <Logo className="h-8 w-8 rounded-xl shadow-sm shadow-primary/30" />
        <span className="text-sm font-semibold text-foreground">ระบบบันทึกการลา</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const active = isNavItemActive(pathname, items, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-foreground hover:bg-accent/50"
              )}
            >
              <NavIcon icon={item.icon} className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 text-xs text-muted-foreground">{userLabel}</div>
    </aside>
  );
}
