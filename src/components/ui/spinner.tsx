import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={cn(
        "inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary",
        className
      )}
    />
  );
}
