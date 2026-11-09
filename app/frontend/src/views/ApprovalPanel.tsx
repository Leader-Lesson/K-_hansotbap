// 원청 승인(F5): 협력사가 제출한 계획서를 승인하기 전에 ① 다른 작업과의 겹침(금지·조건부) ② 출입 금지 구역 안 작업
// ③ 이미 승인된 작업에 미치는 위험 ④ 표준서 필수 단계 누락을 보여 주고, 금지·출입 금지 구역이 남아 있으면 승인 버튼을 막는다.
// 판정은 서버 규칙(F2)이 하고 승인 가능 여부도 서버가 다시 확인한다(여기 버튼 비활성화는 안내일 뿐). 승인된 작업만 3D에 확정으로 들어간다
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { GradeBadge, TypeBadge } from "@/components/ConflictBadge";
import { fmtDateTime, fmtRange, HAZARD_LABEL } from "@/lib/format";
import { usePerson } from "@/lib/person";
import type { ApprovalCheck, Conflict, PlanRecord, PlanStatus, Task, Zone } from "@/types";

interface Props {
  plans: PlanRecord[];
  tasks: Task[];
  zones: Zone[];
  onDecided: () => void; // 승인·반려 뒤 다시 불러오기
  onShow3D?: (taskId: string, date: string) => void;
  onShowConflict?: (conflictId: string) => void;
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { pending: "승인 대기", approved: "승인됨", rejected: "반려" };
export const PLAN_STATUS_CLASS: Record<PlanStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

export function PlanStatusChip({ status }: { status: PlanStatus }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${PLAN_STATUS_CLASS[status]}`}>{PLAN_STATUS_LABEL[status]}</span>;
}

export function ApprovalPanel({ plans, tasks, zones, onDecided, onShow3D, onShowConflict }: Props) {
  const pending = [...plans].filter((p) => p.status === "pending").sort((a, b) => a.id - b.id);
  const decided = [...plans].filter((p) => p.status !== "pending").sort((a, b) => b.id - a.id).slice(0, 8);
  const [openId, setOpenId] = useState<number | null>(pending[0]?.id ?? null);
  const [check, setCheck] = useState<ApprovalCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = usePerson();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;
  const taskOf = (id: string) => tasks.find((t) => t.id === id) ?? check?.tasks.find((t) => t.id === id);

  useEffect(() => {
    if (openId == null && pending[0]) setOpenId(pending[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  useEffect(() => {
    if (openId == null) {
      setCheck(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .approvalCheck(openId)
      .then((c) => alive && setCheck(c))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [openId, plans]);

  const decide = async (kind: "approve" | "reject") => {
    if (!check) return;
    if (!person.trim()) {
      setError("확인한 원청 책임자 이름을 적어 주세요 (이행 기록에 남습니다)");
      return;
    }
    if (kind === "reject" && !note.trim()) {
      setError("반려 사유를 적어 주세요 — 협력사가 보고 수정 계획서를 냅니다");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const body = { decided_by: person.trim(), note: note.trim() || null };
      if (kind === "approve") await api.approvePlan(check.plan.id, body);
      else await api.rejectPlan(check.plan.id, body);
      setNote("");
      onDecided();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const conflictRow = (c: Conflict) => (
    <li key={c.id} className="rounded bg-stone-50 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <GradeBadge grade={c.grade} />
        <TypeBadge type={c.type} />
        <b>{c.rule_id}</b>
        <span className="text-stone-600">
          {c.task_ids.map((id) => {
            const t = taskOf(id);
            return (
              <span key={id} className="mr-1 inline-block rounded bg-white px-1.5 py-0.5 ring-1 ring-stone-200">
                {id} {t ? `${t.contractor} · ${t.name}` : ""}
                {t?.plan_status === "approved" || (t && t.plan_status == null) ? <span className="ml-1 text-green-700">(승인된 작업)</span> : null}
              </span>
            );
          })}
        </span>
        <span className="ml-auto text-stone-500">
          {fmtDateTime(c.window_start)} ~ {fmtDateTime(c.window_end)}
        </span>
      </div>
      <p className="mt-1 text-stone-700">{c.reason}</p>
      <div className="mt-1 flex flex-wrap gap-3 text-stone-500">
        <span>{c.legal_basis}</span>
        {c.suggestion && <span className="text-ok">조정 방향: {c.suggestion}</span>}
        {onShowConflict && (
          <button type="button" onClick={() => onShowConflict(c.id)} className="text-brand underline">
            충돌 상세·조정안
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr]">
      <aside className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-3 text-sm">
          <b>승인 대기 {pending.length}건</b>
          <p className="mt-1 text-xs text-stone-500">협력사가 제출한 계획서. 겹침·출입 금지 구역을 확인하고 승인해야 3D·현황에 확정으로 들어갑니다.</p>
        </div>
        <ul className="divide-y divide-stone-100 text-sm">
          {pending.length === 0 && <li className="p-3 text-stone-500">승인을 기다리는 계획서가 없습니다.</li>}
          {pending.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className={`w-full px-3 py-2 text-left hover:bg-stone-50 ${p.id === openId ? "bg-brand-soft" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-stone-500">#{p.id}</span>
                  <b>{p.contractor}</b>
                  <PlanStatusChip status={p.status} />
                </div>
                <div className="truncate text-xs text-stone-600">{p.file}</div>
                <div className="text-xs text-stone-500">
                  v{p.version} · 작업 {p.task_count}건 · {fmtDateTime(p.submitted_at)}
                  {p.submitted_by ? ` · ${p.submitted_by}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {decided.length > 0 && (
          <div className="border-t border-stone-200 p-3 text-xs">
            <div className="mb-1 font-semibold text-stone-600">최근 처리</div>
            <ul className="space-y-1">
              {decided.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-1 text-stone-600">
                  <span className="font-mono text-stone-400">#{p.id}</span>
                  <span>{p.contractor}</span>
                  <PlanStatusChip status={p.status} />
                  <span className="text-stone-400">{p.decided_at ? fmtDateTime(p.decided_at) : ""} {p.decided_by ?? ""}</span>
                  {p.decision_note && <span className="w-full pl-5 text-stone-500">{p.decision_note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <section className="min-h-[320px] rounded-lg border border-stone-200 bg-white p-4 text-sm">
        {openId == null ? (
          <p className="text-stone-500">왼쪽에서 계획서를 고르면 승인 전 점검 결과가 여기에 나옵니다.</p>
        ) : loading && !check ? (
          <p className="text-stone-500">점검 중…</p>
        ) : !check ? (
          <p className="text-red-700">{error ?? "점검 결과를 불러오지 못했습니다."}</p>
        ) : (
          <div className="grid gap-4">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">
                #{check.plan.id} {check.plan.contractor} — {check.plan.file}
              </h3>
              <PlanStatusChip status={check.plan.status} />
              {check.plan.status === "pending" ? (
                <span className={`ml-auto rounded px-2 py-1 text-xs font-semibold ${check.can_approve ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {check.can_approve ? "승인 가능 — 금지·출입 금지 구역 없음" : "승인 불가"}
                </span>
              ) : (
                <span className="ml-auto rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
                  처리 완료 · {PLAN_STATUS_LABEL[check.plan.status]} {check.plan.decided_by ?? ""} {check.plan.decided_at ? fmtDateTime(check.plan.decided_at) : ""}
                </span>
              )}
            </header>

            {check.blockers.length > 0 && (
              <ul className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                {check.blockers.map((b) => (
                  <li key={b}>⛔ {b}</li>
                ))}
                <li className="mt-1 text-red-700">금지 판정은 충돌 상세에서 조정안을 적용하거나, 협력사에 반려해 일정을 고쳐 다시 받습니다.</li>
              </ul>
            )}
            {check.warnings.length > 0 && (
              <ul className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                {check.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}

            <div>
              <h4 className="mb-1 font-semibold">이 계획서의 작업 {check.tasks.length}건</h4>
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="p-1.5">ID</th>
                    <th className="p-1.5">작업</th>
                    <th className="p-1.5">구역</th>
                    <th className="p-1.5">기간</th>
                    <th className="p-1.5">인원</th>
                    <th className="p-1.5">위험작업</th>
                    <th className="p-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {check.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="p-1.5 font-semibold">{t.id}</td>
                      <td className="p-1.5">{t.name}</td>
                      <td className="p-1.5">{zoneName(t.zone_id)}</td>
                      <td className="whitespace-nowrap p-1.5">{fmtRange(t.start, t.end)}</td>
                      <td className="p-1.5">{t.crew != null ? `${t.crew}명` : "—"}</td>
                      <td className="p-1.5">{t.hazards.map((h) => HAZARD_LABEL[h]).join(", ") || "—"}</td>
                      <td className="p-1.5">
                        {onShow3D && (
                          <button type="button" onClick={() => onShow3D(t.id, t.start.slice(0, 10))} className="text-brand underline">
                            3D
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <section className="rounded border border-stone-200 p-2">
                <h4 className="mb-1 font-semibold">
                  ① 작업 위치·시간 겹침 <span className="text-xs font-normal text-stone-500">금지 {check.prohibited.length} · 조건부 {check.conditional.length}</span>
                </h4>
                {check.prohibited.length + check.conditional.length === 0 ? (
                  <p className="text-xs text-stone-500">다른 작업과 겹치는 판정이 없습니다.</p>
                ) : (
                  <ul className="space-y-1">{[...check.prohibited, ...check.conditional].map(conflictRow)}</ul>
                )}
              </section>
              <section className="rounded border border-stone-200 p-2">
                <h4 className="mb-1 font-semibold">
                  ② 출입 금지 구역 안 작업 <span className="text-xs font-normal text-stone-500">{check.in_restricted_zone.length}건</span>
                </h4>
                {check.in_restricted_zone.length === 0 ? (
                  <p className="text-xs text-stone-500">다른 작업들의 금지 판정으로 막힌 구역·시간 안에서 일하는 작업이 없습니다.</p>
                ) : (
                  <ul className="space-y-1">
                    {check.in_restricted_zone.map((r) => (
                      <li key={`${r.task_id}:${r.by_conflict_id}`} className="rounded bg-red-50 p-2 text-xs text-red-900">
                        <b>
                          {r.task_id} {r.task_name}
                        </b>{" "}
                        — {zoneName(r.zone_id)} {fmtDateTime(r.window_start)} ~ {fmtDateTime(r.window_end)}
                        <div className="mt-1 text-red-800">
                          막은 판정 <b>{r.by_conflict_id}</b> · {r.rule_id} · {r.legal_basis}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded border border-stone-200 p-2">
                <h4 className="mb-1 font-semibold">
                  ③ 이미 승인된 작업에 미치는 위험 <span className="text-xs font-normal text-stone-500">{check.endangers_approved.length}건</span>
                </h4>
                {check.endangers_approved.length === 0 ? (
                  <p className="text-xs text-stone-500">승인된 작업(또는 원청 기준 일정)과 겹치는 금지·조건부 판정이 없습니다.</p>
                ) : (
                  <ul className="space-y-1">{check.endangers_approved.map(conflictRow)}</ul>
                )}
              </section>
              <section className="rounded border border-stone-200 p-2">
                <h4 className="mb-1 font-semibold">
                  ④ 표준서 필수 단계 누락 <span className="text-xs font-normal text-stone-500">{check.defects.length}건</span>
                </h4>
                {check.defects.length === 0 ? (
                  <p className="text-xs text-stone-500">주 표준서의 핵심 단계가 계획서 절차에 모두 적혀 있습니다.</p>
                ) : (
                  <ul className="space-y-1">{check.defects.map(conflictRow)}</ul>
                )}
              </section>
            </div>

            {check.plan.status === "pending" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-stone-50 p-3 text-xs">
                <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="확인한 원청 책임자 (필수)" className="rounded border border-stone-300 bg-white px-2 py-1" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 · 반려 사유 (반려 시 필수)" className="min-w-[240px] flex-1 rounded border border-stone-300 bg-white px-2 py-1" />
                <button
                  type="button"
                  onClick={() => decide("approve")}
                  disabled={!check.can_approve || busy !== null}
                  title={check.can_approve ? "승인하면 이 작업들이 3D·현황에 확정으로 들어갑니다" : check.blockers.join("\n")}
                  className="rounded bg-green-700 px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === "approve" ? "승인 중…" : "승인 → 3D 반영"}
                </button>
                <button type="button" onClick={() => decide("reject")} disabled={busy !== null} className="rounded border border-red-400 bg-white px-3 py-1.5 font-semibold text-red-700 disabled:opacity-40">
                  {busy === "reject" ? "반려 중…" : "반려 (수정 계획서 요청)"}
                </button>
                <span className="text-stone-500">시스템은 승인하지 않습니다. 점검 결과를 보고 원청 책임자가 누릅니다. 결정은 이행 기록(제64조)에 남습니다.</span>
                {error && <span className="w-full text-red-700">{error}</span>}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
