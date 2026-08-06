import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ToastForm } from "@/components/toast-form";
import { DeleteButton } from "@/components/delete-button";
import { createTeam, renameTeam, setTeamActive, removeTeamLead, removePendingInvite, moveTeamLead } from "./actions";
import { AssignTeamLeadForm } from "./assign-team-lead-form";

export default async function TeamsSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: teams }, { data: teamLeads }, { data: users }, { data: pendingInvites }] = await Promise.all([
    supabase.from("teams").select("*").order("created_at"),
    supabase.from("team_leads").select("*"),
    supabase.from("users").select("id, email, team_id").eq("is_active", true).order("email"),
    supabase.from("pending_team_leads").select("*").order("created_at"),
  ]);

  const userMap = new Map((users ?? []).map((u) => [u.id, u.email]));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground">จัดการทีมและสายอนุมัติ</h1>
      </div>

      <ToastForm action={createTeam} successTitle="เพิ่มทีมแล้ว" resetOnSuccess className="flex gap-2">
        <Input name="name" placeholder="ชื่อทีมใหม่" required />
        <Button type="submit">เพิ่มทีม</Button>
      </ToastForm>

      <div className="flex flex-col gap-3">
        {(teams ?? []).map((team) => {
          const leads = (teamLeads ?? [])
            .filter((tl) => tl.team_id === team.id)
            .sort((a, b) => a.approval_order - b.approval_order);
          const pending = (pendingInvites ?? []).filter((p) => p.team_id === team.id);

          return (
            <Card key={team.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{team.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={team.is_active ? "success" : "secondary"}>
                    {team.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                  </Badge>
                  <ToastForm
                    action={setTeamActive}
                    successTitle={team.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว"}
                  >
                    <input type="hidden" name="id" value={team.id} />
                    <input type="hidden" name="is_active" value={(!team.is_active).toString()} />
                    <Button type="submit" size="sm" variant="outline">
                      {team.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                  </ToastForm>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <ToastForm action={renameTeam} successTitle="เปลี่ยนชื่อทีมแล้ว" className="flex gap-2">
                  <input type="hidden" name="id" value={team.id} />
                  <Input name="name" defaultValue={team.name} className="h-9 flex-1" />
                  <Button type="submit" size="sm" variant="outline">
                    เปลี่ยนชื่อทีม
                  </Button>
                </ToastForm>

                <p className="text-sm font-medium text-muted-foreground">หัวหน้าทีม (ตามลำดับอนุมัติ)</p>
                {leads.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีหัวหน้าทีม</p>}
                {leads.map((lead, index) => (
                  <div key={lead.id} className="flex items-center justify-between text-sm">
                    <span>
                      ลำดับ {index + 1}: {userMap.get(lead.user_id) ?? "-"}
                    </span>
                    <div className="flex items-center gap-1">
                      <ToastForm action={moveTeamLead} successTitle="ย้ายลำดับแล้ว">
                        <input type="hidden" name="id" value={lead.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button type="submit" size="sm" variant="ghost" disabled={index === 0} title="ขึ้น">
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                      </ToastForm>
                      <ToastForm action={moveTeamLead} successTitle="ย้ายลำดับแล้ว">
                        <input type="hidden" name="id" value={lead.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={index === leads.length - 1}
                          title="ลง"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </ToastForm>
                      <DeleteButton
                        action={removeTeamLead}
                        fields={{ id: lead.id }}
                        confirmTitle="เอาหัวหน้าทีมคนนี้ออก?"
                        confirmDescription={`${userMap.get(lead.user_id) ?? "-"} จะไม่ได้อยู่ในสายอนุมัติของทีมนี้อีก`}
                        successTitle="เอาออกแล้ว"
                        label="เอาออก"
                      />
                    </div>
                  </div>
                ))}

                {pending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      รอเข้าระบบครั้งแรก: {p.email} <Badge variant="outline">pending</Badge>
                    </span>
                    <DeleteButton
                      action={removePendingInvite}
                      fields={{ id: p.id }}
                      confirmTitle="ยกเลิกคำเชิญนี้?"
                      confirmDescription={`${p.email} จะไม่ถูกตั้งเป็นหัวหน้าทีมนี้อัตโนมัติเมื่อเข้าสู่ระบบครั้งแรก`}
                      successTitle="ยกเลิกคำเชิญแล้ว"
                      label="ยกเลิก"
                    />
                  </div>
                ))}

                <AssignTeamLeadForm teamId={team.id} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
