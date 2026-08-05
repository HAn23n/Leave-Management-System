import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TeamSelectForm } from "./team-select-form";

export default async function SelectTeamPage() {
  const appUser = await requireAppUser({ allowNoTeam: true });

  if (appUser.team_id) {
    redirect("/");
  }

  const supabase = createServerSupabaseClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-white p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-semibold text-foreground">ยินดีต้อนรับ</h1>
        <p className="text-sm text-muted-foreground">กรุณาเลือกทีมก่อนเริ่มใช้งานระบบ</p>
      </div>

      <TeamSelectForm teams={teams ?? []} />
    </main>
  );
}
