import { requireAppUser } from "@/lib/auth";

// Layout for pages that require an authenticated user with a team assigned.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAppUser();

  return <div className="flex flex-1 flex-col">{children}</div>;
}
