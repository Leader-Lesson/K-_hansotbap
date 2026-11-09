// 충돌 목록·상세: 규칙 ID · 법 조문 · 원문 근거 · 조정안(F4) · [조정 적용] · [3D로 보기]
// 판정은 서버 규칙이 한 것이고, 여기서는 보여 주고 사람이 고르게만 한다. 조정 적용은 원청만(서버가 403으로 막는다)
import { useState } from "react";
import { api } from "@/api/client";
import { GradeBadge, TypeBadge } from "@/components/ConflictBadge";
import { fmtDateTime, fmtRange } from "@/lib/format";
import type { AdjustmentCandidate, AdjustmentResult, ConflictRecord, Task, ViewerRole } from "@/types";

interface Props {
  records: ConflictRecord[];
  tasks: Task[];
  role: ViewerRole;
  onShow3D?: (taskId: string, record: ConflictRecord) => void;
  onAdjusted?: (result: AdjustmentResult) => void; // 적용·되돌리기 뒤 (refresh 가 true 면 화면을 새로고침한다)
  emptyText?: string;
}

export function ConflictList({ records, tasks, role, onShow3D, onAdjusted, emptyText = "판정된 충돌이 없습니다." }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const taskOf = (id: string) => tasks.find((t) => t.id === id);

  if (records.length === 0) return <p className="text-sm text-stone-500">{emptyText}</p>;

  return (
    <ul className="divide-y divide-stone-200 text-sm">
      {records.map((r) => {
        const c = r.conflict;
        const isOpen = openId === c.id;
        return (
          <li key={c.id} className="py-2">
            <button type="button" onClick={() => setOpenId(isOpen ? null : c.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <GradeBadge grade={c.grade} />
              <TypeBadge type={c.type} />
              <span className="font-medium">
                {c.task_ids.slice(0, 3).map((id) => {
                  const t = taskOf(id);
                  return t ? `${id} ${t.name}` : id;
                }).join(" × ")}
                {c.task_ids.length > 3 && <span className="text-stone-500"> 외 {c.task_ids.length - 3}건</span>}
              </span>
              <span className="text-xs text-stone-500">{fmtRange(c.window_start, c.window_end)}</span>
              <span className="text-xs text-stone-500">{c.rule_id}</span>
              {r.status === "adjusted" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">조정 적용됨</span>}
              {r.status === "resolved" && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">해소</span>}
              <span className="ml-auto text-xs text-stone-400">{isOpen ? "접기 ▲" : "상세 ▼"}</span>
            </button>
            {isOpen && (
              <ConflictDetail record={r} tasks={tasks} role={role} onShow3D={onShow3D} onAdjusted={onAdjusted} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ConflictDetail({ record: r, tasks, role, onShow3D, onAdjusted }: Omit<Props, "records" | "emptyText"> & { record: ConflictRecord }) {
  const c = r.conflict;
  const taskOf = (id: string) => tasks.find((t) => t.id === id);
  return (
    <div className="mt-2 grid gap-3 rounded bg-stone-50 p-3 text-xs">
      <div className="grid gap-1 sm:grid-cols-[6rem_1fr]">
        <span className="text-stone-500">판정 이유</span>
        <span>{c.reason}</span>
        <span className="text-stone-500">규칙 · 근거</span>
        <span>
          <b>{c.rule_id}</b> · {c.legal_basis}
        </span>
        <span className="text-stone-500">기간</span>
        <span>
          {fmtDateTime(c.window_start)} ~ {fmtDateTime(c.window_end)}
        </span>
        <span className="text-stone-500">관련 작업</span>
        <span className="flex flex-wrap gap-2">
          {c.task_ids.map((id) => {
            const t = taskOf(id);
            return (
              <span key={id} className="rounded bg-white px-2 py-0.5 ring-1 ring-stone-200">
                <b>{id}</b> {t ? `${t.contractor} · ${t.name} · ${fmtRange(t.start, t.end)}` : "(현재 일정에 없음)"}
                {onShow3D && t && (
                  <button type="button" onClick={() => onShow3D(id, r)} className="ml-2 text-sky-700 underline">
                    3D로 보기
                  </button>
                )}
              </span>
            );
          })}
        </span>
        {c.suggestion && (
          <>
            <span className="text-stone-500">규칙 조정안</span>
            <span>{c.suggestion}</span>
          </>
        )}
        {c.sources.length > 0 && (
          <>
            <span className="text-stone-500">원문 근거</span>
            <ul className="space-y-0.5">
              {c.sources.map((s, i) => (
                <li key={i} className="text-stone-700">
                  <span className="text-stone-400">
                    {s.file}
                    {s.locator ? ` · ${s.locator}` : ""}
                  </span>{" "}
                  "{s.text}"
                </li>
              ))}
            </ul>
          </>
        )}
        <span className="text-stone-500">판정 시각</span>
        <span>
          {fmtDateTime(r.judged_at)}
          {r.plan_id != null ? ` · 제출 #${r.plan_id}` : ""}
        </span>
      </div>
      {role.kind === "prime" && r.status !== "resolved" && <AdjustmentPanel record={r} tasks={tasks} onAdjusted={onAdjusted} />}
    </div>
  );
}

/** F4 조정안: 충돌을 열 때 후보를 부른다(충돌 한 건에 1~2초). 적용하면 재판정 결과(사라짐·새로 생김)를 보여 준다 */
function AdjustmentPanel({ record: r, tasks, onAdjusted }: { record: ConflictRecord; tasks: Task[]; onAdjusted?: (res: AdjustmentResult) => void }) {
  const c = r.conflict;
  const [candidates, setCandidates] = useState<AdjustmentCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidedBy, setDecidedBy] = useState(() => sessionStorage.getItem("hansotbap.decidedBy") ?? "");
  const [applying, setApplying] = useState<string | null>(null);
  const [result, setResult] = useState<AdjustmentResult | null>(null);
  const taskOf = (id: string) => tasks.find((t) => t.id === id);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCandidates(await api.adjustmentCandidates(c.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async (cand: AdjustmentCandidate) => {
    if (!decidedBy.trim()) {
      setError("적용한 책임자 이름을 적어 주세요 (이행 기록에 남습니다)");
      return;
    }
    sessionStorage.setItem("hansotbap.decidedBy", decidedBy.trim());
    setApplying(cand.id);
    setError(null);
    try {
      const res = await api.applyAdjustment({ conflict_id: c.id, candidate_id: cand.id, decided_by: decidedBy.trim() });
      setResult(res);
      onAdjusted?.(res);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("유효하지")) setCandidates(null); // 409: 후보 다시 조회
    } finally {
      setApplying(null);
    }
  };

  if (result) {
    const d = result.diff;
    return (
      <div className="rounded border border-emerald-300 bg-emerald-50 p-2">
        <b>조정 적용 완료</b> · 재판정 {Math.round(result.recheck_ms)}ms · {result.record.adjustment.decided_by}
        <div className="mt-1">사라진 충돌 {d.resolved.length}건{d.resolved.length ? `: ${d.resolved.map((x) => x.id).join(", ")}` : ""}</div>
        <div>새로 생긴 충돌 {d.introduced.length}건{d.introduced.length ? `: ${d.introduced.map((x) => `${x.id} (${x.grade})`).join(", ")}` : ""}</div>
        {d.grade_changed.length > 0 && <div>등급 변화: {d.grade_changed.map((g) => `${g.conflict_id} ${g.before}→${g.after}`).join(", ")}</div>}
      </div>
    );
  }

  const noCandidateHint =
    c.type === "sop_missing"
      ? "표준서 필수 단계 누락은 일정 이동으로 풀리지 않습니다. 협력사가 절차를 보완해 재제출해야 합니다."
      : c.task_ids.some((id) => taskOf(id)?.zone_id === "ALL")
        ? "전 구역에 걸친 작업은 위치를 정해 재제출해야 합니다."
        : "규칙이 낼 수 있는 일정 이동안이 없습니다. 협력사와 협의해 재제출합니다.";

  return (
    <div className="border-t border-stone-200 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <b>조정안 (F4)</b>
        {candidates === null && (
          <button type="button" onClick={load} disabled={loading} className="rounded bg-sky-700 px-2 py-1 font-medium text-white disabled:opacity-40">
            {loading ? "계산 중…" : "조정안 보기"}
          </button>
        )}
        <input
          value={decidedBy}
          onChange={(e) => setDecidedBy(e.target.value)}
          placeholder="적용 책임자 (필수)"
          className="rounded border border-stone-300 px-2 py-1"
        />
        <span className="text-stone-500">적용해도 작업을 승인·중지하지 않습니다. 원청의 조정 기록으로 남고 재판정합니다.</span>
      </div>
      {error && <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-2 text-red-700">{error}</pre>}
      {candidates && candidates.length === 0 && <p className="mt-2 text-stone-600">{noCandidateHint}</p>}
      {candidates && candidates.length > 0 && (
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {candidates.map((cand) => {
            const t = taskOf(cand.task_id);
            return (
              <li key={cand.id} className={`rounded border bg-white p-2 ${cand.recommended ? "border-emerald-400 ring-1 ring-emerald-200" : "border-stone-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {cand.recommended && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">추천</span>}
                  <b>
                    {cand.task_id} {t?.name ?? ""}
                  </b>
                  <span className="text-stone-500">일정 이동</span>
                </div>
                <div className="mt-1">
                  {fmtRange(cand.original_start, cand.original_end)} <span className="text-stone-400">→</span> <b>{fmtRange(cand.new_start, cand.new_end)}</b>
                </div>
                <p className="mt-1 text-stone-600">{cand.reason}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-stone-600">
                  <span>{cand.resolves ? "✅ 이 충돌 해소" : "⚠️ 이 충돌은 남음"}</span>
                  <span>새 충돌 {cand.new_conflict_ids.length}건{cand.new_conflict_ids.length ? ` (${cand.new_conflict_ids.join(", ")})` : ""}</span>
                  {cand.affected_successors.length > 0 && <span>영향 받는 후행 {cand.affected_successors.join(", ")}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => apply(cand)}
                  disabled={applying !== null}
                  className="mt-2 rounded bg-emerald-700 px-2 py-1 font-medium text-white disabled:opacity-40"
                >
                  {applying === cand.id ? "재판정 중…" : "조정 적용"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
