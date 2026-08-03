import { requireAppUser } from "@/lib/auth";

// Layout สำหรับหน้าที่ต้อง login แล้วเท่านั้น (มีทีมแล้วด้วย)
// เนื้อหา nav/bottom-tab/sidebar จะเพิ่มในขั้น "layout + PWA" ถัดไป
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAppUser();

  return <div className="flex flex-1 flex-col">{children}</div>;
}
