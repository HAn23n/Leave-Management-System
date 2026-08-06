import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SECTIONS = [
  { href: "/settings/teams", title: "ทีมและสายอนุมัติ", description: "เพิ่มทีม และกำหนดว่าใครอนุมัติทีมไหน" },
  { href: "/settings/users", title: "ผู้ใช้งานและสิทธิ์", description: "จัดการสิทธิ์และทีมของผู้ใช้งาน" },
  { href: "/settings/approver-mappings", title: "สายอนุมัติ (override)", description: "กำหนดผู้อนุมัติพิเศษเฉพาะราย" },
  { href: "/settings/leave-types", title: "ประเภทการลา", description: "จัดการประเภทการลาที่เลือกได้" },
  { href: "/settings/holidays", title: "วันหยุด", description: "จัดการวันหยุดนักขัตฤกษ์และวันหยุดบริษัท" },
  {
    href: "/settings/attendance",
    title: "เข้า-ออกงาน",
    description: "ตั้งเวลาแจ้งเตือนเช็คอิน/เช็คเอาท์ และชั่วโมงทำงาน",
  },
];

export default async function SettingsIndexPage() {
  await requireAdmin();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">ตั้งค่าระบบ</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition-colors hover:bg-accent/30">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
