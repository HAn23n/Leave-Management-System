import { requireApproverOrAdmin } from "@/lib/auth";
import { currentEvaluationPeriod, isEvaluationPeriodEditable } from "@/lib/date";
import { displayName } from "@/lib/users";
import { resolveEvaluationRoster, loadExistingEvaluations } from "@/lib/evaluations";
import { EvaluationRowForm } from "./evaluation-row-form";
import { EvaluationMonthNav } from "./evaluation-month-nav";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function EvaluationsPage({ searchParams }: { searchParams: { period?: string } }) {
  const appUser = await requireApproverOrAdmin();
  const period = searchParams.period && PERIOD_RE.test(searchParams.period) ? searchParams.period : currentEvaluationPeriod();
  const editable = appUser.role === "admin" || isEvaluationPeriodEditable(period);

  const roster = await resolveEvaluationRoster(appUser);
  const existingByUserId = await loadExistingEvaluations(
    roster.map((r) => r.id),
    period
  );

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-foreground">ประเมินผลรายเดือน</h1>
        <p className="text-sm text-muted-foreground">5 หัวข้อ หัวข้อละ 20% เฉลี่ยผ่านที่ 50%</p>
      </div>

      <EvaluationMonthNav period={period} />

      {!editable && (
        <p className="rounded-xl border border-border bg-accent/20 p-3 text-sm text-muted-foreground">
          ยังไม่ถึงเดือนนี้ ประเมินได้เมื่อเดือนนี้เริ่มแล้ว
        </p>
      )}

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีสมาชิกในทีมที่คุณดูแลให้ประเมิน</p>
      ) : (
        <div className="flex flex-col gap-3">
          {roster.map((member) => (
            <EvaluationRowForm
              key={member.id}
              userId={member.id}
              teamId={member.team_id}
              period={period}
              name={displayName(member)}
              existing={existingByUserId.get(member.id) ?? null}
              editable={editable}
              currentUserId={appUser.id}
              isAdmin={appUser.role === "admin"}
            />
          ))}
        </div>
      )}
    </main>
  );
}
