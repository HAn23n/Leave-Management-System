import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDateField } from "@/components/calendar-date-field";
import { createHoliday, deleteHoliday } from "./actions";

export default async function HolidaysSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { data: holidays } = await supabase.from("holidays").select("*").order("holiday_date");
  const holidayMap = new Map((holidays ?? []).map((h) => [h.holiday_date, h.name]));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">วันหยุด</h1>

      <form action={createHoliday} className="flex gap-2">
        <div className="w-40">
          <CalendarDateField name="holiday_date" holidays={holidayMap} />
        </div>
        <Input name="name" placeholder="ชื่อวันหยุด" required className="flex-1" />
        <Button type="submit">เพิ่ม</Button>
      </form>

      <div className="flex flex-col gap-2">
        {(holidays ?? []).map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
            <div>
              <p className="font-medium text-foreground">{h.name}</p>
              <p className="text-xs text-muted-foreground">{formatThaiDate(h.holiday_date, "long")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={h.source === "seed" ? "secondary" : "outline"}>
                {h.source === "seed" ? "ค่าเริ่มต้น" : "เพิ่มเอง"}
              </Badge>
              <form action={deleteHoliday}>
                <input type="hidden" name="id" value={h.id} />
                <Button type="submit" size="sm" variant="ghost">
                  ลบ
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
