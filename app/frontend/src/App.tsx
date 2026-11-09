import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { AdjustmentResult, ConflictRecord, OverlapCandidate, PlanRecord, PlanSubmitResult, SopMatch, Task, ViewerRole, Zone } from "@/types";
import { ContractorView } from "@/views/ContractorView";
import { DATE_KEY, PrimeView } from "@/views/PrimeView";

const ROLE_KEY = "hansotbap.role"; // 판정 후 강제 새로고침을 해도 고른 역할이 남게
const NOTICE_KEY = "hansotbap.notice"; // 새로고침 뒤에 보여 줄 제출·조정 결과

function loadRole(): ViewerRole {
  try {
    const v = sessionStorage.getItem(ROLE_KEY);
    return v ? (JSON.parse(v) as ViewerRole) : { kind: "prime" };
  } catch {
    return { kind: "prime" };
  }
}

export default function App() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapCandidate[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [sopMatches, setSopMatches] = useState<SopMatch[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [allContractors, setAllContractors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<ViewerRole>(loadRole);
  const [notice, setNotice] = useState<string | null>(() => sessionStorage.getItem(NOTICE_KEY));

  const contractor = role.kind === "contractor" ? role.contractor : undefined;

  // 역할에 맞게 서버에서 걸러 받는다 (협력사는 자기 업체 데이터만). 작업·겹침은 F5(PR #34)가 contractor 를 받기 시작하면 걸러진다
  const load = useCallback(async () => {
    try {
      const [z, t, o, c, s, p] = await Promise.all([
        api.zones(),
        api.tasks(),
        api.overlaps(),
        api.conflicts({ contractor }),
        api.sopMatches(contractor),
        api.plans(contractor),
      ]);
      setZones(z);
      setTasks(t);
      setOverlaps(o);
      setConflicts(c);
      setSopMatches(s);
      setPlans(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [contractor]);

  useEffect(() => {
    void load();
  }, [load]);

  // 역할 선택 목록은 전체 일정에서 뽑는다 (협력사로 좁혀 받은 뒤에도 다른 업체로 바꿀 수 있게)
  useEffect(() => {
    api.tasks().then((t) => setAllContractors([...new Set(t.map((x) => x.contractor))].filter((c) => c.startsWith("가상-")).sort())).catch(() => {});
  }, []);

  useEffect(() => {
    if (notice) sessionStorage.removeItem(NOTICE_KEY);
  }, [notice]);

  const changeRole = (r: ViewerRole) => {
    sessionStorage.setItem(ROLE_KEY, JSON.stringify(r));
    setRole(r);
  };

  // 기획서: 판정 후 화면을 한 번 강제 새로고침한다. 결과 요약은 새로고침 뒤에 띄운다
  const finishWithRefresh = (text: string, refresh: boolean) => {
    if (refresh) {
      sessionStorage.setItem(NOTICE_KEY, text);
      window.location.reload();
    } else {
      setNotice(text);
      void load();
    }
  };

  const onSubmitted = (r: PlanSubmitResult) => {
    const intro = r.diff?.introduced ?? [];
    const gone = r.diff?.resolved ?? [];
    const parts = [
      `${r.plan.contractor} 계획서 v${r.plan.version} 제출 · 작업 ${r.plan.task_count}건 · 판정 ${r.recheck_ms != null ? `${Math.round(r.recheck_ms)}ms` : ""}`,
      `현재 충돌 ${r.conflicts.length}건`,
      intro.length ? `새로 생긴 충돌 ${intro.length}건: ${intro.map((c) => `${c.id} (${c.grade})`).join(", ")}` : "새로 생긴 충돌 없음",
      gone.length ? `해소된 충돌 ${gone.length}건: ${gone.map((c) => c.id).join(", ")}` : "",
    ].filter(Boolean);
    sessionStorage.removeItem(DATE_KEY); // 원청 화면이 이 제출이 낸 충돌 날짜로 가게
    finishWithRefresh(parts.join(" · "), r.refresh);
  };

  const onAdjusted = (r: AdjustmentResult) => {
    const a = r.record.adjustment;
    const text = `조정 적용: ${a.task_id} 일정 이동 (${a.decided_by}) · 사라진 충돌 ${r.diff.resolved.length}건 · 새로 생긴 충돌 ${r.diff.introduced.length}건 · 현재 충돌 ${r.conflicts.length}건`;
    // 적용 결과 카드를 잠깐 보여 준 뒤 새로고침 (기획서: 판정 후 강제 새로고침)
    window.setTimeout(() => finishWithRefresh(text, r.refresh), 1500);
  };

  const contractors = useMemo(() => {
    const fromTasks = [...new Set(tasks.map((t) => t.contractor))].filter((c) => c.startsWith("가상-"));
    return [...new Set([...allContractors, ...fromTasks])].sort();
  }, [tasks, allContractors]);
  const roleValue = role.kind === "prime" ? "prime" : role.contractor;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">🍲 한솥밥</h1>
          <p className="text-sm text-stone-600">고로 개수 협력사 동시작업 간섭 감지·예보</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            합성 데이터
          </span>
          <select
            value={roleValue}
            onChange={(e) =>
              changeRole(
                e.target.value === "prime"
                  ? { kind: "prime" }
                  : { kind: "contractor", contractor: e.target.value },
              )
            }
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
          >
            <option value="prime">원청</option>
            {contractors.map((c) => (
              <option key={c} value={c}>
                협력사: {c}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          API 연결 실패: {error} — 백엔드(8000)가 켜져 있는지 확인하세요.
        </p>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs text-emerald-700 underline">
            닫기
          </button>
        </div>
      )}

      {role.kind === "prime" ? (
        <PrimeView zones={zones} tasks={tasks} overlaps={overlaps} conflicts={conflicts} sopMatches={sopMatches} plans={plans} onAdjusted={onAdjusted} />
      ) : (
        <ContractorView
          contractor={role.contractor}
          zones={zones}
          tasks={tasks}
          conflicts={conflicts}
          sopMatches={sopMatches}
          onSubmitted={onSubmitted}
        />
      )}
    </div>
  );
}
