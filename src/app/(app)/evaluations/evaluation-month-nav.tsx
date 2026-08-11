"use client";

import { useRouter } from "next/navigation";
import { MonthYearPicker } from "@/components/month-year-picker";

export function EvaluationMonthNav({ period }: { period: string }) {
  const router = useRouter();
  return <MonthYearPicker value={period} onChange={(p) => router.push(`/evaluations?period=${p}`)} />;
}
