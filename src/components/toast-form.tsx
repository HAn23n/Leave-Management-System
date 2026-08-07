"use client";

import { useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

/**
 * Drop-in replacement for a plain `<form action={serverAction}>` — same
 * children/inputs, but intercepts the submit to show a success toast and
 * refresh the page afterward. Every settings page used to submit straight
 * to the server action with no client-side feedback at all: the change
 * (or a failure) only became visible once the revalidated data happened
 * to redraw, which read as "did that actually do anything?".
 */
export function ToastForm({
  action,
  successTitle,
  className,
  resetOnSuccess = false,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  successTitle: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await action(formData);
      } catch (err) {
        toast({
          variant: "destructive",
          title: err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        });
        return;
      }
      toast({ variant: "success", title: successTitle });
      if (resetOnSuccess) form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className={className} aria-busy={pending} data-pending={pending || undefined}>
      {children}
    </form>
  );
}
