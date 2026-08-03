import { requireAppUser } from "@/lib/auth";
import { getSidebarNavItems } from "@/components/nav-items";
import { SidebarNav } from "@/components/sidebar-nav";
import { BottomTabBar } from "@/components/bottom-tab-bar";

const ROLE_LABEL: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  approver: "หัวหน้าทีม",
  user: "พนักงาน",
};

// Layout for pages that require an authenticated user with a team assigned.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const appUser = await requireAppUser();

  return (
    <div className="flex min-h-full flex-1">
      <SidebarNav
        items={getSidebarNavItems(appUser.role)}
        userLabel={`${appUser.full_name} · ${ROLE_LABEL[appUser.role]}`}
      />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
      <BottomTabBar />
    </div>
  );
}
