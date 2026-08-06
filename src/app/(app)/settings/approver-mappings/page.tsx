import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastForm } from "@/components/toast-form";
import { DeleteButton } from "@/components/delete-button";
import { createApproverMapping, deleteApproverMapping } from "./actions";

export default async function ApproverMappingsSettingsPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: mappings }, { data: users }] = await Promise.all([
    supabase.from("approver_mappings").select("*").order("created_at"),
    supabase.from("users").select("id, email, role").eq("is_active", true).order("email"),
  ]);

  const userMap = new Map((users ?? []).map((u) => [u.id, u.email]));
  const approverOptions = (users ?? []).filter((u) => u.role === "approver" || u.role === "admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground">สายอนุมัติ (override)</h1>
        <p className="text-sm text-muted-foreground">
          ใช้เฉพาะกรณีพิเศษที่ต้องการให้พนักงานคนหนึ่งส่งคำขอลาไปยังหัวหน้าคนอื่นที่ไม่ใช่หัวหน้าทีมตามปกติ
        </p>
      </div>

      <ToastForm action={createApproverMapping} successTitle="เพิ่มสายอนุมัติแล้ว" className="flex flex-wrap gap-2">
        <Select name="user_id" required>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="เลือกพนักงาน (ผู้ขอ)" />
          </SelectTrigger>
          <SelectContent>
            {(users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select name="approver_id" required>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="เลือกผู้อนุมัติ" />
          </SelectTrigger>
          <SelectContent>
            {approverOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit">เพิ่ม</Button>
      </ToastForm>

      <div className="flex flex-col gap-2">
        {(mappings ?? []).length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีการตั้งค่า override</p>
        )}
        {(mappings ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-3 text-sm">
            <span>
              {userMap.get(m.user_id) ?? "-"} → {userMap.get(m.approver_id) ?? "-"}
            </span>
            <DeleteButton
              action={deleteApproverMapping}
              fields={{ id: m.id }}
              confirmTitle="ลบสายอนุมัตินี้?"
              confirmDescription={`${userMap.get(m.user_id) ?? "-"} จะไม่ส่งคำขอลาไปยัง ${userMap.get(m.approver_id) ?? "-"} อีก`}
              successTitle="ลบสายอนุมัติแล้ว"
            />
          </div>
        ))}
      </div>
    </main>
  );
}
