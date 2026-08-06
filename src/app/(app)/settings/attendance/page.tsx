import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TimeSelect } from "./time-select";
import { updateAttendanceSettings } from "./actions";

export default async function AttendanceSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">เข้า-ออกงาน</h1>

      <Card>
        <CardHeader>
          <CardTitle>เวลาแจ้งเตือนและชั่วโมงทำงาน</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAttendanceSettings} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>เวลาแจ้งเตือนเช็คอิน</Label>
              <TimeSelect
                name="check_in_reminder_time"
                defaultValue={settings?.check_in_reminder_time?.slice(0, 5) ?? "08:30"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>เวลาแจ้งเตือนเช็คเอาท์</Label>
              <TimeSelect
                name="check_out_reminder_time"
                defaultValue={settings?.check_out_reminder_time?.slice(0, 5) ?? "17:30"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ชั่วโมงทำงานมาตรฐานต่อวัน</Label>
              <Input
                type="number"
                name="standard_work_hours"
                step="0.5"
                min="0"
                defaultValue={settings?.standard_work_hours ?? 8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>ชั่วโมงพักที่หักออกอัตโนมัติ</Label>
              <Input
                type="number"
                name="break_hours"
                step="0.5"
                min="0"
                defaultValue={settings?.break_hours ?? 1}
                required
              />
            </div>
            <Button type="submit">บันทึก</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
