import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLeaveType, setLeaveTypeActive } from "./actions";

export default async function LeaveTypesSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { data: leaveTypes } = await supabase.from("leave_types").select("*").order("created_at");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ประเภทการลา</h1>

      <form action={createLeaveType} className="flex gap-2">
        <Input name="name" placeholder="ชื่อประเภทการลา" required className="flex-1" />
        <input type="color" name="color" defaultValue="#c81e1e" className="h-11 w-14 rounded-md border border-input" />
        <Button type="submit">เพิ่ม</Button>
      </form>

      <div className="flex flex-col gap-2">
        {(leaveTypes ?? []).map((lt) => (
          <div key={lt.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: lt.color }} />
              <span className="font-medium text-foreground">{lt.name}</span>
              <Badge variant={lt.is_active ? "success" : "secondary"}>
                {lt.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
              </Badge>
            </div>
            <form action={setLeaveTypeActive}>
              <input type="hidden" name="id" value={lt.id} />
              <input type="hidden" name="is_active" value={(!lt.is_active).toString()} />
              <Button type="submit" size="sm" variant="outline">
                {lt.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
              </Button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
