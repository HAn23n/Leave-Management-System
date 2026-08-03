"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (signInError) {
      setError("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-white p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
          ล
        </div>
        <h1 className="text-2xl font-semibold text-foreground">ระบบบันทึกการลา</h1>
        <p className="text-muted-foreground">เข้าสู่ระบบด้วยบัญชี Google ขององค์กร</p>
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
