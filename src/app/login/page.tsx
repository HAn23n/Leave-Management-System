"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const CALLBACK_ERROR_TH: Record<string, string> = {
  missing_code: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  auth_failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  profile_create_failed: "สร้างบัญชีผู้ใช้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ",
  inactive: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.error ? (CALLBACK_ERROR_TH[searchParams.error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง") : null
  );

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Without this, Google silently re-authenticates whichever account is
        // already active in the browser instead of showing the account picker.
        queryParams: { prompt: "select_account" },
      },
    });
    if (signInError) {
      setError("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-16 w-16 rounded-2xl shadow-lg shadow-primary/25" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">ระบบบันทึกการลา</h1>
        <p className="text-muted-foreground">เข้าสู่ระบบด้วยบัญชี Google </p>
      </div>

      <Button
        onClick={handleGoogleLogin}
        disabled={loading}
        size="lg"
        className="w-full max-w-xs"
      >
        {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Google"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </main>
  );
}
