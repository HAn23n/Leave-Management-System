import { requireAppUser } from "@/lib/auth";
import { NicknameForm } from "./nickname-form";

export default async function NicknamePage() {
  await requireAppUser({ allowNoNickname: true });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-white p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-semibold text-foreground">ตั้งชื่อเล่นของคุณ</h1>
        <p className="text-sm text-muted-foreground">กรอกชื่อเล่นเพื่อใช้ในระบบ</p>
      </div>

      <NicknameForm />
    </main>
  );
}
