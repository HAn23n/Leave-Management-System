import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface NagerHoliday {
  date: string; // "yyyy-MM-dd"
  localName: string;
  types: string[];
}

/**
 * Runs yearly (see vercel.json's crons) to pre-populate next year's Thai
 * public holidays from date.nager.at, so a leave request spanning a year
 * boundary (e.g. Dec -> Jan) isn't missing the new year's holidays.
 *
 * Only fills gaps (upsert + ignoreDuplicates on holiday_date) — never
 * overwrites a row an admin already entered. Nager's data is strongest for
 * fixed-date holidays; lunar Buddhist holidays and cabinet-resolution
 * substitution days may be missing or wrong and still need an admin to
 * verify/add them via Settings, same as the original hardcoded 2026 seed.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "invalid_year" }, { status: 400 });
  }

  const upstream = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TH`);
  if (!upstream.ok) {
    return NextResponse.json({ error: "upstream_fetch_failed", status: upstream.status }, { status: 502 });
  }

  const holidays = (await upstream.json()) as NagerHoliday[];
  const rows = holidays
    .filter((h) => h.types.includes("Public"))
    .map((h) => ({ holiday_date: h.date, name: h.localName, source: "api" as const }));

  if (rows.length === 0) {
    return NextResponse.json({ year, fetched: 0, inserted: 0 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("holidays")
    .upsert(rows, { onConflict: "holiday_date", ignoreDuplicates: true })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ year, fetched: rows.length, inserted: data?.length ?? 0 });
}
