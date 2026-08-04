import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Spinner />
      <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
    </main>
  );
}
