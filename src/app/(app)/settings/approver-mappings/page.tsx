import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { createApproverMapping, deleteApproverMapping } from "./actions";

export default async function ApproverMappingsSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: mappings }, { data: users }] = await Promise.all([
    supabase.from("approver_mappings").select("*").order("created_at"),
    supabase.from("users").select("id, full_name, role").eq("is_active", true).order("full_name"),
  ]);

  const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));
  const approverOptions = (users ?? []).filter((u) => u.role === "approver" || u.role === "admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground">สายอนุมัติ (override)</h1>
        <p className="text-sm text-muted-foreground">
          ใช้เฉพาะกรณีพิเศษที่ต้องการให้พนักงานคนหนึ่งส่งคำขอลาไปยังหัวหน้าคนอื่นที่ไม่ใช่หัวหน้าทีมตามปกติ
        </p>
      </div>

      <form action={createApproverMapping} className="flex flex-wrap gap-2">
        <select name="user_id" required className="h-10 flex-1 rounded-xl border border-input bg-background px-2 text-sm">
          <option value="">เลือกพนักงาน (ผู้ขอ)</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <select name="approver_id" required className="h-10 flex-1 rounded-xl border border-input bg-background px-2 text-sm">
          <option value="">เลือกผู้อนุมัติ</option>
          {approverOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <Button type="submit">เพิ่ม</Button>
      </form>

      <div className="flex flex-col gap-2">
        {(mappings ?? []).length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีการตั้งค่า override</p>
        )}
        {(mappings ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm">
            <span>
              {userMap.get(m.user_id) ?? "-"} → {userMap.get(m.approver_id) ?? "-"}
            </span>
            <form action={deleteApproverMapping}>
              <input type="hidden" name="id" value={m.id} />
              <Button type="submit" size="sm" variant="ghost">
                ลบ
              </Button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
