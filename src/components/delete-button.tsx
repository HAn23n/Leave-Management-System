"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";

/**
 * A trash-icon button that confirms before actually deleting anything —
 * the plain text "ลบ"/"เอาออก"/"ยกเลิก" buttons this replaces fired
 * immediately on click, no confirmation, no feedback either way.
 */
export function DeleteButton({
  action,
  fields,
  confirmTitle,
  confirmDescription,
  successTitle,
  label = "ลบ",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  confirmTitle: string;
  confirmDescription: string;
  successTitle: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setOpen(false);
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));

    startTransition(async () => {
      await action(formData);
      toast({ variant: "success", title: successTitle });
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setOpen(true)}
        aria-label={label}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={label}
        cancelLabel="ยกเลิก"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
